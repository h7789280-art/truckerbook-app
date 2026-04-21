// Depreciation strategy calculator for Owner-Operators.
// Implements 4 strategies (standard MACRS, Section 179, Section 179 + Bonus, Bonus only).
// Also provides back-compat helpers so legacy records (depreciation_type = macrs5/macrs7/section179)
// continue to produce identical per-year deductions downstream in TaxSummaryTab / TaxMeterWidget.

import {
  MACRS_5_YEAR_HALF_YEAR,
  MACRS_7_YEAR_HALF_YEAR,
  ASSET_CLASS_TO_RECOVERY_PERIOD,
  getMacrsRates,
  getMacrsRatesForAssetClass,
  getBonusRate,
  getSection179Limit,
  SECTION_179_2026,
  STRATEGY,
  ASSET_CLASS,
} from './macrs-constants'

// Legacy Section 179 year-1 cap used by records saved before the OBBBA/2026 update.
// Kept ONLY for back-compat reading of rows that predate the strategy migration.
const LEGACY_SECTION_179_LIMIT = 1_160_000

/**
 * Build the full year-by-year depreciation schedule for the chosen strategy.
 *
 * @param {object} params
 * @param {string} params.strategy          - One of STRATEGY.*
 * @param {string} params.assetClass        - One of ASSET_CLASS.*
 * @param {number} params.costBasis         - Purchase price (before salvage). We use cost basis for MACRS (no salvage on MACRS).
 * @param {number} [params.salvageValue=0]  - Kept only for legacy compatibility; MACRS ignores it.
 * @param {number} [params.section179Amount=0]
 * @param {number} [params.bonusRate=0]     - 0..1 (decimal rate, e.g. 1.00 for 100%)
 * @param {Date|string} params.placedInServiceDate
 * @param {number} [params.businessUsePct=100]
 * @returns {{ schedule: Array<{year:number, rate:number, deduction:number, remaining:number, note?:string}>, year1:number, totalOverLife:number, depreciableBasis:number, section179Applied:number, bonusApplied:number, macrsBasis:number }}
 */
export function buildStrategySchedule({
  strategy,
  assetClass,
  costBasis,
  salvageValue = 0,
  section179Amount = 0,
  bonusRate = 0,
  placedInServiceDate,
  businessUsePct = 100,
}) {
  const price = Math.max(Number(costBasis) || 0, 0)
  const salvage = Math.max(Number(salvageValue) || 0, 0)
  const businessFraction = Math.max(Math.min(Number(businessUsePct) || 100, 100), 0) / 100
  // IRS: if business use <100%, only the business-use portion is depreciable.
  const businessBasis = (price - salvage) * businessFraction

  const purchaseDate = placedInServiceDate
    ? (placedInServiceDate instanceof Date ? placedInServiceDate : new Date(placedInServiceDate))
    : new Date()
  const purchaseYear = Number.isFinite(purchaseDate.getUTCFullYear())
    ? purchaseDate.getUTCFullYear()
    : new Date().getUTCFullYear()

  const rates = getMacrsRatesForAssetClass(assetClass)

  let s179 = 0
  let bonus = 0
  let macrsBasis = businessBasis

  if (strategy === STRATEGY.STANDARD_MACRS) {
    // Pure MACRS on business basis.
  } else if (strategy === STRATEGY.SECTION_179) {
    s179 = Math.max(0, Math.min(Number(section179Amount) || 0, businessBasis))
    macrsBasis = businessBasis - s179
  } else if (strategy === STRATEGY.SECTION_179_BONUS) {
    s179 = Math.max(0, Math.min(Number(section179Amount) || 0, businessBasis))
    const afterS179 = businessBasis - s179
    bonus = afterS179 * (Number(bonusRate) || 0)
    macrsBasis = afterS179 - bonus
  } else if (strategy === STRATEGY.BONUS_ONLY) {
    bonus = businessBasis * (Number(bonusRate) || 0)
    macrsBasis = businessBasis - bonus
  }

  const schedule = []
  const year1Extras = s179 + bonus

  if (macrsBasis > 0.005 && rates.length > 0) {
    let cumulative = 0
    for (let i = 0; i < rates.length; i++) {
      const rate = rates[i]
      const deduction = macrsBasis * rate + (i === 0 ? year1Extras : 0)
      cumulative += deduction
      schedule.push({
        year: purchaseYear + i,
        rate: rate * 100,
        deduction,
        remaining: Math.max(businessBasis - cumulative, 0),
      })
    }
  } else if (year1Extras > 0) {
    // Section 179 / Bonus consumed the whole basis in year 1.
    schedule.push({
      year: purchaseYear,
      rate: 100,
      deduction: year1Extras,
      remaining: Math.max(businessBasis - year1Extras, 0),
    })
  }

  const year1 = schedule[0]?.deduction || 0
  const totalOverLife = schedule.reduce((sum, r) => sum + r.deduction, 0)

  return {
    schedule,
    year1,
    totalOverLife,
    depreciableBasis: businessBasis,
    section179Applied: s179,
    bonusApplied: bonus,
    macrsBasis,
  }
}

/**
 * Compare all four strategies side-by-side.
 * Returns an array ordered by ALL_STRATEGIES.
 *
 * @param {object} params
 * @param {string} params.assetClass
 * @param {number} params.costBasis
 * @param {number} [params.salvageValue=0]
 * @param {number} [params.section179Amount=0] - Amount to test in S179 / S179+Bonus options.
 * @param {number} [params.bonusRate=0]         - Applicable bonus rate for the placed-in-service date.
 * @param {Date|string} params.placedInServiceDate
 * @param {number} [params.businessUsePct=100]
 * @param {(netProfit:number)=>{ totalTax:number }} params.taxOfNet
 *        Callable that returns total tax (federal + SE + state) for a given net profit.
 *        Used to compute accurate savings (delta between tax on net-before-deduction vs net-after).
 * @param {number} params.netProfitBeforeDeduction - Estimated Schedule C net profit BEFORE the deduction applies.
 * @returns {Array<{ key:string, year1:number, totalOverLife:number, year1TaxSavings:number, year3TaxSavings:number, year3Cumulative:number, note?:string }>}
 */
export function compareStrategies({
  assetClass,
  costBasis,
  salvageValue = 0,
  section179Amount = 0,
  bonusRate = 0,
  placedInServiceDate,
  businessUsePct = 100,
  taxOfNet,
  netProfitBeforeDeduction,
}) {
  const strategies = [
    STRATEGY.STANDARD_MACRS,
    STRATEGY.SECTION_179,
    STRATEGY.SECTION_179_BONUS,
    STRATEGY.BONUS_ONLY,
  ]

  return strategies.map(strategy => {
    const { schedule, year1, totalOverLife } = buildStrategySchedule({
      strategy,
      assetClass,
      costBasis,
      salvageValue,
      section179Amount: strategy === STRATEGY.SECTION_179 || strategy === STRATEGY.SECTION_179_BONUS
        ? section179Amount
        : 0,
      bonusRate: strategy === STRATEGY.BONUS_ONLY || strategy === STRATEGY.SECTION_179_BONUS
        ? bonusRate
        : 0,
      placedInServiceDate,
      businessUsePct,
    })

    const year3Cumulative = schedule.slice(0, 3).reduce((s, r) => s + r.deduction, 0)

    // Tax savings = tax(net) - tax(net - deduction). Business-use portion of depreciation
    // reduces Schedule C net, which lowers federal + SE + state tax simultaneously.
    // Year-3 cumulative is modeled as "if you took this deduction all in one year" — honest
    // approximation since we don't know future years' net profit. Good for ranking strategies.
    let year1TaxSavings = 0
    let year3TaxSavings = 0
    if (typeof taxOfNet === 'function' && Number.isFinite(netProfitBeforeDeduction)) {
      const net = Math.max(Number(netProfitBeforeDeduction) || 0, 0)
      const baseTax = taxOfNet(net).totalTax
      const afterY1 = taxOfNet(Math.max(net - year1, 0)).totalTax
      year1TaxSavings = Math.max(baseTax - afterY1, 0)
      const afterY3 = taxOfNet(Math.max(net - year3Cumulative, 0)).totalTax
      year3TaxSavings = Math.max(baseTax - afterY3, 0)
    }

    return {
      key: strategy,
      year1,
      totalOverLife,
      year1TaxSavings,
      year3Cumulative,
      year3TaxSavings,
      schedule,
    }
  })
}

/**
 * Recommend the best strategy for the user's situation.
 * - Simple heuristic (honest about its limits):
 *   - Asset cost > taxable income → Standard MACRS (spread over years).
 *   - Asset cost ≤ taxable income AND placed in service after Jan 19, 2025 → Section 179.
 *   - Section 179 > 2026 max → clamp and still recommend Section 179.
 */
export function recommendStrategy({
  costBasis,
  estimatedTaxableIncome,
  placedInServiceDate,
  businessUsePct = 100,
}) {
  if (businessUsePct < SECTION_179_2026.businessUseMinPct) {
    return {
      key: STRATEGY.STANDARD_MACRS,
      reasonKey: 'recommendReason_businessUseTooLow',
    }
  }
  const cost = Number(costBasis) || 0
  const income = Number(estimatedTaxableIncome) || 0
  const bonus = getBonusRate(placedInServiceDate)
  if (cost > income && income > 0) {
    return {
      key: STRATEGY.STANDARD_MACRS,
      reasonKey: 'recommendReason_spreadOverYears',
    }
  }
  if (bonus >= 1.00) {
    return {
      key: STRATEGY.SECTION_179,
      reasonKey: 'recommendReason_s179Simple',
    }
  }
  return {
    key: STRATEGY.SECTION_179_BONUS,
    reasonKey: 'recommendReason_combineS179Bonus',
  }
}

// =============================================================================
// Back-compat helper: read CURRENT-YEAR deduction from any saved row.
//
// This is used by TaxSummaryTab, TaxMeterWidget, EstimatedTaxTab. It supports
// BOTH legacy records (depreciation_type in ['macrs5', 'macrs7', 'section179'])
// AND new strategy-based records (strategy in STRATEGY.*). For legacy rows it
// produces IDENTICAL output to the previous inline code.
// =============================================================================
export function getCurrentYearDeduction(row, year) {
  if (!row) return 0
  const price = Number(row.purchase_price) || 0
  const salvage = Number(row.salvage_value) || 0
  const prior = Number(row.prior_depreciation) || 0
  const basis = Math.max(price - salvage, 0)
  const purchaseYear = row.purchase_date ? new Date(row.purchase_date).getUTCFullYear() : year

  // New strategy-based record — use the strategy calculator.
  if (row.strategy) {
    const schedule = buildStrategySchedule({
      strategy: row.strategy,
      assetClass: row.asset_class || ASSET_CLASS.LIGHT_TRUCK,
      costBasis: price,
      salvageValue: salvage,
      section179Amount: Number(row.section_179_amount) || 0,
      bonusRate: Number(row.bonus_rate) || 0,
      placedInServiceDate: row.purchase_date || null,
      businessUsePct: Number(row.business_use_pct) || 100,
    }).schedule
    const match = schedule.find(r => r.year === year)
    return match ? match.deduction : 0
  }

  // Legacy path — preserve previous behavior exactly.
  if (row.depreciation_type === 'section179') {
    return purchaseYear === year ? Math.max(Math.min(basis, LEGACY_SECTION_179_LIMIT) - prior, 0) : 0
  }
  const rates = row.depreciation_type === 'macrs7'
    ? MACRS_7_YEAR_HALF_YEAR
    : MACRS_5_YEAR_HALF_YEAR
  const idx = year - purchaseYear
  if (idx >= 0 && idx < rates.length) return basis * rates[idx]
  return 0
}

/**
 * Total deduction actually taken for all years ≤ `throughYear` (inclusive).
 * Used for the "Списано на сегодня" (deducted-to-date) display.
 */
export function getDeductedToDate(row, throughYear) {
  if (!row) return 0
  const price = Number(row.purchase_price) || 0
  const salvage = Number(row.salvage_value) || 0
  const purchaseYear = row.purchase_date ? new Date(row.purchase_date).getUTCFullYear() : throughYear

  if (row.strategy) {
    const { schedule } = buildStrategySchedule({
      strategy: row.strategy,
      assetClass: row.asset_class || ASSET_CLASS.LIGHT_TRUCK,
      costBasis: price,
      salvageValue: salvage,
      section179Amount: Number(row.section_179_amount) || 0,
      bonusRate: Number(row.bonus_rate) || 0,
      placedInServiceDate: row.purchase_date || null,
      businessUsePct: Number(row.business_use_pct) || 100,
    })
    return schedule.filter(r => r.year <= throughYear).reduce((s, r) => s + r.deduction, 0)
  }

  // Legacy
  const basis = Math.max(price - salvage, 0)
  if (row.depreciation_type === 'section179') {
    const prior = Number(row.prior_depreciation) || 0
    return purchaseYear <= throughYear ? Math.max(Math.min(basis, LEGACY_SECTION_179_LIMIT) - prior, 0) : 0
  }
  const rates = row.depreciation_type === 'macrs7'
    ? MACRS_7_YEAR_HALF_YEAR
    : MACRS_5_YEAR_HALF_YEAR
  const yearsElapsed = Math.max(Math.min(throughYear - purchaseYear + 1, rates.length), 0)
  let sum = 0
  for (let i = 0; i < yearsElapsed; i++) sum += basis * rates[i]
  return sum
}

/**
 * Mid-quarter convention check — IRS requires it when >40% of depreciable basis
 * of all property placed in service during the tax year is placed in Q4.
 *
 * For solo owner-operators with one asset, this only triggers when the single
 * asset was placed in service in Q4.
 *
 * @returns {boolean} true if mid-quarter convention applies (user must consult CPA).
 */
export function needsMidQuarterConvention(placedInServiceDate) {
  if (!placedInServiceDate) return false
  const d = placedInServiceDate instanceof Date ? placedInServiceDate : new Date(placedInServiceDate)
  if (Number.isNaN(d.getTime())) return false
  // Q4 = Oct, Nov, Dec.
  const month = d.getUTCMonth() // 0-indexed
  return month >= 9 && month <= 11
}

/**
 * Determine whether Section 179 is legally eligible given business use.
 * Returns reason key if blocked, else null.
 */
export function checkSection179Eligibility({ businessUsePct }) {
  if ((Number(businessUsePct) || 0) < SECTION_179_2026.businessUseMinPct) {
    return 'error_section179_businessUse'
  }
  return null
}
