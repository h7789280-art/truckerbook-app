// IRS Tax Calculator for self-employed truckers (Schedule C / Schedule SE)
// 2026 tax year values per IRS Rev. Proc. 2025-32 and SSA wage base announcements.

// 2026 Social Security wage base (SS tax cap)
const SS_WAGE_BASE = 184500

// SE tax rates
const SS_RATE = 0.124       // 12.4% Social Security
const MEDICARE_RATE = 0.029 // 2.9% Medicare
const ADDITIONAL_MEDICARE_RATE = 0.009 // 0.9%

// Additional Medicare thresholds by filing status
const ADDITIONAL_MEDICARE_THRESHOLDS = {
  single: 200000,
  married_jointly: 250000,
  married_separately: 125000,
  head_of_household: 200000,
}

// SE taxable multiplier (92.35%)
const SE_TAXABLE_MULTIPLIER = 0.9235

// 2026 Standard Deductions
const STANDARD_DEDUCTIONS = {
  single: 16100,
  married_jointly: 32200,
  married_separately: 16100,
  head_of_household: 24150,
}

// 2026 Federal Income Tax Brackets
const TAX_BRACKETS = {
  single: [
    { min: 0, max: 12400, rate: 0.10 },
    { min: 12400, max: 50400, rate: 0.12 },
    { min: 50400, max: 105700, rate: 0.22 },
    { min: 105700, max: 201775, rate: 0.24 },
    { min: 201775, max: 256225, rate: 0.32 },
    { min: 256225, max: 640600, rate: 0.35 },
    { min: 640600, max: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { min: 0, max: 24800, rate: 0.10 },
    { min: 24800, max: 100800, rate: 0.12 },
    { min: 100800, max: 211400, rate: 0.22 },
    { min: 211400, max: 403550, rate: 0.24 },
    { min: 403550, max: 512450, rate: 0.32 },
    { min: 512450, max: 768700, rate: 0.35 },
    { min: 768700, max: Infinity, rate: 0.37 },
  ],
  married_separately: [
    { min: 0, max: 12400, rate: 0.10 },
    { min: 12400, max: 50400, rate: 0.12 },
    { min: 50400, max: 105700, rate: 0.22 },
    { min: 105700, max: 201775, rate: 0.24 },
    { min: 201775, max: 256225, rate: 0.32 },
    { min: 256225, max: 384350, rate: 0.35 },
    { min: 384350, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 17700, rate: 0.10 },
    { min: 17700, max: 67450, rate: 0.12 },
    { min: 67450, max: 105700, rate: 0.22 },
    { min: 105700, max: 201750, rate: 0.24 },
    { min: 201750, max: 256200, rate: 0.32 },
    { min: 256200, max: 640600, rate: 0.35 },
    { min: 640600, max: Infinity, rate: 0.37 },
  ],
}

function normalizeStatus(filingStatus) {
  return STANDARD_DEDUCTIONS[filingStatus] != null ? filingStatus : 'single'
}

/**
 * Calculate Self-Employment Tax per IRS Schedule SE (2026).
 * Additional Medicare threshold is filing-status aware.
 *
 * @param {number} netIncome - Net profit from Schedule C
 * @param {string} filingStatus - 'single' | 'married_jointly' | 'married_separately' | 'head_of_household'
 */
export function calculateSETax(netIncome, filingStatus = 'single') {
  const status = normalizeStatus(filingStatus)
  const addlThreshold = ADDITIONAL_MEDICARE_THRESHOLDS[status]

  if (netIncome <= 0) {
    return {
      taxableSEIncome: 0,
      ssBase: 0,
      ssTax: 0,
      medicareTax: 0,
      additionalMedicare: 0,
      totalSETax: 0,
      deductibleHalfSE: 0,
    }
  }

  const taxableSEIncome = netIncome * SE_TAXABLE_MULTIPLIER
  const ssBase = Math.min(taxableSEIncome, SS_WAGE_BASE)
  const ssTax = ssBase * SS_RATE
  const medicareTax = taxableSEIncome * MEDICARE_RATE
  const additionalMedicare = taxableSEIncome > addlThreshold
    ? (taxableSEIncome - addlThreshold) * ADDITIONAL_MEDICARE_RATE
    : 0
  const totalSETax = ssTax + medicareTax + additionalMedicare
  // Half of SE tax deductible excludes Additional Medicare (IRS Schedule SE line 13).
  const deductibleHalfSE = (ssTax + medicareTax) / 2

  return {
    taxableSEIncome,
    ssBase,
    ssTax,
    medicareTax,
    additionalMedicare,
    totalSETax,
    deductibleHalfSE,
  }
}

/**
 * Calculate Federal Income Tax with 2026 progressive brackets.
 * Uses half of SE tax (regular portion) as above-the-line deduction.
 */
export function calculateIncomeTax(netIncome, deductibleHalfSE, filingStatus = 'single') {
  const status = normalizeStatus(filingStatus)
  const standardDeduction = STANDARD_DEDUCTIONS[status]
  const brackets = TAX_BRACKETS[status]

  const agi = Math.max(netIncome - deductibleHalfSE, 0)
  const taxableIncome = Math.max(agi - standardDeduction, 0)

  let incomeTax = 0
  const bracketBreakdown = []
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break
    const top = Math.min(taxableIncome, bracket.max)
    const layer = top - bracket.min
    if (layer <= 0) continue
    const taxInBracket = layer * bracket.rate
    incomeTax += taxInBracket
    bracketBreakdown.push({
      rate: bracket.rate * 100,
      min: bracket.min,
      max: bracket.max,
      amount: layer,
      tax: taxInBracket,
    })
    if (taxableIncome <= bracket.max) break
  }

  const effectiveRate = taxableIncome > 0 ? (incomeTax / taxableIncome) * 100 : 0

  return {
    agi,
    standardDeduction,
    taxableIncome,
    incomeTax,
    effectiveRate,
    bracketBreakdown,
  }
}

/**
 * Full tax calculation combining SE + Income tax (2026).
 */
export function calculateTotalTax(netIncome, filingStatus = 'single') {
  const se = calculateSETax(netIncome, filingStatus)
  const income = calculateIncomeTax(netIncome, se.deductibleHalfSE, filingStatus)
  const totalTax = se.totalSETax + income.incomeTax
  const quarterlyPayment = totalTax / 4

  return {
    ...se,
    ...income,
    totalTax,
    quarterlyPayment,
  }
}

export const FILING_STATUS_OPTIONS = [
  { value: 'single', labelKey: 'filingSingle' },
  { value: 'married_jointly', labelKey: 'filingMarriedJointly' },
  { value: 'married_separately', labelKey: 'filingMarriedSeparately' },
  { value: 'head_of_household', labelKey: 'filingHeadOfHousehold' },
]

export const TAX_YEAR = 2026
export const SS_WAGE_BASE_2026 = SS_WAGE_BASE
export { STANDARD_DEDUCTIONS, TAX_BRACKETS, ADDITIONAL_MEDICARE_THRESHOLDS }
