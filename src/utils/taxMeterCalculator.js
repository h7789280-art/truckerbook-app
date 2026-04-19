// Real-time Tax Meter calculator — projects YTD income/expenses to annual,
// runs it through the existing IRS calculator (Schedule C + Schedule SE + state),
// and returns the tax accrued so far, the savings bucket delta, and the next
// 1040-ES quarterly deadline with amount-due hint.
//
// Pairs with TaxMeterWidget on Overview. Does NOT modify taxCalculator.js.

import { calculateTotalTax } from './taxCalculator'

const MS_PER_DAY = 1000 * 60 * 60 * 24

function toDate(d) {
  if (d instanceof Date) return d
  return new Date(d)
}

// Days elapsed in the current year, 1-based. Clamped to [1, 365].
// Jan 1 = 1, Dec 31 = 365. Leap years are ignored for tax proration stability.
function daysPassedInYear(currentDate) {
  const d = toDate(currentDate)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const diff = Math.floor((d.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1
  return Math.max(1, Math.min(diff, 365))
}

/**
 * Sum of trip income for the given calendar year, up to `currentDate`.
 *
 * Filter precedence mirrors IFTA / Tax Package: prefer `date_start` (actual
 * trip date), fall back to `created_at` only when date_start is null.
 * This excludes ghost entries whose created_at landed in-year but whose
 * actual trip date was outside the year or in the future.
 *
 * @param {Array<{income?: number, date_start?: string, created_at?: string}>} trips
 * @param {number} year
 * @param {Date|string} [currentDate=new Date()]  Cut-off (exclusive upper bound, in ms)
 */
export function calculateYTDGrossIncome(trips, year, currentDate = new Date()) {
  if (!Array.isArray(trips)) return 0
  const yearStart = new Date(year, 0, 1).getTime()
  const yearEnd = new Date(year + 1, 0, 1).getTime()
  const nowMs = toDate(currentDate).getTime()
  let sum = 0
  for (const t of trips) {
    if (!t) continue
    const ref = t.date_start || t.created_at
    if (ref) {
      const ts = new Date(ref).getTime()
      if (Number.isNaN(ts) || ts < yearStart || ts >= yearEnd || ts > nowMs) continue
    }
    sum += Number(t.income) || 0
  }
  return sum
}

/**
 * Linearly project a YTD total to a full year: amount * (365 / daysPassed).
 */
export function projectAnnualFromYTD(ytdAmount, currentDate = new Date()) {
  const days = daysPassedInYear(currentDate)
  if (days <= 0) return 0
  return (Number(ytdAmount) || 0) * (365 / days)
}

/**
 * Project net profit to annual and compute accrued tax.
 *
 * Gross, operating expenses, and per diem are projected linearly
 * (they scale with activity). Depreciation is already a full-year deduction
 * for the current tax year, so it is NOT projected.
 *
 * At days = 365 the projection is an identity, so `ytdAccruedTax` equals
 * `projectedAnnualTax` — matching Tax Summary exactly at year-end.
 *
 * @param {object} p
 * @param {number} p.ytdGross            YTD gross income (trips)
 * @param {number} p.ytdExpenses         YTD Schedule C expenses (fuel + repairs + vehicle)
 * @param {number} p.ytdPerDiem          YTD per diem total
 * @param {number} p.depreciation        Full-year depreciation / amortization
 * @param {string} p.filingStatus        IRS filing status
 * @param {string|null} p.state          2-letter state code (null = skip state tax)
 * @param {Date|string} p.currentDate    Reference date (default: now)
 */
export function calculateAccruedTax({
  ytdGross = 0,
  ytdExpenses = 0,
  ytdPerDiem = 0,
  depreciation = 0,
  filingStatus = 'single',
  state = null,
  currentDate = new Date(),
} = {}) {
  const days = daysPassedInYear(currentDate)
  const scale = 365 / days

  const projectedGross = ytdGross * scale
  const projectedExpenses = ytdExpenses * scale
  const projectedPerDiem = ytdPerDiem * scale
  const projectedDepreciation = Number(depreciation) || 0
  const projectedNetProfit = Math.max(
    projectedGross - projectedExpenses - projectedPerDiem - projectedDepreciation,
    0
  )

  const tax = calculateTotalTax(projectedNetProfit, filingStatus, state)
  const projectedAnnualTax = tax.totalTax || 0
  const ytdAccruedTax = projectedAnnualTax * (days / 365)

  // Debug trace so the user can verify mid-computation values in DevTools.
  if (typeof console !== 'undefined' && console.log) {
    console.log('[TaxMeter] calculateAccruedTax', {
      ytdGross,
      ytdExpenses,
      ytdPerDiem,
      depreciation: projectedDepreciation,
      projectedAnnualGross: projectedGross,
      projectedNetProfit,
      projectedAnnualTax,
      daysPassed: days,
      ytdAccruedTax,
    })
  }

  return {
    daysPassed: days,
    projectedGross,
    projectedExpenses,
    projectedPerDiem,
    projectedDepreciation,
    projectedNetProfit,
    projectedAnnualTax,
    ytdAccruedTax,
  }
}

/**
 * Savings-bucket delta: how much the driver SHOULD have set aside,
 * minus what has already been sent to the IRS via quarterly payments.
 * Positive → still need to save this much. Negative → over-saved (rare).
 *
 * @param {number} ytdGross
 * @param {number} withholdPct        Percent (15-40), e.g. 25 means 25%
 * @param {number|Array<number>} quarterlyPaymentsYTD  Sum or array of paid amounts
 */
export function calculateSavingsBucket(ytdGross, withholdPct, quarterlyPaymentsYTD) {
  const gross = Number(ytdGross) || 0
  const pct = Number(withholdPct) || 0
  const paid = Array.isArray(quarterlyPaymentsYTD)
    ? quarterlyPaymentsYTD.reduce((s, v) => s + (Number(v) || 0), 0)
    : Number(quarterlyPaymentsYTD) || 0
  return gross * (pct / 100) - paid
}

/**
 * Next IRS 1040-ES quarterly deadline after `currentDate`.
 *
 * Deadlines (standard, non-holiday-adjusted):
 *   Q1 = Apr 15, Q2 = Jun 15, Q3 = Sep 15, Q4 = Jan 15 of following year.
 *
 * The quarterly amount uses IRS Safe Harbor: pay 90% of projected annual tax
 * in four equal installments (or 110% of prior-year tax if prior AGI > $150k
 * — that branch is not implemented here; caller can override via `safeHarborFactor`).
 *
 * @param {Date|string} currentDate
 * @param {object} [opts]
 * @param {number} [opts.safeHarborTotal=0]   Projected annual tax (safe-harbor base)
 * @param {number} [opts.safeHarborFactor=0.9] 0.9 for standard, 1.1 for high-AGI filers
 * @param {Object.<number, number>} [opts.paidByQuarter={}]  { 1: paid, 2: paid, ... }
 * @returns {{quarter:string, qNum:number, year:number, dueDate:string, daysUntil:number, amount:number}|null}
 */
export function getNextQuarterDeadline(currentDate = new Date(), opts = {}) {
  const {
    safeHarborTotal = 0,
    safeHarborFactor = 0.9,
    paidByQuarter = {},
  } = opts
  const today = toDate(currentDate)
  today.setHours(0, 0, 0, 0)
  const year = today.getFullYear()

  const candidates = [
    { quarter: 'Q1', qNum: 1, year, due: new Date(year, 3, 15) },
    { quarter: 'Q2', qNum: 2, year, due: new Date(year, 5, 15) },
    { quarter: 'Q3', qNum: 3, year, due: new Date(year, 8, 15) },
    { quarter: 'Q4', qNum: 4, year, due: new Date(year + 1, 0, 15) },
    // Safety: if today is already past Q4 of current year, jump to next year's Q1.
    { quarter: 'Q1', qNum: 1, year: year + 1, due: new Date(year + 1, 3, 15) },
  ]

  const next = candidates.find(c => c.due.getTime() >= today.getTime())
  if (!next) return null

  const daysUntil = Math.ceil((next.due.getTime() - today.getTime()) / MS_PER_DAY)
  const safeHarborAnnual = (Number(safeHarborTotal) || 0) * (Number(safeHarborFactor) || 0.9)
  const quarterlyInstallment = safeHarborAnnual / 4
  const paidThisQ = Number(paidByQuarter[next.qNum]) || 0
  const amount = Math.max(quarterlyInstallment - paidThisQ, 0)

  const pad = n => String(n).padStart(2, '0')
  const dueDate = next.due.getFullYear() + '-' + pad(next.due.getMonth() + 1) + '-' + pad(next.due.getDate())

  return {
    quarter: next.quarter,
    qNum: next.qNum,
    year: next.year,
    dueDate,
    daysUntil,
    amount,
  }
}
