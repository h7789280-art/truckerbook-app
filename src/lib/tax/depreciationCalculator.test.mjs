// Strict-spec tests for the depreciation calculator.
// Source of truth: SPEC.md (6 scenarios × 4 strategies × 4 metrics = 96 assertions,
// plus 6 recommendStrategy checks — 102 total). Every expected value was produced
// by the Python reference implementation and then frozen in the table below.
//
// Run with: `node src/lib/tax/depreciationCalculator.test.mjs`
// Exit code 0 iff every assertion matches SPEC within ±$1 tolerance.

import {
  computeMacrsSchedule,
  computeStrategy,
  computeTaxSavingsYear1,
  computeTaxSavingsLifetime,
  recommendStrategy,
  getEffRate,
  MACRS_3YR_RATES,
  SECTION_179_LIMIT_2026,
} from './depreciationCalculator.js'

let failures = 0
let passes = 0
const mismatches = []

function assertClose(actual, expected, label) {
  const a = Number(actual)
  const e = Number(expected)
  if (!Number.isFinite(a) || !Number.isFinite(e)) {
    failures++
    mismatches.push(label)
    console.error('  FAIL ' + label + ': non-finite (actual=' + actual + ', expected=' + expected + ')')
    return
  }
  if (Math.abs(a - e) <= 1) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (actual=' + a.toFixed(2) + ', expected=' + e + ')')
    console.error('  FAIL ' + label + ': expected ' + e + ' ±$1, got ' + a.toFixed(2))
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

// ============================================================================
// SPEC TABLE — 6 scenarios × 4 strategies × 4 metrics (year1, savingsY1, NOL, lifetime)
// ============================================================================
const SPEC_TABLE = [
  {
    scenario: 'Sc1', basis: 125000, income: 0, effRate: 0.00,
    recommended: 'onlyBonus',
    strategies: {
      standardMacrs:  { y1: 41663,  savingsY1: 0, nol: 41663,  lifetime: 0 },
      onlySection179: { y1: 41663,  savingsY1: 0, nol: 41663,  lifetime: 0 },
      s179PlusBonus:  { y1: 125000, savingsY1: 0, nol: 125000, lifetime: 0 },
      onlyBonus:      { y1: 125000, savingsY1: 0, nol: 125000, lifetime: 0 },
    },
  },
  {
    scenario: 'Sc2', basis: 125000, income: 50000, effRate: 0.17,
    recommended: 's179PlusBonus',
    strategies: {
      standardMacrs:  { y1: 41663,  savingsY1: 7083, nol: 0,     lifetime: 21250 },
      onlySection179: { y1: 74998,  savingsY1: 8500, nol: 24998, lifetime: 21250 },
      s179PlusBonus:  { y1: 125000, savingsY1: 8500, nol: 75000, lifetime: 21250 },
      onlyBonus:      { y1: 125000, savingsY1: 8500, nol: 75000, lifetime: 21250 },
    },
  },
  {
    scenario: 'Sc3', basis: 125000, income: 500000, effRate: 0.27,
    recommended: 'onlySection179',
    strategies: {
      standardMacrs:  { y1: 41663,  savingsY1: 11249, nol: 0, lifetime: 33750 },
      onlySection179: { y1: 125000, savingsY1: 33750, nol: 0, lifetime: 33750 },
      s179PlusBonus:  { y1: 125000, savingsY1: 33750, nol: 0, lifetime: 33750 },
      onlyBonus:      { y1: 125000, savingsY1: 33750, nol: 0, lifetime: 33750 },
    },
  },
  {
    scenario: 'Sc4', basis: 500000, income: 0, effRate: 0.00,
    recommended: 'onlyBonus',
    strategies: {
      standardMacrs:  { y1: 166650, savingsY1: 0, nol: 166650, lifetime: 0 },
      onlySection179: { y1: 166650, savingsY1: 0, nol: 166650, lifetime: 0 },
      s179PlusBonus:  { y1: 500000, savingsY1: 0, nol: 500000, lifetime: 0 },
      onlyBonus:      { y1: 500000, savingsY1: 0, nol: 500000, lifetime: 0 },
    },
  },
  {
    scenario: 'Sc5', basis: 500000, income: 50000, effRate: 0.17,
    recommended: 's179PlusBonus',
    strategies: {
      standardMacrs:  { y1: 166650, savingsY1: 8500, nol: 116650, lifetime: 33560 },
      onlySection179: { y1: 199985, savingsY1: 8500, nol: 149985, lifetime: 33434 },
      s179PlusBonus:  { y1: 500000, savingsY1: 8500, nol: 450000, lifetime: 28900 },
      onlyBonus:      { y1: 500000, savingsY1: 8500, nol: 450000, lifetime: 28900 },
    },
  },
  {
    scenario: 'Sc6', basis: 500000, income: 500000, effRate: 0.27,
    recommended: 'onlySection179',
    strategies: {
      standardMacrs:  { y1: 166650, savingsY1: 44996,  nol: 0, lifetime: 135000 },
      onlySection179: { y1: 500000, savingsY1: 135000, nol: 0, lifetime: 135000 },
      s179PlusBonus:  { y1: 500000, savingsY1: 135000, nol: 0, lifetime: 135000 },
      onlyBonus:      { y1: 500000, savingsY1: 135000, nol: 0, lifetime: 135000 },
    },
  },
]

// Slider auto-sync rule (SPEC "Auto-sync behavior"):
//   Only §179 / §179 + Bonus → slider = min(basis, $2.56M, max(0, income))
//   Standard MACRS / Only Bonus → slider = 0
function defaultSlider(strategy, basis, income) {
  if (strategy === 'onlySection179' || strategy === 's179PlusBonus') {
    return Math.min(basis, SECTION_179_LIMIT_2026, Math.max(income, 0))
  }
  return 0
}

console.log('\n=== SPEC TABLE — 6 scenarios × 4 strategies × 4 metrics (96 assertions) ===\n')

const STRATEGY_ORDER = ['standardMacrs', 'onlySection179', 's179PlusBonus', 'onlyBonus']

for (const row of SPEC_TABLE) {
  console.log('\n--- ' + row.scenario + ': basis=$' + row.basis.toLocaleString()
    + ', income=$' + row.income.toLocaleString()
    + ', effRate=' + (row.effRate * 100) + '% ---')

  for (const strategy of STRATEGY_ORDER) {
    const expected = row.strategies[strategy]
    const slider = defaultSlider(strategy, row.basis, row.income)
    const result = computeStrategy(strategy, row.basis, row.income, slider)
    const savingsY1 = computeTaxSavingsYear1(result.year1Deduction, row.income, row.effRate)
    const lifetime = computeTaxSavingsLifetime(result.yearlyDeductions, row.income, row.effRate)

    assertClose(result.year1Deduction, expected.y1, row.scenario + '/' + strategy + '.year1Deduction')
    assertClose(savingsY1,              expected.savingsY1, row.scenario + '/' + strategy + '.savingsY1')
    assertClose(result.nolYear1,        expected.nol, row.scenario + '/' + strategy + '.nolYear1')
    assertClose(lifetime,               expected.lifetime, row.scenario + '/' + strategy + '.lifetime')
  }
}

console.log('\n=== recommendStrategy — one check per scenario (6 assertions) ===\n')

for (const row of SPEC_TABLE) {
  const got = recommendStrategy(row.basis, row.income, 100)
  assertEq(got, row.recommended, row.scenario + '.recommendStrategy')
}

console.log('\n=== Extra: recommendStrategy boundary + businessUse gate ===\n')

// business_use < 50 → always standardMacrs, regardless of income/basis
assertEq(recommendStrategy(125000, 500000, 49), 'standardMacrs',
  'businessUsePct<50 forces standardMacrs even with income>=basis')
assertEq(recommendStrategy(125000, 500000, 50), 'onlySection179',
  'businessUsePct=50 is the eligibility boundary (≥50 qualifies)')

// income == basis boundary: SPEC says income >= basis → onlySection179
assertEq(recommendStrategy(125000, 125000, 100), 'onlySection179',
  'income==basis → onlySection179')

// Negative income behaves like 0
assertEq(recommendStrategy(125000, -1, 100), 'onlyBonus',
  'negative income → onlyBonus')

console.log('\n=== MACRS 3-year schedule (half-year convention, Rev. Proc. 87-57 Table A-1) ===\n')

// Rates array matches the IRS table exactly
assertEq(MACRS_3YR_RATES[0], 0.3333, 'MACRS Y1 rate = 33.33%')
assertEq(MACRS_3YR_RATES[1], 0.4445, 'MACRS Y2 rate = 44.45%')
assertEq(MACRS_3YR_RATES[2], 0.1481, 'MACRS Y3 rate = 14.81%')
assertEq(MACRS_3YR_RATES[3], 0.0741, 'MACRS Y4 rate = 7.41%')

// Rates sum to 1.0 exactly → schedule totals to the full basis
const rateSum = MACRS_3YR_RATES.reduce((s, r) => s + r, 0)
assertClose(rateSum, 1.0, 'MACRS 3-year rates sum to 1.0')

// Schedule for $125,000 basis sums to basis
const sched125 = computeMacrsSchedule(125000)
assertEq(sched125.length, 4, 'MACRS schedule has 4 rows')
assertClose(sched125[0] + sched125[1] + sched125[2] + sched125[3], 125000,
  'MACRS schedule sums to basis ($125k)')
assertClose(sched125[0], 41662.50, 'MACRS Y1 for $125k basis = $41,662.50')

// Schedule for $500,000 basis sums to basis
const sched500 = computeMacrsSchedule(500000)
assertClose(sched500[0] + sched500[1] + sched500[2] + sched500[3], 500000,
  'MACRS schedule sums to basis ($500k)')
assertClose(sched500[0], 166650, 'MACRS Y1 for $500k basis = $166,650')

// Zero basis → all zeros
const sched0 = computeMacrsSchedule(0)
assertEq(sched0.every(v => v === 0), true, 'MACRS schedule for basis=0 is all zeros')

console.log('\n=== getEffRate — simplified income buckets ===\n')

assertEq(getEffRate(0), 0, 'effRate($0) = 0%')
assertEq(getEffRate(-100), 0, 'effRate(negative) = 0%')
assertEq(getEffRate(1), 0.17, 'effRate($1) = 17%')
assertEq(getEffRate(50000), 0.17, 'effRate($50k) = 17% (upper bound inclusive)')
assertEq(getEffRate(50001), 0.27, 'effRate($50,001) = 27%')
assertEq(getEffRate(500000), 0.27, 'effRate($500k) = 27% (upper bound inclusive)')
assertEq(getEffRate(500001), 0.32, 'effRate($500,001) = 32%')
assertEq(getEffRate(10000000), 0.32, 'effRate($10M) = 32%')

// ============================================================================
console.log('\n' + '='.repeat(60))
if (failures === 0) {
  console.log('\n✓ ALL ' + passes + ' ASSERTIONS PASSED (SPEC-compliant)')
  process.exit(0)
} else {
  console.error('\n✗ ' + failures + ' FAILED, ' + passes + ' passed')
  console.error('\nMismatches:')
  for (const m of mismatches) console.error('  - ' + m)
  process.exit(1)
}
