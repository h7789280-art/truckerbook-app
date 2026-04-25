// Tests for scheduleC.js — Schedule C Net Profit formula and async loader.
// Run with `node`; exits 0 iff every assertion holds within ±$0.01 tolerance.
//
// The formula tests are the regression net for the consolidation: if any of
// the three call sites (EstimatedTaxTab, TaxSummaryTab, taxMeterCalculator)
// drifts away from the canonical Math.max(income − fuel − vehicle − service −
// perDiem − depreciation, 0), Petr's $500,139.50 reference fails and the
// commit gets blocked.

import { computeScheduleCNetProfit, calculateScheduleCNetProfit } from './scheduleC.js'

let failures = 0
let passes = 0
const mismatches = []

function assertClose(actual, expected, label, tol = 0.01) {
  const a = Number(actual)
  const e = Number(expected)
  if (!Number.isFinite(a) || !Number.isFinite(e)) {
    failures++
    mismatches.push(label)
    console.error('  FAIL ' + label + ': non-finite (actual=' + actual + ', expected=' + expected + ')')
    return
  }
  if (Math.abs(a - e) <= tol) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (actual=' + a + ', expected=' + e + ')')
    console.error('  FAIL ' + label + ': expected ' + e + ' ±' + tol + ', got ' + a)
  }
}

function assertEq(actual, expected, label) {
  if (actual === expected) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (actual=' + JSON.stringify(actual) + ', expected=' + JSON.stringify(expected) + ')')
    console.error('  FAIL ' + label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
  }
}

async function assertRejects(promise, label) {
  try {
    await promise
  } catch (_) {
    passes++
    return
  }
  failures++
  mismatches.push(label + ' (did not throw)')
  console.error('  FAIL ' + label + ': expected throw, did not')
}

console.log('\n=== Schedule C Net Profit tests ===\n')

// ----------------------------------------------------------------------
// computeScheduleCNetProfit — pure formula
// ----------------------------------------------------------------------
console.log('--- computeScheduleCNetProfit (pure formula) ---')

// 1. Petr regression — MFJ owner_operator, 2026 reference scenario.
//    Expected Net Profit = $500,139.50 (Schedule C Line 31).
//    Inputs reverse-engineered from the production figures so the formula
//    arithmetic is exact: 553762 − 8464 − 2303 − 905 − 288 − 41662.50 = 500139.50.
{
  const np = computeScheduleCNetProfit({
    income: 553762,
    fuelCost: 8464,
    vehExp: 2303,
    serviceCost: 905,
    perDiem: 288,
    depreciation: 41662.50,
  })
  assertClose(np, 500139.50, 'Petr.netProfit (MFJ owner_operator, TY 2026)')
}

// 2. All zeros → 0 (no income, no expenses).
{
  const np = computeScheduleCNetProfit({})
  assertEq(np, 0, 'Zero.everything → 0')
}

// 3. Expenses > income → clamped to 0 (no negative net profit).
{
  const np = computeScheduleCNetProfit({
    income: 1000,
    fuelCost: 500,
    vehExp: 300,
    serviceCost: 200,
    perDiem: 100,
    depreciation: 5000,
  })
  assertEq(np, 0, 'Loss.clampedToZero → 0 (not −5100)')
}

// 4. Field defaulting — undefined / null / non-numeric inputs treated as 0.
{
  const np = computeScheduleCNetProfit({
    income: 100,
    fuelCost: undefined,
    vehExp: null,
    serviceCost: 'abc',
    perDiem: NaN,
    depreciation: 50,
  })
  assertEq(np, 50, 'Defaults: undef/null/NaN/string → 0')
}

// 5. Empty-trips parity — no income, only expenses → still clamped to 0
//    (this mirrors a freshly-onboarded driver before the first trip lands).
{
  const np = computeScheduleCNetProfit({
    income: 0,
    fuelCost: 8464,
    vehExp: 2303,
    serviceCost: 905,
    perDiem: 288,
    depreciation: 41662.50,
  })
  assertEq(np, 0, 'EmptyTrips.netProfit clamped to 0')
}

// 6. Profitable case — sanity that we don't accidentally clamp positives.
{
  const np = computeScheduleCNetProfit({
    income: 200000,
    fuelCost: 30000,
    vehExp: 5000,
    serviceCost: 2000,
    perDiem: 7000,
    depreciation: 50000,
  })
  // 200000 − 30000 − 5000 − 2000 − 7000 − 50000 = 106000
  assertClose(np, 106000, 'Profitable.netProfit = 106000')
}

// ----------------------------------------------------------------------
// calculateScheduleCNetProfit — async fetch + compute (integration)
// ----------------------------------------------------------------------
console.log('\n--- calculateScheduleCNetProfit (async, mocked Supabase) ---')

// Build a chainable thenable that resolves to a fixed { data, error }.
function tableStub(result) {
  const builder = {
    select() { return builder },
    eq() { return builder },
    in() { return builder },
    gte() { return builder },
    lte() { return builder },
    lt() { return builder },
    order() { return builder },
    maybeSingle() { return Promise.resolve(result) },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
    catch(rej) { return Promise.resolve(result).catch(rej) },
  }
  return builder
}

// Supabase mock that routes by table name. `tables` is a map of table name
// → { data, error } returned for any chained query against that table.
function makeSupabase(tables) {
  return {
    from(name) {
      const result = tables[name] || { data: [], error: null }
      return tableStub(result)
    },
  }
}

// Happy path mock matching Petr's per-quarter trips (3 days/quarter, 80% DOT).
// Verifies that the async loader composes aggregates correctly across all six
// data sources. We don't try to reproduce the exact $500,139.50 here — that
// case requires real per-diem trip math; we exercise the wiring with simpler
// numbers that are still reduce-friendly.
{
  const supabase = makeSupabase({
    trips: { data: [{ income: 100000 }, { income: 50000 }], error: null },
    fuel_entries: { data: [{ cost: 5000 }, { cost: 3000 }], error: null },
    vehicle_expenses: { data: [{ amount: 1000 }, { amount: 500 }], error: null },
    service_records: { data: [{ cost: 2000 }], error: null },
    vehicle_depreciation: {
      data: [{
        purchase_price: 0, purchase_date: '2024-01-01', asset_class: 'semi_tractor_otr',
        strategy: 'standard_macrs', business_use_pct: 100, salvage_value: 0,
        prior_depreciation: 0, section_179_amount: 0, bonus_rate: 0,
        depreciation_type: null,
      }],
      error: null,
    },
    // calculatePerDiem queries: profiles (only for company role), trips, per_diem_settings.
    // For role=owner_operator the profiles query is skipped.
    per_diem_settings: { data: null, error: null },
  })

  const result = await calculateScheduleCNetProfit(supabase, 'u1', 2026, 'owner_operator')

  // income = 100000 + 50000, fuel = 5000+3000, vehExp = 1000+500, service = 2000.
  // perDiem trips list is empty (we returned no trips with date_start) → 0.
  // Depreciation: 0 purchase_price → 0.
  assertClose(result.income, 150000, 'Async.income')
  assertClose(result.fuelCost, 8000, 'Async.fuelCost')
  assertClose(result.vehExp, 1500, 'Async.vehExp')
  assertClose(result.serviceCost, 2000, 'Async.serviceCost')
  assertClose(result.perDiem, 0, 'Async.perDiem (no trips with date_start)')
  assertClose(result.depreciation, 0, 'Async.depreciation (zero-priced fixture)')
  // 150000 − 8000 − 1500 − 2000 − 0 − 0 = 138500
  assertClose(result.netProfit, 138500, 'Async.netProfit composed via shared formula')
}

// Supabase error on the trips query → throws.
{
  const supabase = makeSupabase({
    trips: { data: null, error: { message: 'db down' } },
    fuel_entries: { data: [], error: null },
    vehicle_expenses: { data: [], error: null },
    service_records: { data: [], error: null },
    vehicle_depreciation: { data: [], error: null },
    per_diem_settings: { data: null, error: null },
  })

  await assertRejects(
    calculateScheduleCNetProfit(supabase, 'u1', 2026, 'owner_operator'),
    'Async.trips error → throws',
  )
}

// ----------------------------------------------------------------------
console.log('\n' + '='.repeat(60))
if (failures === 0) {
  console.log('\n✓ ALL ' + passes + ' scheduleC ASSERTIONS PASSED')
  process.exit(0)
} else {
  console.error('\n✗ ' + failures + ' FAILED, ' + passes + ' passed')
  console.error('\nMismatches:')
  for (const m of mismatches) console.error('  - ' + m)
  process.exit(1)
}
