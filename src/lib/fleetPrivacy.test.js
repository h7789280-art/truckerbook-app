// Tests for src/lib/fleetPrivacy.js — fleet/company role byt_expenses
// privacy boundary. Run with `node`; exits 0 iff every assertion holds.
//
// We mock Supabase as a chainable thenable that records every call and
// applies the .in / .eq / .gte / .lt filters to a fixed in-memory row
// set. That lets us assert two things at once: (a) the helper builds
// the correct query (spy on .eq for 'visibility'), and (b) the result
// actually excludes personal rows even when the mock DB carries them.

import {
  fetchFleetBytExpenses,
  fetchOwnBytExpensesForReport,
} from './fleetPrivacy.js'

let failures = 0
let passes = 0
const mismatches = []

function assertEq(actual, expected, label) {
  if (actual === expected) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (actual=' + JSON.stringify(actual) + ', expected=' + JSON.stringify(expected) + ')')
    console.error('  FAIL ' + label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
  }
}

function assertTrue(cond, label) {
  if (cond) {
    passes++
  } else {
    failures++
    mismatches.push(label)
    console.error('  FAIL ' + label)
  }
}

// Chainable mock supabase that records every call AND applies the
// in/eq/gte/lt filters to a row set, mimicking PostgREST behavior
// closely enough to verify privacy contracts.
function makeMockSupabase({ rows = [], error = null } = {}) {
  const calls = []
  let preds = []
  const builder = {
    from(t) { calls.push(['from', t]); return builder },
    select(s) { calls.push(['select', s]); return builder },
    in(col, vals) { calls.push(['in', col, vals]); preds.push(r => vals.includes(r[col])); return builder },
    eq(col, val) { calls.push(['eq', col, val]); preds.push(r => r[col] === val); return builder },
    gte(col, val) { calls.push(['gte', col, val]); preds.push(r => r[col] >= val); return builder },
    lt(col, val) { calls.push(['lt', col, val]); preds.push(r => r[col] < val); return builder },
    order(col, opts) { calls.push(['order', col, opts]); return builder },
    then(resolve, reject) {
      if (error) return Promise.resolve({ data: null, error }).then(resolve, reject)
      const filtered = rows.filter(r => preds.every(p => p(r)))
      return Promise.resolve({ data: filtered, error: null }).then(resolve, reject)
    },
  }
  return { from: builder.from.bind(builder), _calls: calls }
}

function eqCalls(supabase) {
  return supabase._calls.filter(c => c[0] === 'eq')
}

console.log('\n=== fleetPrivacy tests ===\n')

const OWNER = 'owner-123'
const DRIVER_A = 'driver-A'
const DRIVER_B = 'driver-B'
const ALL_USERS = [OWNER, DRIVER_A, DRIVER_B]

// Mixed dataset: drivers carry both personal (food/shower/laundry) and
// business (forced motel during dispatch) entries. Owner has both too.
const MIXED_ROWS = [
  // Driver A — personal stuff (must NOT leak to owner)
  { id: 'a1', user_id: DRIVER_A, category: 'food',    name: 'Breakfast', amount: 12,  date: '2026-04-05', visibility: 'personal' },
  { id: 'a2', user_id: DRIVER_A, category: 'shower',  name: 'TA shower', amount: 15,  date: '2026-04-07', visibility: 'personal' },
  { id: 'a3', user_id: DRIVER_A, category: 'tobacco', name: 'cigarettes',amount: 8,   date: '2026-04-09', visibility: 'personal' },
  // Driver A — business stuff (motel forced stop, fleet owner pays)
  { id: 'a4', user_id: DRIVER_A, category: 'hotel',   name: 'Motel 6',   amount: 110, date: '2026-04-10', visibility: 'business' },
  // Driver B — personal stuff
  { id: 'b1', user_id: DRIVER_B, category: 'laundry', name: 'Laundromat',amount: 9,   date: '2026-04-12', visibility: 'personal' },
  // Driver B — business
  { id: 'b2', user_id: DRIVER_B, category: 'hotel',   name: 'Days Inn',  amount: 95,  date: '2026-04-14', visibility: 'business' },
  // Owner's own personal + business
  { id: 'o1', user_id: OWNER,    category: 'food',    name: 'Lunch',     amount: 14,  date: '2026-04-08', visibility: 'personal' },
  { id: 'o2', user_id: OWNER,    category: 'hotel',   name: 'La Quinta', amount: 120, date: '2026-04-15', visibility: 'business' },
  // Out of window — must be excluded by date filters regardless
  { id: 'old', user_id: DRIVER_A, category: 'food',   name: 'Coffee',    amount: 4,   date: '2026-03-15', visibility: 'personal' },
]

const START = '2026-04-01'
const END = '2026-05-01'

// ----------------------------------------------------------------------
// Test 1 — Spy: fetchFleetBytExpenses MUST call .eq('visibility', 'business')
// ----------------------------------------------------------------------
{
  const supa = makeMockSupabase({ rows: MIXED_ROWS })
  await fetchFleetBytExpenses(supa, ALL_USERS, START, END)
  const eqs = eqCalls(supa)
  const hasVisibilityBusiness = eqs.some(c => c[1] === 'visibility' && c[2] === 'business')
  assertTrue(
    hasVisibilityBusiness,
    "Test1 spy: fetchFleetBytExpenses calls supabase.eq('visibility', 'business')",
  )
}

// ----------------------------------------------------------------------
// Test 2 — Absence: result excludes personal rows even if DB has them
// ----------------------------------------------------------------------
{
  const supa = makeMockSupabase({ rows: MIXED_ROWS })
  const data = await fetchFleetBytExpenses(supa, ALL_USERS, START, END)
  const personalLeaks = data.filter(r => r.visibility === 'personal')
  assertEq(personalLeaks.length, 0, 'Test2 absence: zero personal rows leak to fleet')
  // Sanity: business rows in window DO come through
  const ids = data.map(r => r.id).sort()
  assertEq(ids.join(','), ['a4', 'b2', 'o2'].join(','), 'Test2 sanity: only business rows in window returned (a4,b2,o2)')
}

// ----------------------------------------------------------------------
// Test 3 — Driver own access: NO visibility=business filter applied
// ----------------------------------------------------------------------
// fetchOwnBytExpensesForReport is the owner-self path used by
// fetchFleetReportExportData. It must NOT add `.eq('visibility','business')`
// — the owner sees their own personal entries on their own dashboard.
{
  const supa = makeMockSupabase({ rows: MIXED_ROWS })
  const data = await fetchOwnBytExpensesForReport(supa, OWNER, START, END)
  const eqs = eqCalls(supa)
  const hasVisibilityBusiness = eqs.some(c => c[1] === 'visibility' && c[2] === 'business')
  assertEq(
    hasVisibilityBusiness,
    false,
    "Test3 driver own access: helper does NOT add .eq('visibility','business')",
  )
  // Driver should see BOTH their personal and business entries
  const ids = data.map(r => r.id).sort()
  assertEq(
    ids.join(','),
    ['o1', 'o2'].join(','),
    'Test3: own access returns both personal (o1) and business (o2) entries',
  )
}

// ----------------------------------------------------------------------
// Test 4 — Edge case: empty allUserIds short-circuits to []
// ----------------------------------------------------------------------
{
  const supa = makeMockSupabase({ rows: MIXED_ROWS })
  const data = await fetchFleetBytExpenses(supa, [], START, END)
  assertEq(data.length, 0, 'Test4: empty allUserIds → []')
  assertEq(supa._calls.length, 0, 'Test4: no supabase calls made for empty allUserIds')
}

// ----------------------------------------------------------------------
// Test 5 — Edge case: Supabase error returns [] (does not throw)
// ----------------------------------------------------------------------
{
  const supa = makeMockSupabase({ error: { message: 'network' } })
  const data = await fetchFleetBytExpenses(supa, ALL_USERS, START, END)
  assertEq(data.length, 0, 'Test5: Supabase error returns [] (does not throw, fail-closed)')
}

// ----------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------
console.log('\n=== Results ===')
console.log('  Passed: ' + passes)
console.log('  Failed: ' + failures)
if (failures > 0) {
  console.error('\nMismatches:')
  for (const m of mismatches) console.error('  - ' + m)
  process.exit(1)
}
console.log('\nAll fleetPrivacy tests passed.\n')
