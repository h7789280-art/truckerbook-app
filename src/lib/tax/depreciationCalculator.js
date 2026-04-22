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
} from './macrs-constants.js'

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
 * The Section 179 strategy row applies the IRC §179(b)(3) income limitation:
 * the year-1 Section 179 deduction is capped at max(0, taxableIncome). Any
 * unused Section 179 carries forward; it does NOT flow into MACRS or bonus.
 * Bonus Depreciation has no income limitation, so it can create a Net
 * Operating Loss (NOL) that carries forward under IRC §172 (80% limit).
 *
 * @param {object} params
 * @param {string} params.assetClass
 * @param {number} params.costBasis
 * @param {number} [params.salvageValue=0]
 * @param {number} [params.section179Amount=0] - Requested S179 amount (subject to income limit).
 * @param {number} [params.bonusRate=0]         - Applicable bonus rate for the placed-in-service date.
 * @param {Date|string} params.placedInServiceDate
 * @param {number} [params.businessUsePct=100]
 * @param {(netProfit:number)=>{ totalTax:number }} params.taxOfNet
 *        Callable that returns total tax (federal + SE + state) for a given net profit.
 *        Used to compute accurate savings (delta between tax on net-before-deduction vs net-after).
 * @param {number} params.netProfitBeforeDeduction - Estimated Schedule C net profit BEFORE the deduction.
 *        Also used as the IRC §179(b)(3) income ceiling for the Section 179 strategy.
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

  const income = Math.max(Number(netProfitBeforeDeduction) || 0, 0)
  const businessFraction = Math.max(Math.min(Number(businessUsePct) || 100, 100), 0) / 100
  const depreciableBasis = Math.max(Number(costBasis) || 0, 0) * businessFraction

  return strategies.map(strategy => {
    // IRC §179(b)(3): Section 179 deduction cannot exceed taxable business income.
    // Cap the S179 amount we pass into the schedule builder for strategies that use it.
    let effectiveS179 = 0
    if (strategy === STRATEGY.SECTION_179) {
      effectiveS179 = Math.min(Math.max(Number(section179Amount) || 0, 0), income, depreciableBasis)
    } else if (strategy === STRATEGY.SECTION_179_BONUS) {
      effectiveS179 = Math.min(Math.max(Number(section179Amount) || 0, 0), income, depreciableBasis)
    }

    const effectiveBonus = (strategy === STRATEGY.BONUS_ONLY || strategy === STRATEGY.SECTION_179_BONUS)
      ? (Number(bonusRate) || 0)
      : 0

    const { schedule, year1, totalOverLife, section179Applied } = buildStrategySchedule({
      strategy,
      assetClass,
      costBasis,
      salvageValue,
      section179Amount: effectiveS179,
      bonusRate: effectiveBonus,
      placedInServiceDate,
      businessUsePct,
    })

    // Year-1 MACRS portion = whatever is left after S179/Bonus one-time writedowns.
    const year1MACRS = Math.max(year1 - (section179Applied || 0) - (
      strategy === STRATEGY.BONUS_ONLY || strategy === STRATEGY.SECTION_179_BONUS
        ? Math.max(depreciableBasis - (section179Applied || 0), 0) * effectiveBonus
        : 0
    ), 0)

    // NOL carryforward (year 1): any year-1 deduction that exceeds taxable income flows
    // through Schedule C as a loss and becomes an NOL under IRC §172 (80% usage limit
    // in future years). Section 179 itself is income-limited and cannot create an NOL,
    // but the MACRS component of any strategy (including the Section 179 strategy where
    // income caps §179 below the full amount) is NOT income-limited. Apply the same
    // year1 - income test uniformly to all four strategies.
    const nolYear1 = Math.max(year1 - income, 0)

    // Unused Section 179 (income-limited): carries forward to future years.
    const section179Requested = (strategy === STRATEGY.SECTION_179 || strategy === STRATEGY.SECTION_179_BONUS)
      ? Math.min(Math.max(Number(section179Amount) || 0, 0), depreciableBasis)
      : 0
    const section179Carryforward = Math.max(section179Requested - (section179Applied || 0), 0)

    // Tax savings model (year 1 and lifetime): apply an income cap to each scheduled
    // year's deduction separately, then multiply by the current-year effective tax rate
    // (federal + SE + state, derived from taxOfNet on the pre-deduction income).
    //
    // Why not a two-tax-call tax(income) - tax(income - year1)? When year1 >> income for
    // every strategy (basis of $500k, income of $50k), all four collapse to tax(income),
    // masking the difference. The min(deduction, income) × rate form keeps MACRS (whose
    // year-1 deduction may fit INSIDE income) distinguishable from §179/Bonus (which
    // saturate at income). Excess above the cap becomes an NOL — tracked separately in
    // nolYear1 and surfaced with a disclaimer; it's NOT double-counted here.
    //
    // Lifetime: sum the same capped formula across each scheduled year (Standard MACRS
    // and Section 179 still have a MACRS tail — those extra years matter when annual
    // income caps the deduction). For §179+Bonus / Bonus-only the schedule collapses to
    // year 1, so lifetime savings == year-1 savings, with NOL carryforward upside noted
    // in the UI disclaimer (§172 80% rule intentionally ignored for the MVP).
    let year1TaxSavings = 0
    let totalTaxSavings = 0
    if (typeof taxOfNet === 'function' && Number.isFinite(netProfitBeforeDeduction)) {
      const baseTax = taxOfNet(income).totalTax
      const effectiveRate = income > 0 ? baseTax / income : 0
      year1TaxSavings = Math.min(year1, income) * effectiveRate
      totalTaxSavings = schedule.reduce(
        (sum, r) => sum + Math.min(r.deduction, income) * effectiveRate,
        0,
      )
    }

    return {
      key: strategy,
      year1,
      year1MACRS,
      totalOverLife,
      year1TaxSavings,
      totalTaxSavings,
      nolYear1,
      section179Applied: section179Applied || 0,
      section179Carryforward,
      schedule,
    }
  })
}

/**
 * Recommend the best depreciation strategy for the user's situation.
 *
 * Logic (honest about its limits — NOT financial advice):
 *   - Business use <50% → Standard MACRS (Section 179 unavailable, ADS-style SL only).
 *   - Taxable income ≥ depreciable basis → Section 179 only (simplest: Form 4562 Part I).
 *   - 0 < income < basis → Section 179 + Bonus (S179 covers to income ceiling, Bonus writes down
 *     the rest creating an NOL).
 *   - Income ≤ 0 → Bonus only (Section 179 blocked by IRC §179(b)(3) income limitation;
 *     Bonus creates an NOL under §172 that carries to future years).
 *
 * depreciableBasis = costBasis × (businessUsePct / 100)
 */
export function recommendStrategy({
  costBasis,
  estimatedTaxableIncome,
  placedInServiceDate: _placedInServiceDate,
  businessUsePct = 100,
}) {
  const businessPct = Number(businessUsePct) || 0
  if (businessPct < SECTION_179_2026.businessUseMinPct) {
    return {
      key: STRATEGY.STANDARD_MACRS,
      reasonKey: 'recommendReason_businessUseTooLow',
    }
  }

  const cost = Math.max(Number(costBasis) || 0, 0)
  const income = Number(estimatedTaxableIncome) || 0
  const depreciableBasis = cost * (Math.min(businessPct, 100) / 100)

  if (income <= 0) {
    return {
      key: STRATEGY.BONUS_ONLY,
      reasonKey: 'recommendReason_bonusForNoIncome',
    }
  }
  if (income >= depreciableBasis) {
    return {
      key: STRATEGY.SECTION_179,
      reasonKey: 'recommendReason_s179FullyCovered',
    }
  }
  // 0 < income < basis
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

/**
 * Slider upper bound for the Section 179 amount. The IRC §179(b)(3) income
 * limitation clamps the deduction to taxable business income, so the slider
 * itself must not exceed that ceiling. When income ≤ 0 the slider is
 * effectively disabled (maxSection179 = 0) — callers should surface that to
 * the user along with a pointer to Bonus Depreciation (which CAN create an NOL).
 *
 * maxSection179 = min(costBasis, 2026 §179 cap, max(0, taxableIncome))
 */
export function getMaxSection179Slider({ costBasis, taxableIncome, year = 2026 }) {
  const basisN = Math.max(Number(costBasis) || 0, 0)
  const incomeN = Math.max(Number(taxableIncome) || 0, 0)
  const limits = year === 2026 ? SECTION_179_2026 : SECTION_179_2026
  return Math.min(basisN, limits.maxDeduction, incomeN)
}

/**
 * Reducer for the active-strategy / userOverride state machine used by
 * DepreciationTab. Extracted so the sync logic is unit-testable.
 *
 * States: { strategy, userOverride }
 * Events:
 *   - { type: 'input_changed', recommendedKey } — basis/income/businessUse changed;
 *     reset override and snap active to the new recommendation.
 *   - { type: 'user_clicked', key }            — user tapped a strategy card;
 *     lock userOverride and set active to the clicked key.
 *   - { type: 'load_record', key }             — a saved record was read from DB;
 *     treat like a prior user choice (userOverride = true).
 *   - { type: 'initial_sync', recommendedKey } — sync effect firing without a
 *     prior override (no-op on userOverride, just snaps strategy to recommendation).
 */
export function reduceStrategyState(state, event) {
  if (!event) return state
  switch (event.type) {
    case 'input_changed':
      return { strategy: event.recommendedKey, userOverride: false }
    case 'user_clicked':
      return { strategy: event.key, userOverride: true }
    case 'load_record':
      return { strategy: event.key, userOverride: true }
    case 'initial_sync':
      if (state.userOverride) return state
      return { strategy: event.recommendedKey, userOverride: false }
    default:
      return state
  }
}
