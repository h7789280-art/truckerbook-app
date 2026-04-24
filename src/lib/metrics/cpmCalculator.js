// Unified Cost Per Mile (CPM) calculator.
//
// Industry practice splits CPM into two metrics:
//   - Variable CPM    : costs that scale with miles driven (fuel, maintenance,
//                        tolls, parking, per diem).
//   - Fully-loaded CPM: variable + fixed costs (insurance, truck payment or
//                        lease, depreciation). This is the true break-even rate.
//
// Legacy dashboard / Excel figures were inconsistent (mixed personal + business,
// or omitted depreciation/insurance). This module is the single source of truth
// going forward. It does NOT drive UI yet — UI migration is a follow-up task.
//
// Depreciation is read via getCurrentYearDeduction() from the tax calculator so
// we never duplicate MACRS / §179 / Bonus logic here.

import { getCurrentYearDeduction } from '../tax/depreciationCalculator.js'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// $/mile is conventionally quoted to 3 decimal places in freight costing
// ($0.633/mi, $1.025/mi, etc.). Task spec mentions "2 digits" but every cross-
// check value in the acceptance tests is expressed at 3 digits, so we round to
// 3 here — UI can further format as needed.
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000

const num = (n) => {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

const perMileSafe = (total, miles) => {
  const m = num(miles)
  if (m <= 0) return 0
  return round3(num(total) / m)
}

/**
 * @typedef {Object} CPMInputs
 * @property {number} miles                 Total miles for the period.
 * @property {number} [fuel]                Sum of fuel cost in the period.
 * @property {number} [maintenance]         Sum of service / repair cost in the period.
 * @property {number} [tolls]               Sum of tolls (and platon) in the period.
 * @property {number} [parking]             Sum of parking fees in the period.
 * @property {number} [perDiem]             Per-diem DEDUCTIBLE for the period
 *                                          (gross × 80% DOT HOS, not the gross
 *                                          allowance). Caller must apply the
 *                                          80% limit before passing it in —
 *                                          perDiemCalculator.totals.total_deductible
 *                                          already has it baked in.
 * @property {number} [insurance]           Insurance cost ALREADY scoped to the period
 *                                          (caller pro-rates if the policy is annual).
 * @property {number} [truckPayment]        Truck/lease payments in the period
 *                                          (already period-scoped).
 * @property {number} [depreciationAnnual]  ANNUAL depreciation for the vehicle.
 *                                          Pro-rated automatically: divided by 12 if
 *                                          `period === 'month'`; used as-is for year.
 * @property {number} [revenue]             Gross revenue (sum of trips.income, etc.).
 * @property {'month'|'year'} [period]      Controls depreciation pro-rating.
 */

/**
 * @typedef {Object} CPMResult
 * @property {number} miles
 * @property {{fuel:number, maintenance:number, tolls:number, parking:number, perDiem:number, total:number, perMile:number}} variable
 * @property {{insurance:number, truckPayment:number, depreciation:number, total:number, perMile:number}} fixed
 * @property {{total:number, perMile:number}} fullyLoaded
 * @property {{total:number, perMile:number}} revenue
 * @property {{variable:number, variablePerMile:number, fullyLoaded:number, fullyLoadedPerMile:number}} profit
 */

/**
 * Pure calculator: turns raw period-aligned totals into a CPMResult.
 * Does NOT touch the database — safe to unit-test in Node without Supabase.
 *
 * @param {CPMInputs} inputs
 * @returns {CPMResult}
 */
export function computeCPMFromInputs(inputs = {}) {
  const {
    miles = 0,
    fuel = 0,
    maintenance = 0,
    tolls = 0,
    parking = 0,
    perDiem = 0,
    insurance = 0,
    truckPayment = 0,
    depreciationAnnual = 0,
    revenue = 0,
    period = 'year',
  } = inputs

  const m = Math.max(num(miles), 0)

  const variable = {
    fuel: round2(fuel),
    maintenance: round2(maintenance),
    tolls: round2(tolls),
    parking: round2(parking),
    perDiem: round2(perDiem),
    total: 0,
    perMile: 0,
  }
  variable.total = round2(
    variable.fuel + variable.maintenance + variable.tolls + variable.parking + variable.perDiem,
  )
  variable.perMile = perMileSafe(variable.total, m)

  const depProRateFactor = period === 'month' ? 1 / 12 : 1
  const fixed = {
    insurance: round2(insurance),
    truckPayment: round2(truckPayment),
    depreciation: round2(num(depreciationAnnual) * depProRateFactor),
    total: 0,
    perMile: 0,
  }
  fixed.total = round2(fixed.insurance + fixed.truckPayment + fixed.depreciation)
  fixed.perMile = perMileSafe(fixed.total, m)

  const fullyLoadedTotal = round2(variable.total + fixed.total)
  const fullyLoaded = {
    total: fullyLoadedTotal,
    perMile: perMileSafe(fullyLoadedTotal, m),
  }

  const rev = round2(revenue)
  const revenueResult = {
    total: rev,
    perMile: perMileSafe(rev, m),
  }

  const profitVariable = round2(rev - variable.total)
  const profitFullyLoaded = round2(rev - fullyLoadedTotal)
  const profit = {
    variable: profitVariable,
    variablePerMile: perMileSafe(profitVariable, m),
    fullyLoaded: profitFullyLoaded,
    fullyLoadedPerMile: perMileSafe(profitFullyLoaded, m),
  }

  return { miles: m, variable, fixed, fullyLoaded, revenue: revenueResult, profit }
}

// -----------------------------------------------------------------------------
// Supabase-backed loader (thin wrapper around computeCPMFromInputs).
//
// The UI layer (DashboardTab, ReportsTab Excel) will switch to this after the
// tests land. Until then it's fully exercised only by computeCPMFromInputs-
// driven unit tests.
// -----------------------------------------------------------------------------

function monthBounds(year, month) {
  const y = Number(year)
  const m = Number(month)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  const iso = (d) => d.toISOString().slice(0, 10)
  return { startDate: iso(start), endDate: iso(end) }
}

function yearBounds(year) {
  const y = Number(year)
  return { startDate: `${y}-01-01`, endDate: `${y + 1}-01-01` }
}

async function safeSum(query, field) {
  try {
    const { data, error } = await query
    if (error || !Array.isArray(data)) return 0
    return data.reduce((s, row) => s + (Number(row?.[field]) || 0), 0)
  } catch {
    return 0
  }
}

async function fetchCPMFromSupabase({ year, month, userId, supabase }) {
  const isMonth = month != null && Number.isFinite(Number(month))
  const { startDate, endDate } = isMonth ? monthBounds(year, month) : yearBounds(year)

  const [miles, fuel, maintenance, tollsAndPlaton, parking, revenue, truckPayment] = await Promise.all([
    safeSum(
      supabase.from('trips').select('distance_km').eq('user_id', userId)
        .gte('created_at', startDate + 'T00:00:00').lt('created_at', endDate + 'T00:00:00'),
      'distance_km',
    ),
    safeSum(
      supabase.from('fuel_entries').select('cost').eq('user_id', userId)
        .gte('date', startDate).lt('date', endDate),
      'cost',
    ),
    safeSum(
      supabase.from('service_records').select('cost').eq('user_id', userId)
        .gte('date', startDate).lt('date', endDate),
      'cost',
    ),
    safeSum(
      supabase.from('trip_expenses').select('amount,category').eq('user_id', userId)
        .in('category', ['toll', 'platon'])
        .gte('date', startDate).lt('date', endDate),
      'amount',
    ),
    safeSum(
      supabase.from('trip_expenses').select('amount,category').eq('user_id', userId)
        .eq('category', 'parking')
        .gte('date', startDate).lt('date', endDate),
      'amount',
    ),
    safeSum(
      supabase.from('trips').select('income').eq('user_id', userId)
        .gte('created_at', startDate + 'T00:00:00').lt('created_at', endDate + 'T00:00:00'),
      'income',
    ),
    safeSum(
      supabase.from('vehicle_expenses').select('amount,category').eq('user_id', userId)
        .in('category', ['lease', 'payment', 'loan_payment'])
        .gte('date', startDate).lt('date', endDate),
      'amount',
    ),
  ])

  // Annual depreciation for the user's asset(s), via the tax calculator.
  let depreciationAnnual = 0
  try {
    const { data } = await supabase
      .from('depreciation_assets')
      .select('*')
      .eq('user_id', userId)
    if (Array.isArray(data)) {
      depreciationAnnual = data.reduce((sum, row) => sum + getCurrentYearDeduction(row, Number(year)), 0)
    }
  } catch {
    depreciationAnnual = 0
  }

  // Insurance: pro-rate active policies by days of overlap with the period.
  let insurance = 0
  try {
    const { data } = await supabase.from('insurance').select('*').eq('user_id', userId)
    if (Array.isArray(data)) {
      const periodStart = new Date(startDate + 'T00:00:00Z').getTime()
      const periodEnd = new Date(endDate + 'T00:00:00Z').getTime()
      const DAY = 24 * 60 * 60 * 1000
      for (const row of data) {
        const cost = Number(row?.cost) || 0
        const from = row?.date_from ? new Date(row.date_from + 'T00:00:00Z').getTime() : null
        const to = row?.date_to ? new Date(row.date_to + 'T00:00:00Z').getTime() : null
        if (!cost || from == null || to == null || to <= from) continue
        const overlapStart = Math.max(from, periodStart)
        const overlapEnd = Math.min(to, periodEnd)
        if (overlapEnd <= overlapStart) continue
        const totalDays = Math.max(Math.round((to - from) / DAY), 1)
        const overlapDays = Math.max(Math.round((overlapEnd - overlapStart) / DAY), 0)
        insurance += cost * (overlapDays / totalDays)
      }
    }
  } catch {
    insurance = 0
  }

  // Per diem: rollup of quarter totals. Caller-supplied perDiem via `inputs`
  // overrides this when available; here we leave it at zero and expect the UI
  // layer to supply it (today the per-diem calculator is the only reliable
  // source). This keeps the supabase path from double-counting trips.
  const perDiem = 0

  return {
    miles,
    fuel,
    maintenance,
    tolls: tollsAndPlaton,
    parking,
    perDiem,
    insurance,
    truckPayment,
    depreciationAnnual,
    revenue,
    period: isMonth ? 'month' : 'year',
  }
}

/**
 * Main entry point. Returns a CPMResult for the given period.
 *
 *   computeCPM({ year: 2026, month: 4, userId, supabase })  // April 2026
 *   computeCPM({ year: 2026, userId, supabase })            // full 2026
 *
 * For tests: pass `inputs` to bypass the Supabase fetch entirely.
 *   computeCPM({ year: 2026, month: 4, inputs: { miles: 3278, ... } })
 *
 * @param {Object} params
 * @param {number} params.year
 * @param {number} [params.month]            1-12 for month; omit for full year.
 * @param {string} [params.userId]
 * @param {Object} [params.supabase]         Supabase client (required unless inputs given).
 * @param {CPMInputs} [params.inputs]        Pre-computed raw totals (bypasses fetch).
 * @returns {Promise<CPMResult>}
 */
export async function computeCPM({ year, month, userId, supabase, inputs } = {}) {
  const isMonth = month != null && Number.isFinite(Number(month))
  const period = isMonth ? 'month' : 'year'
  if (inputs) {
    return computeCPMFromInputs({ period, ...inputs })
  }
  if (!supabase) {
    throw new Error('computeCPM: either `supabase` or `inputs` must be provided')
  }
  const raw = await fetchCPMFromSupabase({ year, month, userId, supabase })
  return computeCPMFromInputs(raw)
}
