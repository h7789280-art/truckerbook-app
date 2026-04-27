// Tests for api/smartScanValidation.js — server-side defense against
// /api/smart-scan responses that would corrupt YTD aggregations or
// year-end CPA exports. Run with `node`; exits 0 iff every assertion holds.
//
// Strategy: hit each validator with synthetic Gemini responses covering
// every rejection path AND a happy-path control. We pin the "current date"
// via opts.maxDate so tests don't break on the real clock.

import {
  validateReceiptResponse,
  validateTripResponse,
  validateRepairResponse,
} from './smartScanValidation.js'

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

console.log('\n=== smartScanValidation tests ===\n')

// Pin "today" so these tests are deterministic regardless of when CI
// runs them. 2026-04-26 mirrors the project's current operating date.
const TODAY = '2026-04-26'
// Trip-specific maxDate is today+90d
const TRIP_MAX = '2026-07-25'

// ══════════════════════════════════════════════════════════════════════
// validateReceiptResponse
// ══════════════════════════════════════════════════════════════════════

console.log('-- validateReceiptResponse --')

// Test 1 — Currency rejection: Gemini flagged non_usd_currency=RUB
{
  const resp = { error: 'non_usd_currency', detected_currency: 'RUB', total: 1234.56, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R1 currency RUB: ok=false')
  assertEq(r.userError, 'non_usd_currency', 'R1 currency RUB: userError')
  assertEq(r.detectedCurrency, 'RUB', 'R1 currency RUB: detectedCurrency echo')
}

// Test 2 — Date too old: 1970-01-01
{
  const resp = { date: '1970-01-01', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R2 date 1970: ok=false')
  assertEq(r.userError, 'date_out_of_range', 'R2 date 1970: userError')
}

// Test 3 — Date in future: 2030-01-01
{
  const resp = { date: '2030-01-01', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R3 date 2030: ok=false')
  assertEq(r.userError, 'date_out_of_range', 'R3 date 2030: userError')
}

// Test 4 — Date malformed
{
  const resp = { date: 'not a date', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R4 malformed date: ok=false')
  assertEq(r.userError, 'date_invalid', 'R4 malformed date: userError')
}

// Test 5 — Amount zero
{
  const resp = { date: '2026-04-01', total: 0, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R5 zero total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'R5 zero total: userError')
}

// Test 6 — Amount negative
{
  const resp = { date: '2026-04-01', total: -10, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R6 negative total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'R6 negative total: userError')
}

// Test 7 — Amount too large (>$100k)
{
  const resp = { date: '2026-04-01', total: 999999, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R7 huge total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'R7 huge total: userError')
}

// Test 8 — Happy path
{
  const resp = {
    date: '2026-04-15',
    total: 88.50,
    store_name: 'Pilot',
    items: [{ description: 'Diesel', amount: 88.50, category: 'fuel' }],
  }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'R8 happy: ok=true')
  assertEq(r.parsed.date, '2026-04-15', 'R8 happy: date passthrough')
  assertEq(r.parsed.total, 88.50, 'R8 happy: total passthrough')
}

// Test 9 — ambiguous_european_format → non_usd_currency
{
  const resp = { error: 'ambiguous_european_format' }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.userError, 'non_usd_currency', 'R9 EU ambiguous: → non_usd_currency')
}

// Test 10 — date_unreadable error
{
  const resp = { error: 'date_unreadable' }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.userError, 'date_invalid', 'R10 date_unreadable: → date_invalid')
}

// Test 11 — date_in_future error
{
  const resp = { error: 'date_in_future', detected_date: '2099-12-31' }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.userError, 'date_out_of_range', 'R11 date_in_future: → date_out_of_range')
  assertEq(r.detectedDate, '2099-12-31', 'R11 date_in_future: detectedDate echo')
}

// Test 12 — Boundary MIN_RECEIPT_DATE inclusive
{
  const resp = { date: '2017-01-01', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'R12 boundary 2017-01-01: ok=true')
}

// Test 13 — Boundary 2016-12-31 rejected
{
  const resp = { date: '2016-12-31', total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R13 boundary 2016-12-31: ok=false')
  assertEq(r.userError, 'date_out_of_range', 'R13 boundary 2016-12-31: userError')
}

// Test 14 — Boundary TODAY accepted
{
  const resp = { date: TODAY, total: 50, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'R14 boundary today: ok=true')
}

// Test 15 — null total
{
  const resp = { date: '2026-04-15', total: null, items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R15 null total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'R15 null total: userError')
}

// Test 16 — string total
{
  const resp = { date: '2026-04-15', total: '88.50', items: [] }
  const r = validateReceiptResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'R16 string total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'R16 string total: userError')
}

// ══════════════════════════════════════════════════════════════════════
// validateTripResponse
// ══════════════════════════════════════════════════════════════════════

console.log('\n-- validateTripResponse --')

// Test T1 — Happy path
{
  const resp = {
    miles: 2750, deadhead_miles: 50, rate: 5500, rate_per_mile: 2.0,
    pickup_date: '2026-04-15', delivery_date: '2026-04-18',
    origin_city: 'Miami', origin_state: 'FL',
    destination_city: 'Los Angeles', destination_state: 'CA',
  }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, true, 'T1 happy: ok=true')
  assertEq(r.parsed.miles, 2750, 'T1 happy: miles passthrough')
}

// Test T2 — miles out of range (negative)
{
  const resp = { miles: -100, rate: 1000 }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T2 negative miles: ok=false')
  assertEq(r.userError, 'miles_invalid', 'T2 negative miles: userError')
}

// Test T3 — miles too high (>5000)
{
  const resp = { miles: 9999, rate: 1000 }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T3 huge miles: ok=false')
  assertEq(r.userError, 'miles_invalid', 'T3 huge miles: userError')
}

// Test T4 — rate negative
{
  const resp = { miles: 100, rate: -50 }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T4 negative rate: ok=false')
  assertEq(r.userError, 'rate_invalid', 'T4 negative rate: userError')
}

// Test T5 — rate zero
{
  const resp = { miles: 100, rate: 0 }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T5 zero rate: ok=false')
  assertEq(r.userError, 'rate_invalid', 'T5 zero rate: userError')
}

// Test T6 — rate too high
{
  const resp = { miles: 100, rate: 999999 }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T6 huge rate: ok=false')
  assertEq(r.userError, 'rate_invalid', 'T6 huge rate: userError')
}

// Test T7 — rate_per_mile out of range
{
  const resp = { miles: 100, rate: 5000, rate_per_mile: 50 }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T7 rpm too high: ok=false')
  assertEq(r.userError, 'rate_invalid', 'T7 rpm too high: userError')
}

// Test T8 — pickup_date too far in future (>90d)
{
  const resp = { miles: 100, rate: 500, pickup_date: '2027-01-01' }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T8 pickup_date far future: ok=false')
  assertEq(r.userError, 'date_invalid', 'T8 pickup_date: userError')
}

// Test T9 — pickup_date too old
{
  const resp = { miles: 100, rate: 500, pickup_date: '2019-01-01' }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T9 pickup_date too old: ok=false')
  assertEq(r.userError, 'date_invalid', 'T9 pickup_date too old: userError')
}

// Test T10 — null pickup_date is allowed
{
  const resp = { miles: 100, rate: 500, pickup_date: null }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, true, 'T10 null pickup_date: ok=true')
}

// Test T11 — invalid origin_state
{
  const resp = { miles: 100, rate: 500, origin_state: 'CALIFORNIA' }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T11 long state: ok=false')
  assertEq(r.userError, 'state_invalid', 'T11 long state: userError')
}

// Test T12 — deadhead too high (sanity)
{
  const resp = { miles: 100, rate: 500, deadhead_miles: 500 }
  const r = validateTripResponse(resp, { maxDate: TRIP_MAX })
  assertEq(r.ok, false, 'T12 huge deadhead: ok=false')
  assertEq(r.userError, 'miles_invalid', 'T12 huge deadhead: userError')
}

// ══════════════════════════════════════════════════════════════════════
// validateRepairResponse
// ══════════════════════════════════════════════════════════════════════

console.log('\n-- validateRepairResponse --')

// Test P1 — Happy path
{
  const resp = {
    shop_name: 'Joe\'s Truck Repair',
    date: '2026-04-15',
    total: 1250.50,
    mileage: 543000,
    items: [{ description: 'Brake pads', amount: 450, category: 'parts' }],
  }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'P1 happy: ok=true')
  assertEq(r.parsed.total, 1250.50, 'P1 happy: total passthrough')
}

// Test P2 — total too high (>$100k)
{
  const resp = { date: '2026-04-15', total: 250000 }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'P2 huge total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'P2 huge total: userError')
}

// Test P3 — date in future
{
  const resp = { date: '2030-01-01', total: 500 }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'P3 future date: ok=false')
  assertEq(r.userError, 'date_out_of_range', 'P3 future date: userError')
}

// Test P4 — mileage invalid (negative)
{
  const resp = { date: '2026-04-15', total: 500, mileage: -100 }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'P4 negative mileage: ok=false')
  assertEq(r.userError, 'mileage_invalid', 'P4 negative mileage: userError')
}

// Test P5 — mileage too high (>5M)
{
  const resp = { date: '2026-04-15', total: 500, mileage: 9999999 }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'P5 huge mileage: ok=false')
  assertEq(r.userError, 'mileage_invalid', 'P5 huge mileage: userError')
}

// Test P6 — null mileage is allowed
{
  const resp = { date: '2026-04-15', total: 500, mileage: null }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, true, 'P6 null mileage: ok=true')
}

// Test P7 — total negative
{
  const resp = { date: '2026-04-15', total: -50 }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'P7 negative total: ok=false')
  assertEq(r.userError, 'amount_invalid', 'P7 negative total: userError')
}

// Test P8 — date too old
{
  const resp = { date: '2016-12-31', total: 500 }
  const r = validateRepairResponse(resp, { maxDate: TODAY })
  assertEq(r.ok, false, 'P8 ancient date: ok=false')
  assertEq(r.userError, 'date_out_of_range', 'P8 ancient date: userError')
}

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════
console.log('\n=== Results ===')
console.log('  Passed: ' + passes)
console.log('  Failed: ' + failures)
if (failures > 0) {
  console.error('\nMismatches:')
  for (const m of mismatches) console.error('  - ' + m)
  process.exit(1)
}
console.log('\nAll smartScanValidation tests passed.\n')
