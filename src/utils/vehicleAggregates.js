// Aggregation helpers for the vehicle_depreciation table — sums per-record
// MACRS depreciation and UBIA across ALL of a user's records. Designed for
// owner-operators with one tractor + one trailer (and forward-compatible with
// fleets of N machines), so callers do not need to .limit(1) and silently lose
// records past the first one.
//
// Both helpers are pure-with-IO: they read Supabase, then delegate per-record
// math to the existing depreciationCalculator module — no calculation logic
// lives here.

import { getCurrentYearDeduction } from '../lib/tax/depreciationCalculator.js'

/**
 * Sum of current-year MACRS depreciation across every vehicle_depreciation
 * record owned by `userId`, evaluated for `taxYear`.
 *
 * Per-record math is delegated to getCurrentYearDeduction(), which already
 * handles legacy depreciation_type rows and new strategy-based rows.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {number} taxYear
 * @returns {Promise<number>} Depreciation in USD, never negative.
 * @throws if the underlying Supabase query returns an error.
 */
export async function getTotalDepreciationForYear(supabase, userId, taxYear) {
  const { data, error } = await supabase
    .from('vehicle_depreciation')
    .select('purchase_price, purchase_date, depreciation_type, salvage_value, prior_depreciation, asset_class, strategy, section_179_amount, bonus_rate, business_use_pct')
    .eq('user_id', userId)

  if (error) throw error
  if (!data || data.length === 0) return 0

  return data.reduce((sum, record) => {
    const dep = getCurrentYearDeduction(record, taxYear)
    return sum + (Number.isFinite(dep) && dep > 0 ? dep : 0)
  }, 0)
}

/**
 * Sum of UBIA (Unadjusted Basis Immediately After Acquisition) for "qualified
 * property" — vehicle_depreciation records whose purchase_date falls inside
 * the §199A-2(c)(2) depreciable period: the longer of (a) the MACRS recovery
 * period or (b) 10 years from date in service.
 *
 * For owner-operator assets (3-yr tractors, 5-yr trailers) the 10-year window
 * always governs, so we filter on a 10-year window only.
 *
 * Per-record formula: purchase_price × (business_use_pct / 100)
 *
 * Window:
 *   start = December 31 of (taxYear − 10)   ← inclusive
 *   end   = December 31 of  taxYear         ← inclusive
 *
 * Date strings are built directly (`YYYY-12-31`) instead of via Date+toISOString
 * to avoid local-timezone shift on Date(y, 11, 31).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {number} taxYear
 * @returns {Promise<number>} UBIA in USD, never negative.
 * @throws if the underlying Supabase query returns an error.
 */
export async function getTotalUBIAForYear(supabase, userId, taxYear) {
  const windowStart = `${taxYear - 10}-12-31`
  const windowEnd = `${taxYear}-12-31`

  const { data, error } = await supabase
    .from('vehicle_depreciation')
    .select('purchase_price, business_use_pct, purchase_date')
    .eq('user_id', userId)
    .gte('purchase_date', windowStart)
    .lte('purchase_date', windowEnd)

  if (error) throw error
  if (!data || data.length === 0) return 0

  return data.reduce((sum, record) => {
    const price = Number(record.purchase_price) || 0
    const pct = Number(record.business_use_pct) || 0
    const ubia = (price * pct) / 100
    return sum + (Number.isFinite(ubia) && ubia > 0 ? ubia : 0)
  }, 0)
}
