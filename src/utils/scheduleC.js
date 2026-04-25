// Single source of truth for the Schedule C Net Profit formula and its data
// load. Three consumers used to inline this and drift apart:
//   - EstimatedTaxTab (1040-ES)
//   - TaxSummaryTab (annual Schedule C report)
//   - taxMeterCalculator.calculateAccruedTax (Tax Meter widget on Overview)
//
// Two exports:
//   - computeScheduleCNetProfit({...})   sync, pure formula. For callers that
//     already have aggregated YTD/annual numbers (e.g. the Tax Meter, which
//     pre-aggregates expenses with a date_start trip filter that differs from
//     the annual Schedule C path).
//   - calculateScheduleCNetProfit(...)   async, fetch + compute. For callers
//     that want the canonical annual Schedule C aggregates straight from
//     Supabase.
//
// The async helper's queries are 1:1 with the legacy inline blocks in
// EstimatedTaxTab/TaxSummaryTab — same filters (created_at for trips,
// date for fuel/vehicle/service), same per-diem deductible (80% DOT HOS),
// same depreciation aggregation across vehicle_depreciation rows.

import { calculatePerDiem } from './perDiemCalculator.js'
import { getTotalDepreciationForYear } from './vehicleAggregates.js'

/**
 * Schedule C Net Profit formula, clamped to 0.
 *
 *   netProfit = max(income − fuelCost − vehExp − serviceCost − perDiem − depreciation, 0)
 *
 * The clamp matches IRS Form 1040 Schedule C Line 31 for the tax-calculator
 * path (losses route through a different code path). Display-side callers
 * that need the raw (possibly negative) figure should subtract themselves.
 *
 * @param {Object} parts
 * @param {number} [parts.income=0]
 * @param {number} [parts.fuelCost=0]
 * @param {number} [parts.vehExp=0]
 * @param {number} [parts.serviceCost=0]
 * @param {number} [parts.perDiem=0]
 * @param {number} [parts.depreciation=0]
 * @returns {number}
 */
export function computeScheduleCNetProfit({
  income = 0,
  fuelCost = 0,
  vehExp = 0,
  serviceCost = 0,
  perDiem = 0,
  depreciation = 0,
} = {}) {
  const i = Number(income) || 0
  const f = Number(fuelCost) || 0
  const v = Number(vehExp) || 0
  const s = Number(serviceCost) || 0
  const p = Number(perDiem) || 0
  const d = Number(depreciation) || 0
  return Math.max(i - f - v - s - p - d, 0)
}

/**
 * Fetch + compute Schedule C Net Profit for a single owner_operator (or the
 * principal of a fleet) for the full tax year.
 *
 * Queries (all fired in parallel — preserved from the original inline code so
 * EstimatedTaxTab/TaxSummaryTab don't regress on first-paint latency):
 *   - trips.income          filtered by created_at ∈ [year-01-01, year+1-01-01)
 *   - fuel_entries.cost     filtered by date ∈ [year-01-01, year+1-01-01)
 *   - vehicle_expenses.amount  same date filter (defaults to [] on error)
 *   - service_records.cost  same date filter
 *   - per diem (4 quarters, sums total_deductible — the 80% DOT HOS figure
 *     under IRC §274(n)(3) that hits Schedule C)
 *   - depreciation (sum across vehicle_depreciation rows, defaults to 0 on
 *     error to match the existing inline `.catch(() => 0)`)
 *
 * Throws if the trips / fuel / service queries return a Supabase error —
 * matches the original behavior where these landed in EstimatedTaxTab's
 * `.catch(err => setError(...))`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {number} taxYear
 * @param {string} [role='owner_operator']  Forwarded to calculatePerDiem so
 *                                          the company role aggregates across
 *                                          all drivers in the fleet.
 * @returns {Promise<{
 *   netProfit: number,
 *   income: number,
 *   fuelCost: number,
 *   vehExp: number,
 *   serviceCost: number,
 *   perDiem: number,
 *   depreciation: number,
 * }>}
 */
export async function calculateScheduleCNetProfit(supabase, userId, taxYear, role = 'owner_operator') {
  const start = `${taxYear}-01-01`
  const endPlusOne = `${taxYear + 1}-01-01`

  const perDiemPromises = [1, 2, 3, 4].map(q =>
    calculatePerDiem({ supabase, userId, role, quarter: q, year: taxYear })
      .catch(() => ({ totals: { total_deductible: 0 } }))
  )

  const [tripsRes, fuelRes, vehExpRes, serviceRes, depreciation, ...perDiems] = await Promise.all([
    supabase.from('trips').select('income').eq('user_id', userId)
      .gte('created_at', start + 'T00:00:00').lt('created_at', endPlusOne + 'T00:00:00'),
    supabase.from('fuel_entries').select('cost').eq('user_id', userId)
      .gte('date', start).lt('date', endPlusOne),
    supabase.from('vehicle_expenses').select('amount').eq('user_id', userId)
      .gte('date', start).lt('date', endPlusOne).then(r => r).catch(() => ({ data: [] })),
    supabase.from('service_records').select('cost').eq('user_id', userId)
      .gte('date', start).lt('date', endPlusOne),
    getTotalDepreciationForYear(supabase, userId, taxYear).catch(() => 0),
    ...perDiemPromises,
  ])

  if (tripsRes && tripsRes.error) throw tripsRes.error
  if (fuelRes && fuelRes.error) throw fuelRes.error
  if (serviceRes && serviceRes.error) throw serviceRes.error

  const income = (tripsRes.data || []).reduce((s, r) => s + (r.income || 0), 0)
  const fuelCost = (fuelRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
  const vehExp = (vehExpRes.data || []).reduce((s, r) => s + (r.amount || 0), 0)
  const serviceCost = (serviceRes.data || []).reduce((s, r) => s + (r.cost || 0), 0)
  const perDiem = perDiems.reduce((s, r) => s + (r?.totals?.total_deductible || 0), 0)

  const netProfit = computeScheduleCNetProfit({ income, fuelCost, vehExp, serviceCost, perDiem, depreciation })

  return { netProfit, income, fuelCost, vehExp, serviceCost, perDiem, depreciation }
}
