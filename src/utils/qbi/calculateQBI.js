// QBI Deduction Calculator (IRC §199A)
// =====================================
//
// Pure function: given filing status, taxable income (before QBI), QBI, W-2 wages,
// UBIA of qualified property, and net capital gain, returns the §199A deduction
// along with diagnostic fields (phase, applied rule, limits) for UI/audit display.
//
// Source for 2026 thresholds:
//   IRS Revenue Procedure 2025-32 (October 2025), reflecting the One Big Beautiful
//   Bill Act (OBBBA, H.R. 1, 119th Congress, signed 2025-07-04). OBBBA expanded
//   the §199A phase-in range to $150,000 (MFJ) and $75,000 (Single/HoH/MFS) for
//   tax years beginning after 2025. The new minimum-deduction floor ($400) and
//   minimum-QBI gate ($1,000) introduced by OBBBA kick in for tax years
//   beginning after 2026 — therefore NOT applied here for tax_year=2026.
//
// Trucking note: an owner-operator OTR trucking business is NOT an SSTB (specified
// service trade or business). The SSTB code path below is implemented for
// correctness but is not exercised by the typical TruckerBook user.

/**
 * §199A taxable-income thresholds, indexed by filing status × tax year.
 * Lower = start of phase-in; upper = end of phase-in (full W-2/UBIA cap above).
 *
 * Values for tax year 2026 are from IRS Rev. Proc. 2025-32 (post-OBBBA),
 * which widened the phase-in range to $150k MFJ / $75k otherwise.
 *
 * If/when IRS publishes Rev. Proc. for tax year 2027, add a new key here.
 *
 * @type {Record<number, Record<'mfj'|'single'|'mfs'|'hoh', { lower: number, upper: number }>>}
 */
const THRESHOLDS = {
  // TODO: update to IRS Rev. Proc. 2027 when published (expected Oct 2026).
  2026: {
    mfj:    { lower: 403_500, upper: 553_500 }, // range = $150,000 (OBBBA)
    single: { lower: 201_750, upper: 276_750 }, // range = $75,000  (OBBBA)
    mfs:    { lower: 201_750, upper: 276_750 }, // mirrors single
    hoh:    { lower: 201_750, upper: 276_750 }, // mirrors single
  },
  // 2025 fallback per IRS Rev. Proc. 2024-40 (pre-OBBBA narrower phase-in).
  // Kept so that the calculator does not throw if a 2025 record is replayed.
  2025: {
    mfj:    { lower: 394_600, upper: 494_600 }, // range = $100,000
    single: { lower: 197_300, upper: 247_300 }, // range = $50,000
    mfs:    { lower: 197_300, upper: 247_300 },
    hoh:    { lower: 197_300, upper: 247_300 },
  },
}

const TENTATIVE_RATE = 0.20
const W2_WAGE_RATE = 0.50
const W2_UBIA_WAGE_RATE = 0.25
const UBIA_RATE = 0.025

/**
 * @typedef {Object} QBIInput
 * @property {'single'|'mfj'|'mfs'|'hoh'} filingStatus
 * @property {number} taxableIncomeBeforeQBI - taxable income BEFORE the QBI deduction itself
 * @property {number} qbi                    - net Schedule C − ½ SE tax − SE health ins − SEP-IRA
 * @property {boolean} isSSTB                - trucking owner-operator => false
 * @property {number} w2Wages                - W-2 wages paid by the qualified trade or business
 * @property {number} ubia                   - Unadjusted Basis Immediately After Acquisition of qualified property
 * @property {number} [netCapitalGain]       - net capital gain + qualified dividends, used in overall cap
 * @property {number} [taxYear]              - default 2026
 *
 * @typedef {Object} QBIResult
 * @property {number} deduction
 * @property {number} tentativeQBI
 * @property {'below'|'within'|'above'} phase
 * @property {number|null} phaseInRatio
 * @property {{ wageLimit: number, wageUbiaLimit: number, wOrWubiaLimit: number, overallCap: number }} limits
 * @property {{ lower: number, upper: number, rangeWidth: number }} thresholds
 * @property {string} appliedRule
 * @property {number} qbiLossCarryover
 */

/**
 * Compute the §199A QBI deduction for a single qualified trade or business.
 *
 * @param {QBIInput} input
 * @returns {QBIResult}
 */
export function calculateQBIDeduction({
  filingStatus,
  taxableIncomeBeforeQBI,
  qbi,
  isSSTB,
  w2Wages,
  ubia,
  netCapitalGain = 0,
  taxYear = 2026,
}) {
  // -------- Input validation -------- //
  if (!THRESHOLDS[taxYear]) {
    throw new Error(`calculateQBIDeduction: no thresholds for tax year ${taxYear}`)
  }
  if (!THRESHOLDS[taxYear][filingStatus]) {
    throw new Error(`calculateQBIDeduction: invalid filing status "${filingStatus}"`)
  }
  if (!Number.isFinite(taxableIncomeBeforeQBI)) {
    throw new Error('calculateQBIDeduction: taxableIncomeBeforeQBI must be finite')
  }
  if (!Number.isFinite(qbi)) {
    throw new Error('calculateQBIDeduction: qbi must be finite')
  }
  if (!Number.isFinite(w2Wages) || w2Wages < 0) {
    throw new Error('calculateQBIDeduction: w2Wages must be finite and non-negative')
  }
  if (!Number.isFinite(ubia) || ubia < 0) {
    throw new Error('calculateQBIDeduction: ubia must be finite and non-negative')
  }
  if (!Number.isFinite(netCapitalGain) || netCapitalGain < 0) {
    throw new Error('calculateQBIDeduction: netCapitalGain must be finite and non-negative')
  }
  if (typeof isSSTB !== 'boolean') {
    throw new Error('calculateQBIDeduction: isSSTB must be boolean')
  }

  const { lower, upper } = THRESHOLDS[taxYear][filingStatus]
  const rangeWidth = upper - lower

  // -------- QBI loss: §199A(c)(2) --------
  // A negative QBI for the year produces no current-year deduction. The full
  // |qbi| carries to the next tax year and reduces that year's QBI. (Real
  // multi-year carryover bookkeeping is a future session — here we only return
  // the carryover amount so callers can persist it.)
  if (qbi < 0) {
    return {
      deduction: 0,
      tentativeQBI: 0,
      phase: classifyPhase(taxableIncomeBeforeQBI, lower, upper),
      phaseInRatio: null,
      limits: {
        wageLimit: W2_WAGE_RATE * w2Wages,
        wageUbiaLimit: W2_UBIA_WAGE_RATE * w2Wages + UBIA_RATE * ubia,
        wOrWubiaLimit: Math.max(W2_WAGE_RATE * w2Wages, W2_UBIA_WAGE_RATE * w2Wages + UBIA_RATE * ubia),
        overallCap: TENTATIVE_RATE * Math.max(0, taxableIncomeBeforeQBI - netCapitalGain),
      },
      thresholds: { lower, upper, rangeWidth },
      appliedRule: 'QBI loss — deduction is $0; loss carries to next year',
      qbiLossCarryover: Math.abs(qbi),
    }
  }

  // -------- Core limits -------- //
  const tentativeQBI = TENTATIVE_RATE * qbi
  const wageLimit = W2_WAGE_RATE * w2Wages
  const wageUbiaLimit = W2_UBIA_WAGE_RATE * w2Wages + UBIA_RATE * ubia
  const wOrWubiaLimit = Math.max(wageLimit, wageUbiaLimit)
  const overallCap = TENTATIVE_RATE * Math.max(0, taxableIncomeBeforeQBI - netCapitalGain)

  const phase = classifyPhase(taxableIncomeBeforeQBI, lower, upper)

  let combined
  let phaseInRatio = null
  let appliedRule

  // -------- SSTB path (NOT used by trucking owner-operator) -------- //
  // For SSTBs §199A phases out the QBI itself between lower and upper, and
  // disallows the deduction entirely above upper. Implemented for correctness;
  // trucking users will never reach this branch because they pass isSSTB=false.
  if (isSSTB) {
    if (phase === 'above') {
      return {
        deduction: 0,
        tentativeQBI,
        phase,
        phaseInRatio: null,
        limits: { wageLimit, wageUbiaLimit, wOrWubiaLimit, overallCap },
        thresholds: { lower, upper, rangeWidth },
        appliedRule: 'SSTB above upper threshold — fully disallowed',
        qbiLossCarryover: 0,
      }
    }
    if (phase === 'within') {
      const ratio = (taxableIncomeBeforeQBI - lower) / rangeWidth
      phaseInRatio = ratio
      const allowedFraction = 1 - ratio
      const sstbQBI = qbi * allowedFraction
      const sstbW2 = w2Wages * allowedFraction
      const sstbUbia = ubia * allowedFraction
      const sstbTentative = TENTATIVE_RATE * sstbQBI
      const sstbWageLimit = W2_WAGE_RATE * sstbW2
      const sstbWageUbiaLimit = W2_UBIA_WAGE_RATE * sstbW2 + UBIA_RATE * sstbUbia
      const sstbWOrWubia = Math.max(sstbWageLimit, sstbWageUbiaLimit)
      // Within phase-in the W-2/UBIA cap also phases in proportionally.
      const reduction = Math.max(0, sstbTentative - sstbWOrWubia) * ratio
      combined = sstbTentative - reduction
      appliedRule = 'SSTB phase-in (within thresholds, partial QBI allowed)'
    } else {
      // below
      combined = tentativeQBI
      appliedRule = 'Below lower threshold (SSTB fully eligible)'
    }
  } else {
    // -------- Non-SSTB path (trucking owner-operator) -------- //
    if (phase === 'below') {
      combined = tentativeQBI
      appliedRule = 'Below lower threshold (no W-2/UBIA cap applied)'
    } else if (phase === 'above') {
      combined = Math.min(tentativeQBI, wOrWubiaLimit)
      appliedRule = 'W-2/UBIA cap (above upper threshold)'
    } else {
      // within phase-in
      const ratio = (taxableIncomeBeforeQBI - lower) / rangeWidth
      phaseInRatio = ratio
      const reduction = Math.max(0, tentativeQBI - wOrWubiaLimit) * ratio
      combined = tentativeQBI - reduction
      appliedRule = 'Phase-in (W-2/UBIA reduction proportionally applied)'
    }
  }

  // -------- Overall cap: §199A(a)(1)(B) -------- //
  // The combined QBI deduction cannot exceed 20% of (taxable income − net capital gain).
  let deduction = Math.min(combined, overallCap)
  if (deduction < 0) deduction = 0

  if (deduction === overallCap && overallCap < combined) {
    appliedRule = `${appliedRule}; overall cap binds (20% × (TI − netCapGain))`
  }

  return {
    deduction,
    tentativeQBI,
    phase,
    phaseInRatio,
    limits: { wageLimit, wageUbiaLimit, wOrWubiaLimit, overallCap },
    thresholds: { lower, upper, rangeWidth },
    appliedRule,
    qbiLossCarryover: 0,
  }
}

/**
 * @param {number} ti
 * @param {number} lower
 * @param {number} upper
 * @returns {'below'|'within'|'above'}
 */
function classifyPhase(ti, lower, upper) {
  if (ti <= lower) return 'below'
  if (ti >= upper) return 'above'
  return 'within'
}

// Internal exports for tests / future callers that need to inspect the table.
export const QBI_THRESHOLDS = THRESHOLDS
