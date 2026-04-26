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
  MACRS_3YEAR_MIDQUARTER,
  SECTION_179_LIMIT_2026,
  quarterOfMonth,
  computeConventionForAssets,
  getSection179DisplayAmount,
  DEPRECIATION_CONVENTION,
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
// Pack 2 — MACRS edge cases
// ============================================================================

console.log('\n=== Pack 2: quarterOfMonth helper ===\n')

assertEq(quarterOfMonth(1), 'Q1', 'January = Q1')
assertEq(quarterOfMonth(3), 'Q1', 'March = Q1')
assertEq(quarterOfMonth(4), 'Q2', 'April = Q2')
assertEq(quarterOfMonth(6), 'Q2', 'June = Q2')
assertEq(quarterOfMonth(7), 'Q3', 'July = Q3')
assertEq(quarterOfMonth(9), 'Q3', 'September = Q3')
assertEq(quarterOfMonth(10), 'Q4', 'October = Q4')
assertEq(quarterOfMonth(12), 'Q4', 'December = Q4')

console.log('\n=== Pack 2: MACRS_3YEAR_MIDQUARTER rates from IRS Pub 946 Table A-2 ===\n')

assertEq(MACRS_3YEAR_MIDQUARTER.Q1[0], 0.5833, 'Q1 mid-quarter Y1 rate = 58.33%')
assertEq(MACRS_3YEAR_MIDQUARTER.Q2[0], 0.4167, 'Q2 mid-quarter Y1 rate = 41.67%')
assertEq(MACRS_3YEAR_MIDQUARTER.Q3[0], 0.2500, 'Q3 mid-quarter Y1 rate = 25.00%')
assertEq(MACRS_3YEAR_MIDQUARTER.Q4[0], 0.0833, 'Q4 mid-quarter Y1 rate = 8.33%')
assertEq(MACRS_3YEAR_MIDQUARTER.Q4[1], 0.6111, 'Q4 mid-quarter Y2 rate = 61.11%')

// Each quarter's rates should sum to ~1.0 (residual is absorbed by the schedule).
for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
  const sum = MACRS_3YEAR_MIDQUARTER[q].reduce((s, r) => s + r, 0)
  assertClose(sum, 1.0, `Mid-quarter ${q} rates sum to 1.0`)
}

console.log('\n=== Pack 2: MACRS schedule with mid-quarter convention (3-year property) ===\n')

// Test 1 — Half-year regression on the canonical Q4 case (Petr's truck reused).
//   $125k purchased 2026-11-15 with NO mid-quarter trigger → year 1 = $41,662.50
const sched_HY_Q4 = computeMacrsSchedule(125000) // default = half_year
assertClose(sched_HY_Q4[0], 41662.50, 'Half-year (default): $125k Q4 → Y1 = $41,662.50')

// Test 2 — Same asset under mid-quarter Q4 convention → year 1 = $10,412.50
const sched_MQ_Q4 = computeMacrsSchedule(125000, { convention: DEPRECIATION_CONVENTION.MID_QUARTER_Q4 })
assertClose(sched_MQ_Q4[0], 10412.50, 'Mid-quarter Q4: $125k → Y1 = $10,412.50 (8.33%)')

// Test 3 — Mid-quarter Q1: $100k Feb 2026 → 58.33% × $100k = $58,330
const sched_MQ_Q1 = computeMacrsSchedule(100000, { convention: DEPRECIATION_CONVENTION.MID_QUARTER_Q1 })
assertClose(sched_MQ_Q1[0], 58330, 'Mid-quarter Q1: $100k → Y1 = $58,330 (58.33%)')

// Test 4 — Mid-quarter Q2: $100k May 2026 → 41.67% × $100k = $41,670
const sched_MQ_Q2 = computeMacrsSchedule(100000, { convention: DEPRECIATION_CONVENTION.MID_QUARTER_Q2 })
assertClose(sched_MQ_Q2[0], 41670, 'Mid-quarter Q2: $100k → Y1 = $41,670 (41.67%)')

// Test 5 — Mid-quarter Q3: $100k Aug 2026 → 25.00% × $100k = $25,000
const sched_MQ_Q3 = computeMacrsSchedule(100000, { convention: DEPRECIATION_CONVENTION.MID_QUARTER_Q3 })
assertClose(sched_MQ_Q3[0], 25000, 'Mid-quarter Q3: $100k → Y1 = $25,000 (25.00%)')

// Test 6 — Year 2 of mid-quarter Q4: $125k → 61.11% × $125k = $76,387.50
assertClose(sched_MQ_Q4[1], 76387.50, 'Mid-quarter Q4: $125k → Y2 = $76,387.50 (61.11%)')

// Bonus: schedule integrity (sums to basis, last year absorbs rounding residual)
const sumMQQ4 = sched_MQ_Q4.reduce((s, v) => s + v, 0)
assertClose(sumMQQ4, 125000, 'Mid-quarter Q4 schedule sums to basis ($125k)')

// Threading through computeStrategy keeps standardMacrs results consistent.
const strat_MQ_Q4 = computeStrategy('standardMacrs', 125000, 0, 0, { convention: DEPRECIATION_CONVENTION.MID_QUARTER_Q4 })
assertClose(strat_MQ_Q4.year1Deduction, 10412.50, 'computeStrategy(standardMacrs) under mid-quarter Q4: Y1 = $10,412.50')
assertClose(strat_MQ_Q4.yearlyDeductions[1], 76387.50, 'computeStrategy(standardMacrs) under mid-quarter Q4: Y2 = $76,387.50')

console.log('\n=== Pack 2: 40%-Q4 trigger (computeConventionForAssets) ===\n')

// Test 7 — Single Q4 asset: q4Basis/totalBasis = 1.0 > 0.40 → trigger fires.
const trig_Q4Only = computeConventionForAssets([
  { id: 'a1', purchase_date: '2026-11-15', purchase_price: 125000, business_use_pct: 100 },
])
assertEq(trig_Q4Only.get('a1'), 'mid_quarter_q4',
  'Trigger — Q4-only ($125k Nov): mid_quarter_q4 applied')

// Test 8 — Mixed light Q4: $80k Apr + $30k Nov → q4Basis/totalBasis = 30/110 ≈ 0.273 < 0.40 → half-year.
const trig_LightQ4 = computeConventionForAssets([
  { id: 'a1', purchase_date: '2026-04-10', purchase_price: 80000, business_use_pct: 100 },
  { id: 'a2', purchase_date: '2026-11-10', purchase_price: 30000, business_use_pct: 100 },
])
assertEq(trig_LightQ4.get('a1'), 'half_year', 'Trigger — light Q4 (27%): a1 (Apr) stays half_year')
assertEq(trig_LightQ4.get('a2'), 'half_year', 'Trigger — light Q4 (27%): a2 (Nov) stays half_year')

// Test 9 — Heavy Q4: $30k March + $80k December → q4Basis/totalBasis = 80/110 ≈ 0.727 > 0.40 → trigger fires.
// Each asset gets the convention for ITS OWN quarter.
const trig_HeavyQ4 = computeConventionForAssets([
  { id: 'a1', purchase_date: '2026-03-10', purchase_price: 30000, business_use_pct: 100 },
  { id: 'a2', purchase_date: '2026-12-10', purchase_price: 80000, business_use_pct: 100 },
])
assertEq(trig_HeavyQ4.get('a1'), 'mid_quarter_q1', 'Trigger — heavy Q4 (73%): a1 (Mar) → mid_quarter_q1')
assertEq(trig_HeavyQ4.get('a2'), 'mid_quarter_q4', 'Trigger — heavy Q4 (73%): a2 (Dec) → mid_quarter_q4')

// Boundary: exactly 40% does NOT trigger (Treas. Reg. §1.168(d)-1 says STRICTLY greater than 40%).
const trig_Exactly40 = computeConventionForAssets([
  { id: 'a1', purchase_date: '2026-04-10', purchase_price: 60000, business_use_pct: 100 },
  { id: 'a2', purchase_date: '2026-11-10', purchase_price: 40000, business_use_pct: 100 },
])
assertEq(trig_Exactly40.get('a2'), 'half_year', 'Trigger boundary: exactly 40% Q4 → half_year (NOT mid-quarter)')

// Business-use percentage scales each asset's basis before the trigger ratio is taken.
const trig_BusinessPct = computeConventionForAssets([
  // Effective bases: a1 = 100k * 50% = 50k, a2 = 60k * 100% = 60k → 60/110 ≈ 0.545 > 0.40
  { id: 'a1', purchase_date: '2026-02-15', purchase_price: 100000, business_use_pct: 50 },
  { id: 'a2', purchase_date: '2026-12-01', purchase_price: 60000, business_use_pct: 100 },
])
assertEq(trig_BusinessPct.get('a2'), 'mid_quarter_q4',
  'Trigger weighs business_use_pct: scaled bases tip ratio over 40%')

console.log('\n=== Pack 2: §179 row display amount (IRC §179(b)(3) income limitation) ===\n')

// Test §179-1 — income=0: §179 = $0 (income blocks it entirely).
assertClose(getSection179DisplayAmount(125000, 0), 0,
  '§179 display @ $125k basis, income=0 → $0')

// Test §179-2 — income=$50k: §179 = $50k (income caps it below basis).
assertClose(getSection179DisplayAmount(125000, 50000), 50000,
  '§179 display @ $125k basis, income=$50k → $50,000')

// Test §179-3 — income=$300k: §179 = $125k (full basis fits inside income).
assertClose(getSection179DisplayAmount(125000, 300000), 125000,
  '§179 display @ $125k basis, income=$300k → $125,000')

// Test §179-4 — income=$3M, basis=$2.7M: §179 = $2.56M (statutory cap, not basis or income).
assertClose(getSection179DisplayAmount(2_700_000, 3_000_000), 2_560_000,
  '§179 display @ $2.7M basis, income=$3M → $2,560,000 (2026 §179 cap)')

// Negative income behaves like zero.
assertClose(getSection179DisplayAmount(125000, -1), 0,
  '§179 display: negative income clamps to 0')

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
