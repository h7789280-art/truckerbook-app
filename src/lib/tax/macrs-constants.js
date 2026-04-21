// IRS MACRS + Section 179 + Bonus Depreciation constants.
// Sources: Rev. Proc. 87-56 (Table B-2), Rev. Proc. 87-57 / Pub 946 Table A-1,
// TCJA + One Big Beautiful Bill Act (OBBBA, 2025), IRS 2026 inflation-adjusted limits.

// Half-year convention, 200% declining balance (switches to SL at optimal point).
// Each array sums to exactly 1.00.
export const MACRS_3_YEAR_HALF_YEAR = [0.3333, 0.4445, 0.1481, 0.0741]
export const MACRS_5_YEAR_HALF_YEAR = [0.2000, 0.3200, 0.1920, 0.1152, 0.1152, 0.0576]
export const MACRS_7_YEAR_HALF_YEAR = [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446]

// IRS Asset Class (Rev. Proc. 87-56 Table B-2) → GDS recovery period.
export const ASSET_CLASS_TO_RECOVERY_PERIOD = {
  semi_tractor_otr: 3,            // 00.26 Tractor Units for Use Over-The-Road
  light_truck: 5,                 // 00.242 Light General Purpose Trucks (<13,000 lbs)
  heavy_truck_non_tractor: 5,     // 00.241 Heavy General Purpose Trucks (non-tractor)
  trailer: 5,                     // 00.27 Trailers and trailer-mounted containers
}

// Recovery period → MACRS half-year convention rates.
export function getMacrsRates(recoveryPeriod) {
  if (recoveryPeriod === 3) return MACRS_3_YEAR_HALF_YEAR
  if (recoveryPeriod === 5) return MACRS_5_YEAR_HALF_YEAR
  if (recoveryPeriod === 7) return MACRS_7_YEAR_HALF_YEAR
  return MACRS_5_YEAR_HALF_YEAR
}

export function getMacrsRatesForAssetClass(assetClass) {
  const period = ASSET_CLASS_TO_RECOVERY_PERIOD[assetClass] ?? 5
  return getMacrsRates(period)
}

// Section 179 (2026 inflation-adjusted per IRS Rev. Proc. 2025-32).
export const SECTION_179_2026 = {
  maxDeduction: 2_560_000,
  phaseOutThreshold: 4_090_000,
  fullPhaseOutAt: 6_650_000,
  suvCap: 32_000,                 // Passenger SUVs 6,001-14,000 lbs GVWR
  businessUseMinPct: 50,          // >50% business use required
  heavyVehicleGvwrCutoff: 14_000, // lbs — above this, no SUV cap applies
}

// Bonus Depreciation by placed-in-service year.
// OBBBA (2025) restored 100% for property placed in service AFTER January 19, 2025.
// Pre-OBBBA phase-down: 2022 → 100%, 2023 → 80%, 2024 → 60%, 2025 (pre Jan 20) → 40%.
export const BONUS_DEPRECIATION_BY_YEAR = {
  2022: 1.00,
  2023: 0.80,
  2024: 0.60,
  2025: 1.00, // 100% for placed-in-service after Jan 19, 2025 (OBBBA). See getBonusRate() for Jan 1-19 edge.
  2026: 1.00,
  2027: 1.00,
}

// Returns the bonus depreciation rate applicable for property placed in service on `date`.
export function getBonusRate(placedInServiceDate) {
  if (!placedInServiceDate) return 1.00
  const date = placedInServiceDate instanceof Date
    ? placedInServiceDate
    : new Date(placedInServiceDate)
  if (Number.isNaN(date.getTime())) return 1.00
  const year = date.getUTCFullYear()
  if (year === 2025 && date < new Date('2025-01-20T00:00:00Z')) return 0.40
  if (BONUS_DEPRECIATION_BY_YEAR[year] != null) return BONUS_DEPRECIATION_BY_YEAR[year]
  // Pre-2022 or far-future: conservative default (no bonus).
  return 0
}

// Section 179 phase-out: dollar-for-dollar reduction above threshold.
// totalQualifyingPurchases is the TOTAL of all Section 179 qualifying property placed in
// service this year (for a solo owner-operator this is usually just the single truck).
export function getSection179Limit(totalQualifyingPurchases = 0, year = 2026) {
  const limits = year === 2026 ? SECTION_179_2026 : SECTION_179_2026
  if (totalQualifyingPurchases <= limits.phaseOutThreshold) {
    return limits.maxDeduction
  }
  if (totalQualifyingPurchases >= limits.fullPhaseOutAt) {
    return 0
  }
  const reduction = totalQualifyingPurchases - limits.phaseOutThreshold
  return Math.max(limits.maxDeduction - reduction, 0)
}

// Depreciation strategy keys.
export const STRATEGY = {
  STANDARD_MACRS: 'standard_macrs',
  SECTION_179: 'section_179',
  SECTION_179_BONUS: 'section_179_bonus',
  BONUS_ONLY: 'bonus_only',
}

export const ALL_STRATEGIES = [
  STRATEGY.STANDARD_MACRS,
  STRATEGY.SECTION_179,
  STRATEGY.SECTION_179_BONUS,
  STRATEGY.BONUS_ONLY,
]

// Asset class keys (for UI + DB).
export const ASSET_CLASS = {
  SEMI_TRACTOR_OTR: 'semi_tractor_otr',
  LIGHT_TRUCK: 'light_truck',
  HEAVY_TRUCK_NON_TRACTOR: 'heavy_truck_non_tractor',
  TRAILER: 'trailer',
}

// Default asset classification suggestion.
// Class 8 OTR tractor: GVWR ≥ 33,000 lbs AND vehicle_type='tractor_unit' AND primary_use='otr'.
export function suggestAssetClass({ gvwrLbs, vehicleType, primaryUse }) {
  if (vehicleType === 'trailer') return ASSET_CLASS.TRAILER
  if (
    vehicleType === 'tractor_unit' &&
    primaryUse === 'otr' &&
    (Number(gvwrLbs) || 0) >= 33_000
  ) {
    return ASSET_CLASS.SEMI_TRACTOR_OTR
  }
  if (vehicleType === 'straight_truck' && (Number(gvwrLbs) || 0) >= 13_000) {
    return ASSET_CLASS.HEAVY_TRUCK_NON_TRACTOR
  }
  return ASSET_CLASS.LIGHT_TRUCK
}
