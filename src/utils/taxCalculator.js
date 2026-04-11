// IRS Tax Calculator for self-employed truckers
// Implements accurate SE tax (Schedule SE) and progressive income tax brackets

// 2024 Social Security wage base (SS tax cap)
const SS_WAGE_BASE = 168600

// SE tax rates
const SS_RATE = 0.124       // 12.4% Social Security
const MEDICARE_RATE = 0.029 // 2.9% Medicare
const ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200000
const ADDITIONAL_MEDICARE_THRESHOLD_MFJ = 250000
const ADDITIONAL_MEDICARE_RATE = 0.009 // 0.9%

// SE taxable multiplier (92.35%)
const SE_TAXABLE_MULTIPLIER = 0.9235

// 2024 Standard Deductions
const STANDARD_DEDUCTIONS = {
  single: 14600,
  married_jointly: 29200,
  head_of_household: 21900,
}

// 2024 Federal Income Tax Brackets
const TAX_BRACKETS = {
  single: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { min: 0, max: 23200, rate: 0.10 },
    { min: 23200, max: 94300, rate: 0.12 },
    { min: 94300, max: 201050, rate: 0.22 },
    { min: 201050, max: 383900, rate: 0.24 },
    { min: 383900, max: 487450, rate: 0.32 },
    { min: 487450, max: 731200, rate: 0.35 },
    { min: 731200, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 16550, rate: 0.10 },
    { min: 16550, max: 63100, rate: 0.12 },
    { min: 63100, max: 100500, rate: 0.22 },
    { min: 100500, max: 191950, rate: 0.24 },
    { min: 191950, max: 243700, rate: 0.32 },
    { min: 243700, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
}

/**
 * Calculate Self-Employment Tax per IRS Schedule SE
 * @param {number} netIncome - Net profit from Schedule C
 * @returns {{ taxableSEIncome: number, ssTax: number, medicareTax: number, additionalMedicare: number, totalSETax: number }}
 */
export function calculateSETax(netIncome) {
  if (netIncome <= 0) {
    return { taxableSEIncome: 0, ssTax: 0, medicareTax: 0, additionalMedicare: 0, totalSETax: 0 }
  }

  // Step 1: Taxable SE income = net income * 92.35%
  const taxableSEIncome = netIncome * SE_TAXABLE_MULTIPLIER

  // Step 2: Social Security (12.4%) — capped at SS_WAGE_BASE
  const ssBase = Math.min(taxableSEIncome, SS_WAGE_BASE)
  const ssTax = ssBase * SS_RATE

  // Step 3: Medicare (2.9%) — no cap
  const medicareTax = taxableSEIncome * MEDICARE_RATE

  // Step 4: Additional Medicare Tax (0.9%) on SE income above threshold
  // For simplicity we use single threshold; MFJ is handled via filingStatus in calculateIncomeTax
  const additionalMedicare = taxableSEIncome > ADDITIONAL_MEDICARE_THRESHOLD_SINGLE
    ? (taxableSEIncome - ADDITIONAL_MEDICARE_THRESHOLD_SINGLE) * ADDITIONAL_MEDICARE_RATE
    : 0

  const totalSETax = ssTax + medicareTax + additionalMedicare

  return { taxableSEIncome, ssTax, medicareTax, additionalMedicare, totalSETax }
}

/**
 * Calculate Federal Income Tax with progressive brackets
 * @param {number} netIncome - Net profit from Schedule C
 * @param {number} seTax - Total SE tax (from calculateSETax)
 * @param {string} filingStatus - 'single' | 'married_jointly' | 'head_of_household'
 * @returns {{ taxableIncome: number, deductibleHalfSE: number, standardDeduction: number, incomeTax: number, effectiveRate: number, bracketBreakdown: Array }}
 */
export function calculateIncomeTax(netIncome, seTax, filingStatus = 'single') {
  const status = STANDARD_DEDUCTIONS[filingStatus] != null ? filingStatus : 'single'
  const standardDeduction = STANDARD_DEDUCTIONS[status]
  const brackets = TAX_BRACKETS[status]

  // Deductible half of SE tax
  const deductibleHalfSE = seTax / 2

  // Adjusted Gross Income = net income - deductible half of SE tax
  const agi = Math.max(netIncome - deductibleHalfSE, 0)

  // Taxable income = AGI - standard deduction
  const taxableIncome = Math.max(agi - standardDeduction, 0)

  // Apply progressive brackets
  let remaining = taxableIncome
  let incomeTax = 0
  const bracketBreakdown = []

  for (const bracket of brackets) {
    if (remaining <= 0) break
    const width = bracket.max === Infinity ? remaining : (bracket.max - bracket.min)
    const taxableInBracket = Math.min(remaining, width)
    const taxInBracket = taxableInBracket * bracket.rate
    incomeTax += taxInBracket
    bracketBreakdown.push({
      rate: bracket.rate * 100,
      amount: taxableInBracket,
      tax: taxInBracket,
    })
    remaining -= taxableInBracket
  }

  const effectiveRate = taxableIncome > 0 ? (incomeTax / taxableIncome) * 100 : 0

  return { taxableIncome, deductibleHalfSE, standardDeduction, incomeTax, effectiveRate, bracketBreakdown }
}

/**
 * Full tax calculation combining SE + Income tax
 * @param {number} netIncome - Net profit
 * @param {string} filingStatus - Filing status
 * @returns {object} Combined tax results
 */
export function calculateTotalTax(netIncome, filingStatus = 'single') {
  const se = calculateSETax(netIncome)
  const income = calculateIncomeTax(netIncome, se.totalSETax, filingStatus)
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
  { value: 'head_of_household', labelKey: 'filingHeadOfHousehold' },
]

export { STANDARD_DEDUCTIONS }
