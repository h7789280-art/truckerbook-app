// Unit tests for the pure helpers used by geminiVision (parseOdometerResponse
// and shouldWarnOdometerDecrease). Run with `node`; exits non-zero if any
// assertion fails.

import { parseOdometerResponse, shouldWarnOdometerDecrease } from './geminiVisionUtils.js'

let passes = 0
let failures = 0
const fails = []

function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passes++
  } else {
    failures++
    fails.push(label)
    console.error('  FAIL ' + label + ': expected ' + e + ', got ' + a)
  }
}

function assertProp(obj, key, expected, label) {
  const actual = obj && obj[key]
  if (actual === expected) {
    passes++
  } else {
    failures++
    fails.push(label)
    console.error('  FAIL ' + label + ': ' + key + '=' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected))
  }
}

console.log('parseOdometerResponse:')

// 1. High-confidence integer.
{
  const r = parseOdometerResponse('{"odometer_miles": 258100, "confidence": "high"}')
  assertProp(r, 'value', 258100, 'high-confidence integer → value')
  assertProp(r, 'confidence', 'high', 'high-confidence integer → confidence')
  assertProp(r, 'kmConverted', false, 'high-confidence integer → kmConverted false')
}

// 2. Km converted (notes mention conversion).
{
  const r = parseOdometerResponse('{"odometer_miles": 258100, "confidence": "high", "notes": "Converted from 415372 km"}')
  assertProp(r, 'value', 258100, 'km-conversion → value')
  assertProp(r, 'kmConverted', true, 'km-conversion → kmConverted true')
}

// 3. no_odometer_detected error.
{
  const r = parseOdometerResponse('{"error": "no_odometer_detected"}')
  assertProp(r, 'error', 'no_odometer_detected', 'no_odometer_detected error code')
  assertProp(r, 'value', undefined, 'no_odometer_detected has no value')
}

// 4. Decimal value is rounded.
{
  const r = parseOdometerResponse('{"odometer_miles": 258099.7, "confidence": "medium"}')
  assertProp(r, 'value', 258100, 'decimal → rounded value')
}

// 5. Zero is rejected.
{
  const r = parseOdometerResponse('{"odometer_miles": 0, "confidence": "low"}')
  assertProp(r, 'error', 'parse_error', 'zero odometer → parse_error')
}

// 6. Non-JSON text is rejected.
{
  const r = parseOdometerResponse('not json at all')
  assertProp(r, 'error', 'parse_error', 'non-JSON → parse_error')
}

// 7. Strips ```json fences (Gemini sometimes wraps the output).
{
  const r = parseOdometerResponse('```json\n{"odometer_miles": 12345, "confidence": "medium"}\n```')
  assertProp(r, 'value', 12345, 'fenced JSON → value')
  assertProp(r, 'confidence', 'medium', 'fenced JSON → confidence')
}

// 8. Empty / null input.
{
  assertProp(parseOdometerResponse(''), 'error', 'parse_error', 'empty string → parse_error')
  assertProp(parseOdometerResponse(null), 'error', 'parse_error', 'null → parse_error')
}

console.log('shouldWarnOdometerDecrease:')

assertEq(shouldWarnOdometerDecrease(200000, 258100), true, 'newer < current → warn')
assertEq(shouldWarnOdometerDecrease(300000, 258100), false, 'newer > current → no warn')
assertEq(shouldWarnOdometerDecrease(258100, 258100), false, 'newer == current → no warn')
assertEq(shouldWarnOdometerDecrease(123, null), false, 'no current → no warn')
assertEq(shouldWarnOdometerDecrease('100', '200'), true, 'string inputs are coerced')

console.log('\n  ' + passes + ' passed, ' + failures + ' failed')
if (failures > 0) {
  console.error('\nFailures:\n  ' + fails.join('\n  '))
  process.exit(1)
}
