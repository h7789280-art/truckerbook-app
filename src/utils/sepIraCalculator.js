// SEP-IRA Retirement Calculator for self-employed truckers (owner-operators).
// IRS rules for 2026:
//   1. Max contribution = 25% of net self-employment earnings. For self-employed
//      filers, "net earnings" = Schedule C net profit - half of SE tax, and the
//      effective rate collapses to ~20% (0.25 / 1.25) of that figure.
//   2. Contribution is deducted from AGI (Schedule 1 line 16) BEFORE federal
//      income tax. Self-employment tax itself is NOT reduced.
//   3. Absolute cap for 2026: $70,000 per IRS Notice 2025-67 (inflation-
//      adjusted from $69,000 in 2025).

import {
  calculateSETax,
  calculateIncomeTax,
  calculateStateTax,
} from './taxCalculator.js'

export const SEP_IRA_CAPS = {
  2024: 69000,
  2025: 70000,
  2026: 70000,
}

export const DEFAULT_SEP_IRA_RATE = 0.20 // self-employed effective rate

function getCap(year) {
  return SEP_IRA_CAPS[year] ?? SEP_IRA_CAPS[2026]
}

/**
 * Max allowed SEP-IRA contribution for a self-employed owner-operator.
 * Formula: (netProfit - seTax/2) * 0.20, capped at the annual IRS limit.
 * Returned value is rounded DOWN to the nearest $100 for usability.
 *
 * @param {number} netProfit - Schedule C net profit (income - deductions)
 * @param {number} seTax - Total self-employment tax (Schedule SE)
 * @param {number} [year=2026]
 * @returns {number} max contribution in whole dollars
 */
export function calculateMaxSepIraContribution(netProfit, seTax, year = 2026) {
  const net = Number(netProfit) || 0
  const se = Number(seTax) || 0
  if (net <= 0) return 0

  const adjustedNetEarnings = Math.max(net - se / 2, 0)
  const rawMax = adjustedNetEarnings * DEFAULT_SEP_IRA_RATE
  const capped = Math.min(rawMax, getCap(year))
  // Round down to nearest $100 for clean slider UX
  return Math.floor(capped / 100) * 100
}

/**
 * Calculate federal + state tax savings from a given SEP-IRA contribution.
 * SE tax stays exactly the same; contribution reduces AGI directly.
 *
 * @param {object} params
 * @param {number} params.contributionAmount
 * @param {number} params.netProfit
 * @param {number} params.seTax - Total SE tax (pass from calculateSETax)
 * @param {number} params.deductibleHalfSE - Half of SE tax (regular portion)
 * @param {string} params.filingStatus
 * @param {string} [params.state]
 * @returns {{
 *   baselineTax: number,
 *   withSepIraTax: number,
 *   taxSavings: number,
 *   marginalRate: number,
 *   federalSavings: number,
 *   stateSavings: number
 * }}
 */
export function calculateTaxSavings({
  contributionAmount,
  netProfit,
  seTax,
  deductibleHalfSE,
  filingStatus = 'single',
  state = null,
}) {
  const contribution = Math.max(Number(contributionAmount) || 0, 0)
  const net = Number(netProfit) || 0
  const halfSe = Number(deductibleHalfSE) || 0
  const seTotal = Number(seTax) || 0

  // Baseline (no SEP-IRA)
  const baselineIncome = calculateIncomeTax(net, halfSe, filingStatus)
  const baselineState = state
    ? calculateStateTax({
        state,
        filingStatus,
        federalAGI: baselineIncome.agi,
        federalTaxableIncome: baselineIncome.taxableIncome,
      })
    : null
  const baselineStateTax = baselineState?.stateTax || 0
  const baselineTax = seTotal + baselineIncome.incomeTax + baselineStateTax

  // With SEP-IRA: contribution is an additional above-the-line deduction.
  // We subtract it from netIncome inside calculateIncomeTax while keeping
  // deductibleHalfSE unchanged — this makes AGI = netProfit - halfSe - contribution.
  const netAfterSepIra = Math.max(net - contribution, 0)
  const withIncome = calculateIncomeTax(netAfterSepIra, halfSe, filingStatus)
  const withState = state
    ? calculateStateTax({
        state,
        filingStatus,
        federalAGI: withIncome.agi,
        federalTaxableIncome: withIncome.taxableIncome,
      })
    : null
  const withStateTax = withState?.stateTax || 0
  // SE tax stays the same — SEP-IRA does NOT reduce it.
  const withSepIraTax = seTotal + withIncome.incomeTax + withStateTax

  const taxSavings = Math.max(baselineTax - withSepIraTax, 0)
  const federalSavings = Math.max(baselineIncome.incomeTax - withIncome.incomeTax, 0)
  const stateSavings = Math.max(baselineStateTax - withStateTax, 0)
  const marginalRate = contribution > 0 ? (taxSavings / contribution) * 100 : 0

  return {
    baselineTax,
    withSepIraTax,
    taxSavings,
    marginalRate,
    federalSavings,
    stateSavings,
    baselineIncomeTax: baselineIncome.incomeTax,
    withIncomeTax: withIncome.incomeTax,
    baselineStateTax,
    withStateTax,
  }
}

/**
 * Convenience helper that runs the full pipeline (SE tax + max + savings).
 * Useful for initial render when a component has netProfit + filingStatus.
 */
export function computeSepIraSnapshot({
  netProfit,
  filingStatus = 'single',
  state = null,
  contributionAmount = 0,
  year = 2026,
}) {
  const net = Number(netProfit) || 0
  const se = calculateSETax(net, filingStatus)
  const maxContribution = calculateMaxSepIraContribution(net, se.totalSETax, year)
  const savings = calculateTaxSavings({
    contributionAmount,
    netProfit: net,
    seTax: se.totalSETax,
    deductibleHalfSE: se.deductibleHalfSE,
    filingStatus,
    state,
  })
  return {
    netProfit: net,
    seTax: se.totalSETax,
    deductibleHalfSE: se.deductibleHalfSE,
    maxContribution,
    cap: getCap(year),
    ...savings,
  }
}

/**
 * Project compound growth of yearly SEP-IRA contributions.
 * Future value of an ordinary annuity: FV = PMT * (((1+r)^n - 1) / r).
 *
 * @param {number} annualContribution
 * @param {number} yearsUntilRetirement
 * @param {number} [avgReturn=0.07] - expected nominal annual return
 * @returns {number} future value at retirement
 */
export function projectRetirementGrowth(annualContribution, yearsUntilRetirement, avgReturn = 0.07) {
  const pmt = Number(annualContribution) || 0
  const n = Math.max(Number(yearsUntilRetirement) || 0, 0)
  const r = Number(avgReturn) || 0
  if (pmt <= 0 || n <= 0) return 0
  if (r === 0) return pmt * n
  return pmt * ((Math.pow(1 + r, n) - 1) / r)
}
