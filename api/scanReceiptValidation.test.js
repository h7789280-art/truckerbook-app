// Tests for api/scanReceiptValidation.js — server-side defense against
// scan-receipt responses that would corrupt YTD aggregations or year-end
// CPA exports. Run with `node`; exits 0 iff every assertion holds.
//
// Strategy: hit validateReceiptResponse() with synthetic Gemini responses
// covering each rejection path AND a happy-path control. We pin the
// "current date" via opts.maxDate so tests don't break on the real clock.

import { validateReceiptResponse } from './scanReceiptValidation.js'

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

console.log('\n=== scanReceiptValidation tests ===\n')

// Pin "today" so these tests are deterministic regardless of when CI
// runs them. 2026-04-26 mirrors the project's current operating date.
const TODAY = '2026-04-26'

// ----------------------------------------------------------------------
// Test 1 — Currency rejection: Gemini flagged non_usd_currency=RUB
// ----------------------------------------------------------------------
{
  const resp = { error: 'non_usd_currency', detected_currency: 'RUB', total: 1234.56, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test1 currency RUB: ok=false')
  assertEq(r.userError, 'non_usd_currency', 'Test1 currency RUB: userError')
  assertEq(r.detectedCurrency, 'RUB', 'Test1 currency RUB: detectedCurrency echo')
}

// ----------------------------------------------------------------------
// Test 2 — Date too old: 1970-01-01 (Unix epoch sentinel)
// ----------------------------------------------------------------------
{
  const resp = { date: '1970-01-01', total: 50, items: [{ description: 'fuel', amount: 50 }] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test2 date 1970: ok=false')
  assertEq(r.userError, 'date_out_of_range', 'Test2 date 1970: userError=date_out_of_range')
  assertEq(r.detectedDate, '1970-01-01', 'Test2 date 1970: detectedDate echo')
}

// ----------------------------------------------------------------------
// Test 3 — Date in future: 2030-01-01 (after clock-pin TODAY)
// ----------------------------------------------------------------------
{
  const resp = { date: '2030-01-01', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test3 date 2030: ok=false')
  assertEq(r.userError, 'date_out_of_range', 'Test3 date 2030: userError=date_out_of_range')
  assertEq(r.detectedDate, '2030-01-01', 'Test3 date 2030: detectedDate echo')
}

// ----------------------------------------------------------------------
// Test 4 — Date malformed: not ISO 8601, garbage string
// ----------------------------------------------------------------------
{
  const resp = { date: 'not a date', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test4 malformed date: ok=false')
  assertEq(r.userError, 'date_invalid', 'Test4 malformed date: userError=date_invalid')
}

// ----------------------------------------------------------------------
// Test 5 — Amount zero: total=0
// ----------------------------------------------------------------------
{
  const resp = { date: '2026-04-01', total: 0, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test5 amount zero: ok=false')
  assertEq(r.userError, 'amount_invalid', 'Test5 amount zero: userError=amount_invalid')
}

// ----------------------------------------------------------------------
// Test 6 — Amount negative: total=-10
// ----------------------------------------------------------------------
{
  const resp = { date: '2026-04-01', total: -10, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test6 amount negative: ok=false')
  assertEq(r.userError, 'amount_invalid', 'Test6 amount negative: userError=amount_invalid')
  assertEq(r.detectedAmount, -10, 'Test6 amount negative: detectedAmount echo')
}

// ----------------------------------------------------------------------
// Test 7 — Amount too large: total=999999 (over $100k cap)
// ----------------------------------------------------------------------
{
  const resp = { date: '2026-04-01', total: 999999, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test7 amount huge: ok=false')
  assertEq(r.userError, 'amount_invalid', 'Test7 amount huge: userError=amount_invalid')
}

// ----------------------------------------------------------------------
// Test 8 — Happy path: valid date + valid amount
// ----------------------------------------------------------------------
{
  const resp = {
    date: '2026-04-15',
    total: 88.50,
    store_name: 'Pilot',
    items: [{ description: 'Diesel', amount: 88.50, category: 'fuel' }],
  }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'Test8 happy: ok=true')
  assertEq(r.parsed.date, '2026-04-15', 'Test8 happy: parsed.date passthrough')
  assertEq(r.parsed.total, 88.50, 'Test8 happy: parsed.total passthrough')
}

// ----------------------------------------------------------------------
// Bonus: edge cases that defend the contract
// ----------------------------------------------------------------------

// 9 — ambiguous_european_format → also non_usd_currency
{
  const resp = { error: 'ambiguous_european_format', detected_currency: 'ambiguous_european_format' }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.userError, 'non_usd_currency', 'Test9 ambiguous EU format: → non_usd_currency')
}

// 10 — Gemini returned date_unreadable error directly
{
  const resp = { error: 'date_unreadable' }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.userError, 'date_invalid', 'Test10 date_unreadable: → date_invalid')
}

// 11 — Gemini returned date_in_future error directly with detected_date
{
  const resp = { error: 'date_in_future', detected_date: '2099-12-31' }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.userError, 'date_out_of_range', 'Test11 date_in_future: → date_out_of_range')
  assertEq(r.detectedDate, '2099-12-31', 'Test11 date_in_future: detectedDate echo')
}

// 12 — Boundary: MIN_RECEIPT_DATE (2017-01-01) should be accepted
{
  const resp = { date: '2017-01-01', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'Test12 boundary 2017-01-01: ok=true (inclusive minimum)')
}

// 13 — Boundary: 2016-12-31 should be rejected (older than statute)
{
  const resp = { date: '2016-12-31', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test13 boundary 2016-12-31: ok=false (below MIN_RECEIPT_DATE)')
  assertEq(r.userError, 'date_out_of_range', 'Test13: userError=date_out_of_range')
}

// 14 — Boundary: TODAY itself accepted
{
  const resp = { date: TODAY, total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'Test14 boundary today: ok=true (inclusive maximum)')
}

// 15 — null total → amount_invalid (Gemini returned no parseable total)
{
  const resp = { date: '2026-04-15', total: null, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test15 null total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'Test15 null total: userError=amount_invalid')
}

// 16 — string total ("88.50" instead of 88.50) → amount_invalid (we want a number)
{
  const resp = { date: '2026-04-15', total: '88.50', items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'Test16 string total: ok=false (refuse string)')
  assertEq(r.userError, 'amount_invalid', 'Test16 string total: userError=amount_invalid')
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
console.log('\nAll scanReceiptValidation tests passed.\n')
