// Tests for src/lib/dateHelpers.js — local-timezone date string helper.
// Run with `node`; exits 0 iff every assertion holds.

import { getLocalDateString } from './dateHelpers.js'

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

function assertMatches(actual, regex, label) {
  if (regex.test(actual)) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (actual=' + JSON.stringify(actual) + ', expected to match ' + regex + ')')
    console.error('  FAIL ' + label + ': expected ' + actual + ' to match ' + regex)
  }
}

console.log('\n=== dateHelpers tests ===\n')

// ----------------------------------------------------------------------
// Test 1 — Basic formatting
// ----------------------------------------------------------------------
{
  const date = new Date(2026, 3, 26) // April 26, 2026 (month is 0-indexed)
  assertEq(getLocalDateString(date), '2026-04-26', 'Test1: returns YYYY-MM-DD format')
}

// ----------------------------------------------------------------------
// Test 2 — Pads single-digit month and day
// ----------------------------------------------------------------------
{
  const date = new Date(2026, 0, 5) // January 5
  assertEq(getLocalDateString(date), '2026-01-05', 'Test2: pads single-digit month and day')
  const dateDec1 = new Date(2026, 11, 1) // December 1
  assertEq(getLocalDateString(dateDec1), '2026-12-01', 'Test2: pads single-digit day with double-digit month')
}

// ----------------------------------------------------------------------
// Test 3 — Local date differs from UTC near midnight (TZ-aware test)
// ----------------------------------------------------------------------
{
  // Instant: April 27 04:30:00 UTC. In any timezone west of UTC by >= 5h
  // (e.g. US Eastern UTC-5, Central UTC-6, ... Hawaii UTC-10), this is
  // still April 26 local time. toISOString().slice(0,10) would give
  // "2026-04-27" (UTC), but getLocalDateString should give "2026-04-26"
  // for those runtimes.
  const utcInstant = new Date('2026-04-27T04:30:00.000Z')
  const tzOffsetMin = utcInstant.getTimezoneOffset() // minutes (positive = west of UTC)
  // Local hour after applying offset
  const localHour = utcInstant.getHours()
  const localDate = utcInstant.getDate()
  const expected = `${utcInstant.getFullYear()}-${String(utcInstant.getMonth() + 1).padStart(2, '0')}-${String(localDate).padStart(2, '0')}`
  assertEq(
    getLocalDateString(utcInstant),
    expected,
    `Test3: local date matches Date.getDate() (TZ offset=${tzOffsetMin}min, local hour=${localHour})`,
  )

  // Sanity: when run in UTC-5 or further west, local date IS April 26.
  if (tzOffsetMin >= 5 * 60) {
    assertEq(getLocalDateString(utcInstant), '2026-04-26',
      'Test3 strict (UTC-5+): local date is 2026-04-26 even though UTC is 2026-04-27')
  }
}

// ----------------------------------------------------------------------
// Test 4 — No-argument call returns valid format for "now"
// ----------------------------------------------------------------------
{
  const result = getLocalDateString()
  assertMatches(result, /^\d{4}-\d{2}-\d{2}$/, 'Test4: no-arg call returns YYYY-MM-DD')
}

// ----------------------------------------------------------------------
// Test 5 — Handles invalid input
// ----------------------------------------------------------------------
{
  assertEq(getLocalDateString(new Date('not-a-date')), '', 'Test5: invalid date returns empty string')
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
console.log('\nAll dateHelpers tests passed.\n')
