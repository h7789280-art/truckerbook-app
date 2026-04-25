// Tests for vehicleAggregates.js — multi-record aggregation across the
// vehicle_depreciation table. Run with `node`; exits 0 iff every assertion
// holds within ±$1 tolerance.
//
// We do not test depreciationCalculator math here (it has its own SPEC-frozen
// suite). We test that the aggregator (a) sums correctly across N rows,
// (b) tolerates broken/empty data without throwing, (c) propagates Supabase
// errors, and (d) emits the correct 10-year UBIA window to Supabase.

import { getTotalDepreciationForYear, getTotalUBIAForYear } from './vehicleAggregates.js'
import { getCurrentYearDeduction } from '../lib/tax/depreciationCalculator.js'

let failures = 0
let passes = 0
const mismatches = []

function assertClose(actual, expected, label, tol = 1) {
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

// Minimal thenable Supabase mock — captures call args for window-window
// assertions, returns a fixed { data, error } when awaited.
function makeMockSupabase({ rows = [], error = null } = {}) {
  const calls = []
  const result = error ? { data: null, error } : { data: rows, error: null }
  const builder = {
    select(s) { calls.push(['select', s]); return builder },
    eq(col, val) { calls.push(['eq', col, val]); return builder },
    gte(col, val) { calls.push(['gte', col, val]); return builder },
    lte(col, val) { calls.push(['lte', col, val]); return builder },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
  }
  return {
    from(table) { calls.push(['from', table]); return builder },
    _calls: calls,
  }
}

const TAX_YEAR = 2026

// Reference fixtures — Peter's tractor + a 2025 trailer.
const peterTractor = {
  purchase_price: 125000,
  purchase_date: '2023-04-11',
  asset_class: 'semi_tractor_otr',
  strategy: 'standard_macrs',
  business_use_pct: 100,
  salvage_value: 0,
  prior_depreciation: 0,
  section_179_amount: 0,
  bonus_rate: 0,
  depreciation_type: null,
}

const trailer2025 = {
  purchase_price: 40000,
  purchase_date: '2025-06-15',
  asset_class: 'trailer',
  strategy: 'standard_macrs',
  business_use_pct: 100,
  salvage_value: 0,
  prior_depreciation: 0,
  section_179_amount: 0,
  bonus_rate: 0,
  depreciation_type: null,
}

console.log('\n=== vehicleAggregates tests ===\n')

// ----------------------------------------------------------------------
// getTotalDepreciationForYear
// ----------------------------------------------------------------------
console.log('--- getTotalDepreciationForYear ---')

// 1. No vehicles → 0
{
  const dep = await getTotalDepreciationForYear(makeMockSupabase({ rows: [] }), 'u', TAX_YEAR)
  assertEq(dep, 0, 'Dep1: empty result → 0')
}

// 2. One vehicle (Peter's tractor) → matches getCurrentYearDeduction exactly
{
  const dep = await getTotalDepreciationForYear(makeMockSupabase({ rows: [peterTractor] }), 'u', TAX_YEAR)
  const expected = getCurrentYearDeduction(peterTractor, TAX_YEAR)
  assertClose(dep, expected, 'Dep2: one record matches getCurrentYearDeduction')
  // Sanity: Peter's tractor should produce a positive depreciation in 2026.
  if (!(expected > 0)) {
    failures++
    mismatches.push('Dep2-precondition: expected getCurrentYearDeduction(peterTractor, 2026) > 0, got ' + expected)
    console.error('  FAIL Dep2-precondition: getCurrentYearDeduction returned ' + expected + ' (test fixture is wrong)')
  } else {
    passes++
  }
}

// 3. Two vehicles → SUM of the two getCurrentYearDeduction values
{
  const dep = await getTotalDepreciationForYear(makeMockSupabase({ rows: [peterTractor, trailer2025] }), 'u', TAX_YEAR)
  const expected = getCurrentYearDeduction(peterTractor, TAX_YEAR) + getCurrentYearDeduction(trailer2025, TAX_YEAR)
  assertClose(dep, expected, 'Dep3: two records sum across both getCurrentYearDeduction calls')
}

// 4. Broken record (purchase_price=null) → does not throw, contributes 0
{
  const broken = { ...peterTractor, purchase_price: null }
  const dep = await getTotalDepreciationForYear(makeMockSupabase({ rows: [broken] }), 'u', TAX_YEAR)
  assertClose(dep, 0, 'Dep4: null purchase_price does not throw, contributes 0')
}

// 4b. Mixed good + broken → equals just the good one
{
  const broken = { ...peterTractor, purchase_price: null }
  const dep = await getTotalDepreciationForYear(
    makeMockSupabase({ rows: [peterTractor, broken] }),
    'u',
    TAX_YEAR,
  )
  const expected = getCurrentYearDeduction(peterTractor, TAX_YEAR)
  assertClose(dep, expected, 'Dep4b: broken record skipped, good record summed')
}

// 5. Supabase returns error → throws
await assertRejects(
  getTotalDepreciationForYear(makeMockSupabase({ error: { message: 'db fail' } }), 'u', TAX_YEAR),
  'Dep5: Supabase error throws',
)

// ----------------------------------------------------------------------
// getTotalUBIAForYear
// ----------------------------------------------------------------------
console.log('--- getTotalUBIAForYear ---')

// 6. No vehicles → 0
{
  const ubia = await getTotalUBIAForYear(makeMockSupabase({ rows: [] }), 'u', TAX_YEAR)
  assertEq(ubia, 0, 'UBIA6: empty result → 0')
}

// 7. Peter's tractor @ 100% → $125,000
{
  const ubia = await getTotalUBIAForYear(makeMockSupabase({ rows: [peterTractor] }), 'u', TAX_YEAR)
  assertClose(ubia, 125_000, 'UBIA7: $125k @ 100% → 125000')
}

// 8. Peter's tractor @ 80% → $100,000
{
  const ubia = await getTotalUBIAForYear(
    makeMockSupabase({ rows: [{ ...peterTractor, business_use_pct: 80 }] }),
    'u',
    TAX_YEAR,
  )
  assertClose(ubia, 100_000, 'UBIA8: $125k @ 80% → 100000')
}

// 9. Two vehicles @ 100% → $125k + $40k = $165,000
{
  const ubia = await getTotalUBIAForYear(
    makeMockSupabase({ rows: [peterTractor, trailer2025] }),
    'u',
    TAX_YEAR,
  )
  assertClose(ubia, 165_000, 'UBIA9: $125k + $40k → 165000')
}

// 10. Out-of-window vehicle (purchase_date 11 years before taxYear) → Supabase
//     filters it out. We assert the correct 10-year window args were sent.
{
  const mock = makeMockSupabase({ rows: [] })
  const ubia = await getTotalUBIAForYear(mock, 'u', 2026)
  assertEq(ubia, 0, 'UBIA10a: out-of-window result → 0')

  const gte = mock._calls.find(c => c[0] === 'gte')
  const lte = mock._calls.find(c => c[0] === 'lte')
  assertEq(gte && gte[1], 'purchase_date', 'UBIA10b: gte column is purchase_date')
  assertEq(gte && gte[2], '2016-12-31', 'UBIA10c: gte value is 2016-12-31 (taxYear-10)')
  assertEq(lte && lte[1], 'purchase_date', 'UBIA10d: lte column is purchase_date')
  assertEq(lte && lte[2], '2026-12-31', 'UBIA10e: lte value is 2026-12-31 (taxYear)')
}

// 11. Vehicle bought on the very last day of taxYear is included
{
  const ubia = await getTotalUBIAForYear(
    makeMockSupabase({ rows: [{ ...peterTractor, purchase_date: '2026-12-31' }] }),
    'u',
    2026,
  )
  assertClose(ubia, 125_000, 'UBIA11: 2026-12-31 included in window → 125000')
}

// 12. Supabase returns error → throws
await assertRejects(
  getTotalUBIAForYear(makeMockSupabase({ error: { message: 'db fail' } }), 'u', TAX_YEAR),
  'UBIA12: Supabase error throws',
)

// ----------------------------------------------------------------------
console.log('\n' + '='.repeat(60))
if (failures === 0) {
  console.log('\n✓ ALL ' + passes + ' vehicleAggregates ASSERTIONS PASSED')
  process.exit(0)
} else {
  console.error('\n✗ ' + failures + ' FAILED, ' + passes + ' passed')
  console.error('\nMismatches:')
  for (const m of mismatches) console.error('  - ' + m)
  process.exit(1)
}
