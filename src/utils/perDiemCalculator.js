/**
 * Per Diem Calculator
 * Calculates per diem tax deductions for transportation workers
 * based on completed trips.
 *
 * Sources:
 *  - IRS Notice 2025-54 (effective Oct 1, 2025 – Sep 30, 2026):
 *    CONUS daily rate $80/day (gross M&IE allowance).
 *  - IRC §274(n)(3): Transportation workers under DOT Hours-of-Service rules
 *    deduct 80% of the per diem on Schedule C (vs. 50% for general M&IE).
 *  - IRS Pub. 463: Partial day (departure / arrival) = 75% of daily rate.
 *
 * The store-of-record holds the GROSS rate. The DEDUCTION is computed by
 * `computeDeductible()` (gross * 0.80). PerDiemTab shows both numbers; every
 * tax consumer (Schedule C, Estimated Tax, SEP-IRA, Tax Meter, exports) uses
 * `total_deductible` so UI and exports are byte-for-byte in sync.
 */

export const DEFAULT_DAILY_RATE = 80.00
export const DEFAULT_PARTIAL_PERCENT = 75
export const DEDUCTION_RATE_DOT_HOS = 0.80

/**
 * Apply the 80% DOT HOS limit to a gross per diem allowance.
 * Used by every Schedule C consumer so the deduction is consistent.
 */
export function computeDeductible(grossAmount) {
  return (Number(grossAmount) || 0) * DEDUCTION_RATE_DOT_HOS
}

/**
 * Returns [startDate, endDate] ISO strings for a given quarter/year.
 * Q1=Jan1-Mar31, Q2=Apr1-Jun30, Q3=Jul1-Sep30, Q4=Oct1-Dec31
 */
function quarterDateRange(quarter, year) {
  const startMonth = (quarter - 1) * 3
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth + 1, 0).getDate()

  const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const end = `${year}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return [start, end]
}

/**
 * Determine which user IDs to include based on role.
 * - owner_operator: just the user
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
 * Calculate per diem days for a single trip.
 *
 * - Single-day trip (date_start === date_end): 0 full, 1 partial
 * - Multi-day trip: first day = partial, last day = partial, days between = full
 *
 * @param {string} dateStart - ISO date string (YYYY-MM-DD)
 * @param {string} dateEnd - ISO date string (YYYY-MM-DD)
 * @returns {{ full_days: number, partial_days: number }}
 */
function calcTripDays(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return { full_days: 0, partial_days: 0 }

  const start = new Date(dateStart + 'T00:00:00')
  const end = new Date(dateEnd + 'T00:00:00')

  const diffMs = end.getTime() - start.getTime()
  const totalCalendarDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (totalCalendarDays <= 0) {
    // Same day trip
    return { full_days: 0, partial_days: 1 }
  }

  if (totalCalendarDays === 1) {
    // Two-day trip: both days are partial
    return { full_days: 0, partial_days: 2 }
  }

  // Multi-day: first + last = partial (2), middle = full
  return {
    full_days: totalCalendarDays - 1, // days between first and last
    partial_days: 2, // departure + arrival
  }
}

/**
 * Calculate per diem deduction for a quarter.
 *
 * Returns trips with both `gross` (full IRS allowance) and `deductible`
 * (gross * 0.80, the Schedule C number). Totals expose `total_gross` and
 * `total_deductible` so callers pick the right number for their context.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {string} params.userId - Current user UUID
 * @param {string} params.role - 'owner_operator' | 'company'
 * @param {string} [params.vehicleId] - Optional vehicle filter
 * @param {number} params.quarter - 1-4
 * @param {number} params.year - e.g. 2026
 * @returns {Promise<{ trips: Array, totals: Object }>}
 */
export async function calculatePerDiem({ supabase, userId, role, vehicleId, quarter, year }) {
  const [startDate, endDate] = quarterDateRange(quarter, year)

  // 1. Get relevant user IDs
  const userIds = await getRelevantUserIds(supabase, userId, role)

  // 2. Load completed trips in the quarter
  let query = supabase
    .from('trips')
    .select('id, origin, destination, date_start, date_end')
    .in('user_id', userIds)
    .eq('status', 'completed')
    .gte('date_start', startDate)
    .lte('date_start', endDate)
    .order('date_start', { ascending: true })

  if (vehicleId) {
    query = query.eq('vehicle_id', vehicleId)
  }

  const { data: tripsData, error: tripsError } = await query
  if (tripsError) throw tripsError

  // 3. Load per_diem_settings
  const { data: settings } = await supabase
    .from('per_diem_settings')
    .select('daily_rate, partial_day_percent')
    .eq('user_id', userId)
    .maybeSingle()

  const dailyRate = settings?.daily_rate ?? DEFAULT_DAILY_RATE
  const partialPercent = settings?.partial_day_percent ?? DEFAULT_PARTIAL_PERCENT
  const partialMultiplier = partialPercent / 100

  // 4. Calculate per trip
  const trips = (tripsData || []).map(trip => {
    const { full_days, partial_days } = calcTripDays(trip.date_start, trip.date_end)
    const grossRaw = (full_days * dailyRate) + (partial_days * dailyRate * partialMultiplier)
    const gross = Math.round(grossRaw * 100) / 100
    const deductible = Math.round(computeDeductible(grossRaw) * 100) / 100

    return {
      trip_id: trip.id,
      origin: trip.origin || '',
      destination: trip.destination || '',
      date_start: trip.date_start,
      date_end: trip.date_end,
      full_days,
      partial_days,
      gross,
      deductible,
    }
  })

  // 5. Totals
  const total_trips = trips.length
  const total_full_days = trips.reduce((s, t) => s + t.full_days, 0)
  const total_partial_days = trips.reduce((s, t) => s + t.partial_days, 0)
  const total_days = total_full_days + total_partial_days
  const total_gross_raw = trips.reduce((s, t) => s + t.gross, 0)
  const total_gross = Math.round(total_gross_raw * 100) / 100
  const total_deductible = Math.round(computeDeductible(total_gross_raw) * 100) / 100

  return {
    trips,
    totals: {
      total_trips,
      total_full_days,
      total_partial_days,
      total_days,
      daily_rate: dailyRate,
      partial_day_percent: partialPercent,
      deduction_percent: DEDUCTION_RATE_DOT_HOS * 100,
      total_gross,
      total_deductible,
    },
  }
}
