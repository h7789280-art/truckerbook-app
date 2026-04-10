/**
 * IFTA Quarterly Report Builder
 *
 * Aggregates state miles, fuel purchases, and tax rates into a
 * quarterly IFTA report structure ready for UI or PDF rendering.
 */

import { STATE_CODE_TO_NAME } from './usStates'

const DEFAULT_FLEET_MPG = 6.5
const LITERS_PER_GALLON = 3.78541

/**
 * Returns [startDate, endDate] ISO strings for a given quarter/year.
 * Q1=Jan1-Mar31, Q2=Apr1-Jun30, Q3=Jul1-Sep30, Q4=Oct1-Dec31
 */
function quarterDateRange(quarter, year) {
  const startMonth = (quarter - 1) * 3 // 0-based
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth + 1, 0).getDate()

  const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const end = `${year}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return [start, end]
}

/**
 * Round to N decimal places.
 */
function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Determine which user IDs to include based on role.
 * - owner_operator / driver: just the user
 * - company: the user + all drivers whose company_id matches
 */
async function getRelevantUserIds(supabase, userId, role) {
  if (role === 'company') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', userId)

    if (error) throw error

    const ids = (data || []).map(p => p.id)
    if (!ids.includes(userId)) ids.push(userId)
    return ids
  }

  return [userId]
}

/**
 * Build a quarterly IFTA report.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client instance
 * @param {string} params.userId - Current user UUID
 * @param {string} params.role - 'driver' | 'company' | 'owner_operator'
 * @param {string} [params.vehicleId] - Optional vehicle filter
 * @param {number} params.quarter - 1-4
 * @param {number} params.year - e.g. 2026
 * @returns {Promise<{states: Array, totals: Object}>}
 */
export async function buildQuarterlyReport({ supabase, userId, role, vehicleId, quarter, year }) {
  const [startDate, endDate] = quarterDateRange(quarter, year)

  // 1. Determine relevant user IDs
  const userIds = await getRelevantUserIds(supabase, userId, role)

  // 2. Get trip_ids for the quarter
  let tripsQuery = supabase
    .from('trips')
    .select('id')
    .in('user_id', userIds)
    .gte('date_start', startDate)
    .lte('date_start', endDate)

  if (vehicleId) {
    tripsQuery = tripsQuery.eq('vehicle_id', vehicleId)
  }

  const { data: tripsData, error: tripsError } = await tripsQuery
  if (tripsError) throw tripsError

  const tripIds = (tripsData || []).map(t => t.id)

  // 3. Aggregate miles by state from ifta_trip_state_miles
  const milesMap = {} // state_code -> miles

  if (tripIds.length > 0) {
    // Supabase .in() has a practical limit; batch if needed
    const BATCH = 500
    for (let i = 0; i < tripIds.length; i += BATCH) {
      const batch = tripIds.slice(i, i + BATCH)
      const { data, error } = await supabase
        .from('ifta_trip_state_miles')
        .select('state_code, miles')
        .in('trip_id', batch)

      if (error) throw error

      for (const row of (data || [])) {
        milesMap[row.state_code] = (milesMap[row.state_code] || 0) + (row.miles || 0)
      }
    }
  }

  // 4. Aggregate fuel gallons by state from fuel_entries
  const gallonsMap = {} // state_code -> gallons

  let fuelQuery = supabase
    .from('fuel_entries')
    .select('state_code, liters')
    .in('user_id', userIds)
    .gte('date', startDate)
    .lte('date', endDate)

  if (vehicleId) {
    fuelQuery = fuelQuery.eq('vehicle_id', vehicleId)
  }

  const { data: fuelData, error: fuelError } = await fuelQuery
  if (fuelError) throw fuelError

  for (const row of (fuelData || [])) {
    if (!row.state_code) continue
    const gallons = (row.liters || 0) / LITERS_PER_GALLON
    gallonsMap[row.state_code] = (gallonsMap[row.state_code] || 0) + gallons
  }

  // 5. Load tax rates for this quarter
  const { data: taxData, error: taxError } = await supabase
    .from('ifta_tax_rates')
    .select('state_code, fuel_tax_rate, surcharge')
    .eq('effective_year', year)
    .eq('effective_quarter', quarter)

  if (taxError) throw taxError

  const taxMap = {} // state_code -> { fuel_tax_rate, surcharge }
  for (const row of (taxData || [])) {
    taxMap[row.state_code] = {
      fuel_tax_rate: row.fuel_tax_rate || 0,
      surcharge: row.surcharge || 0,
    }
  }

  // 6. Build union of all state codes
  const allStates = new Set([...Object.keys(milesMap), ...Object.keys(gallonsMap)])

  // Edge case: no data at all
  if (allStates.size === 0) {
    return {
      states: [],
      totals: {
        total_miles: 0,
        total_gallons: 0,
        average_mpg: null,
        total_tax_due: 0,
        total_surcharge: 0,
        net_balance: 0,
      },
    }
  }

  // 7. Compute totals for average MPG
  const totalMiles = Object.values(milesMap).reduce((s, v) => s + v, 0)
  const totalGallons = Object.values(gallonsMap).reduce((s, v) => s + v, 0)
  const averageMpg = totalGallons > 0 ? totalMiles / totalGallons : DEFAULT_FLEET_MPG

  // 8. Build per-state rows
  let totalTaxDue = 0
  let totalSurchargeDue = 0
  let netBalance = 0

  const states = Array.from(allStates)
    .sort()
    .map(stateCode => {
      const miles = milesMap[stateCode] || 0
      const gallonsPurchased = gallonsMap[stateCode] || 0
      const gallonsConsumed = miles / averageMpg
      const rate = taxMap[stateCode]

      let taxRate = null
      let surchargeRate = null
      let taxDue = null
      let surchargeDue = null
      let netDue = null

      if (rate) {
        taxRate = rate.fuel_tax_rate
        surchargeRate = rate.surcharge
        taxDue = round(gallonsConsumed * taxRate, 2)
        surchargeDue = round(gallonsConsumed * surchargeRate, 2)
        // Credit for taxes already paid at the pump
        netDue = round(taxDue + surchargeDue - gallonsPurchased * taxRate, 2)
        totalTaxDue += taxDue
        totalSurchargeDue += surchargeDue
        netBalance += netDue
      }

      return {
        state_code: stateCode,
        state_name: STATE_CODE_TO_NAME[stateCode] || stateCode,
        miles: round(miles, 1),
        gallons_purchased: round(gallonsPurchased, 1),
        gallons_consumed: round(gallonsConsumed, 1),
        tax_rate: taxRate,
        surcharge_rate: surchargeRate,
        tax_due: taxDue,
        surcharge_due: surchargeDue,
        net_due: netDue,
      }
    })

  return {
    states,
    totals: {
      total_miles: round(totalMiles, 1),
      total_gallons: round(totalGallons, 1),
      average_mpg: round(averageMpg, 1),
      total_tax_due: round(totalTaxDue, 2),
      total_surcharge: round(totalSurchargeDue, 2),
      net_balance: round(netBalance, 2),
    },
  }
}
