// Strict tests for the §199A QBI calculator. Run with `node`; exits 0 iff all
// assertions hold within ±$1 (currency) or ±0.01 (ratio) tolerance.
//
// Why these particular cases:
//   1. Peter (the canonical owner-operator reference scenario, MFJ, $527k TI).
//      Note: under IRS Rev. Proc. 2025-32 (post-OBBBA) MFJ thresholds are
//      lower=$403,500 / upper=$553,500 → range $150k. $527k lands INSIDE the
//      phase-in band, so the deduction is NOT the simple W-2/UBIA cap of
//      $3,125 — it is the partially-phased-in figure ~$20,240.
//      An additional "above-upper" case at $700k preserves the $3,125 expectation.
//   2-7. Boundary cases: below / overall-cap binding / QBI loss / above
//        with zero W-2/UBIA / phase-in midpoint / input validation.

import { calculateQBIDeduction } from './calculateQBI.js'

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

function assertContains(haystack, needle, label) {
  if (typeof haystack === 'string' && haystack.includes(needle)) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (got=' + JSON.stringify(haystack) + ')')
    console.error('  FAIL ' + label + ': expected to contain "' + needle + '", got ' + JSON.stringify(haystack))
  }
}

function assertThrows(fn, label) {
  try {
    fn()
  } catch (_) {
    passes++
    return
  }
  failures++
  mismatches.push(label + ' (did not throw)')
  console.error('  FAIL ' + label + ': expected throw, did not')
}

console.log('\n=== QBI §199A calculator tests (tax year 2026, post-OBBBA) ===\n')

// ----------------------------------------------------------------------
// 1. Peter: MFJ, $527k TI, $500k QBI, $0 W-2, $125k UBIA, no SSTB.
//    Under 2026 OBBBA thresholds (lower $403,500 / upper $553,500), $527k is
//    INSIDE the phase-in band → result is ~$20,239.58 (NOT $3,125).
//    Expected math (frozen):
//      tentativeQBI    = 0.20 × 500,000              = 100,000
//      wOrWubiaLimit   = 0.025 × 125,000             = 3,125
//      ratio           = (527,000 − 403,500)/150,000 = 0.823333…
//      reduction       = (100,000 − 3,125) × ratio   = 79,760.4167
//      combined        = 100,000 − 79,760.4167       = 20,239.5833
//      overallCap      = 0.20 × 527,000              = 105,400  (does not bind)
//      deduction       = 20,239.58
// ----------------------------------------------------------------------
console.log('--- Case 1: Peter (MFJ, $527k TI, phase-in under OBBBA) ---')
const peter = calculateQBIDeduction({
  filingStatus: 'mfj',
  taxableIncomeBeforeQBI: 527_000,
  qbi: 500_000,
  isSSTB: false,
  w2Wages: 0,
  ubia: 125_000,
  netCapitalGain: 0,
})
assertEq(peter.phase, 'within', 'Peter.phase')
assertClose(peter.deduction, 20239.58, 'Peter.deduction (phase-in 2026 OBBBA)', 1)
assertClose(peter.phaseInRatio, 0.8233, 'Peter.phaseInRatio', 0.001)
assertClose(peter.limits.wOrWubiaLimit, 3125, 'Peter.limits.wOrWubiaLimit')
assertClose(peter.tentativeQBI, 100_000, 'Peter.tentativeQBI')
assertEq(peter.qbiLossCarryover, 0, 'Peter.qbiLossCarryover')

// ----------------------------------------------------------------------
// 1b. Above-upper variant: same params but TI = $700k. Now phase = 'above',
//     deduction = min(20% × QBI, W-2/UBIA cap) = min(100,000, 3,125) = $3,125.
//     This is the test that pins the OBBBA-aware "above-upper" branch.
// ----------------------------------------------------------------------
console.log('--- Case 1b: Above-upper variant ($700k MFJ) → $3,125 ---')
const peterAbove = calculateQBIDeduction({
  filingStatus: 'mfj',
  taxableIncomeBeforeQBI: 700_000,
  qbi: 500_000,
  isSSTB: false,
  w2Wages: 0,
  ubia: 125_000,
  netCapitalGain: 0,
})
assertEq(peterAbove.phase, 'above', 'PeterAbove.phase')
assertClose(peterAbove.deduction, 3125, 'PeterAbove.deduction')
assertContains(peterAbove.appliedRule, 'W-2/UBIA', 'PeterAbove.appliedRule mentions W-2/UBIA')
assertEq(peterAbove.phaseInRatio, null, 'PeterAbove.phaseInRatio is null')

// ----------------------------------------------------------------------
// 2. Below lower threshold: MFJ, TI=$200k, QBI=$100k, no W-2/UBIA → 20% × QBI.
// ----------------------------------------------------------------------
console.log('--- Case 2: Below lower threshold (MFJ, $200k TI) ---')
const below = calculateQBIDeduction({
  filingStatus: 'mfj',
  taxableIncomeBeforeQBI: 200_000,
  qbi: 100_000,
  isSSTB: false,
  w2Wages: 0,
  ubia: 0,
  netCapitalGain: 0,
})
assertEq(below.phase, 'below', 'Below.phase')
assertClose(below.deduction, 20_000, 'Below.deduction')
assertEq(below.phaseInRatio, null, 'Below.phaseInRatio is null')

// ----------------------------------------------------------------------
// 3. Overall cap binds: MFJ, TI=$50k (netCapGain=$40k), QBI=$100k, W-2=$200k.
//    overallCap = 0.20 × ($50k − $40k) = $2,000 → deduction is $2,000 (not $20k).
// ----------------------------------------------------------------------
console.log('--- Case 3: Overall cap binds ---')
const capBinds = calculateQBIDeduction({
  filingStatus: 'mfj',
  taxableIncomeBeforeQBI: 50_000,
  qbi: 100_000,
  isSSTB: false,
  w2Wages: 200_000,
  ubia: 0,
  netCapitalGain: 40_000,
})
assertClose(capBinds.deduction, 2_000, 'CapBinds.deduction')
assertClose(capBinds.limits.overallCap, 2_000, 'CapBinds.limits.overallCap')
assertContains(capBinds.appliedRule, 'overall cap', 'CapBinds.appliedRule mentions overall cap')

// ----------------------------------------------------------------------
// 4. QBI loss: deduction is $0, full loss is reported as carryover.
// ----------------------------------------------------------------------
console.log('--- Case 4: QBI loss carryover ---')
const loss = calculateQBIDeduction({
  filingStatus: 'mfj',
  taxableIncomeBeforeQBI: 100_000,
  qbi: -50_000,
  isSSTB: false,
  w2Wages: 0,
  ubia: 0,
  netCapitalGain: 0,
})
assertEq(loss.deduction, 0, 'Loss.deduction')
assertClose(loss.qbiLossCarryover, 50_000, 'Loss.qbiLossCarryover')
assertContains(loss.appliedRule, 'loss', 'Loss.appliedRule mentions loss')

// ----------------------------------------------------------------------
// 5. Above upper, zero W-2 and zero UBIA → cap = 0 → deduction = 0.
// ----------------------------------------------------------------------
console.log('--- Case 5: Above-upper with zero W-2/UBIA → $0 ---')
const aboveZero = calculateQBIDeduction({
  filingStatus: 'mfj',
  taxableIncomeBeforeQBI: 700_000,
  qbi: 300_000,
  isSSTB: false,
  w2Wages: 0,
  ubia: 0,
  netCapitalGain: 0,
})
assertEq(aboveZero.phase, 'above', 'AboveZero.phase')
assertClose(aboveZero.deduction, 0, 'AboveZero.deduction')

// ----------------------------------------------------------------------
// 6. Phase-in midpoint: TI exactly at (lower+upper)/2 → ratio ≈ 0.5.
// ----------------------------------------------------------------------
console.log('--- Case 6: Phase-in midpoint → ratio ≈ 0.5 ---')
const midTI = (403_500 + 553_500) / 2 // $478,500
const mid = calculateQBIDeduction({
  filingStatus: 'mfj',
  taxableIncomeBeforeQBI: midTI,
  qbi: 500_000,
  isSSTB: false,
  w2Wages: 0,
  ubia: 125_000,
  netCapitalGain: 0,
})
assertEq(mid.phase, 'within', 'Mid.phase')
if (mid.phaseInRatio === null) {
  failures++
  mismatches.push('Mid.phaseInRatio (was null)')
  console.error('  FAIL Mid.phaseInRatio: expected ~0.5, got null')
} else if (mid.phaseInRatio > 0.49 && mid.phaseInRatio < 0.51) {
  passes++
} else {
  failures++
  mismatches.push('Mid.phaseInRatio (got=' + mid.phaseInRatio + ')')
  console.error('  FAIL Mid.phaseInRatio: expected (0.49, 0.51), got ' + mid.phaseInRatio)
}

// ----------------------------------------------------------------------
// 7. Validation: negative W-2 or UBIA throws.
// ----------------------------------------------------------------------
console.log('--- Case 7: Input validation ---')
assertThrows(
  () => calculateQBIDeduction({
    filingStatus: 'mfj',
    taxableIncomeBeforeQBI: 200_000,
    qbi: 100_000,
    isSSTB: false,
    w2Wages: -100,
    ubia: 0,
  }),
  'negative w2Wages throws',
)
assertThrows(
  () => calculateQBIDeduction({
    filingStatus: 'mfj',
    taxableIncomeBeforeQBI: 200_000,
    qbi: 100_000,
    isSSTB: false,
    w2Wages: 0,
    ubia: -1,
  }),
  'negative ubia throws',
)
assertThrows(
  () => calculateQBIDeduction({
    filingStatus: 'unknown',
    taxableIncomeBeforeQBI: 200_000,
    qbi: 100_000,
    isSSTB: false,
    w2Wages: 0,
    ubia: 0,
  }),
  'invalid filingStatus throws',
)

// ----------------------------------------------------------------------
console.log('\n' + '='.repeat(60))
if (failures === 0) {
  console.log('\n✓ ALL ' + passes + ' QBI ASSERTIONS PASSED')
  process.exit(0)
} else {
  console.error('\n✗ ' + failures + ' FAILED, ' + passes + ' passed')
  console.error('\nMismatches:')
  for (const m of mismatches) console.error('  - ' + m)
  process.exit(1)
}
