// Standalone tests for the depreciation calculator recommendation logic.
// Run directly with `node src/lib/tax/depreciationCalculator.test.mjs` — no test framework needed.
// Covers the four Acceptance Criteria cases for recommendStrategy + sanity checks on
// compareStrategies (IRC §179(b)(3) income limitation, NOL carryforward, total-over-life).

import {
  recommendStrategy,
  compareStrategies,
  buildStrategySchedule,
} from './depreciationCalculator.js'
import { STRATEGY, ASSET_CLASS } from './macrs-constants.js'

let failures = 0
let passes = 0

function assertEq(actual, expected, label) {
  if (actual === expected) {
    passes++
    console.log('  ok  ' + label)
  } else {
    failures++
    console.error('  FAIL ' + label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
  }
}

function assertNear(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) <= tolerance) {
    passes++
    console.log('  ok  ' + label + ' (' + actual.toFixed(2) + ' ≈ ' + expected.toFixed(2) + ')')
  } else {
    failures++
    console.error('  FAIL ' + label + ': expected ~' + expected + ' (±' + tolerance + '), got ' + actual)
  }
}

console.log('\n=== recommendStrategy: the four Acceptance Criteria cases ===\n')

// 1. income = 0 → BONUS_ONLY
assertEq(
  recommendStrategy({
    costBasis: 125000,
    estimatedTaxableIncome: 0,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  }).key,
  STRATEGY.BONUS_ONLY,
  'income=0 → recommend Bonus only (Section 179 blocked by income limit)',
)

// 2. income >= basis → SECTION_179
assertEq(
  recommendStrategy({
    costBasis: 125000,
    estimatedTaxableIncome: 200000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  }).key,
  STRATEGY.SECTION_179,
  'income >= basis → recommend Section 179 only',
)

// Exact boundary: income == basis → SECTION_179 (spec says >=).
assertEq(
  recommendStrategy({
    costBasis: 125000,
    estimatedTaxableIncome: 125000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  }).key,
  STRATEGY.SECTION_179,
  'income == basis → recommend Section 179 only (boundary)',
)

// 3. 0 < income < basis → SECTION_179_BONUS
assertEq(
  recommendStrategy({
    costBasis: 125000,
    estimatedTaxableIncome: 50000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  }).key,
  STRATEGY.SECTION_179_BONUS,
  '0 < income < basis → recommend Section 179 + Bonus',
)

// 4. businessUse < 50 → STANDARD_MACRS
assertEq(
  recommendStrategy({
    costBasis: 125000,
    estimatedTaxableIncome: 200000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 40,
  }).key,
  STRATEGY.STANDARD_MACRS,
  'businessUse < 50% → recommend Standard MACRS',
)

// 4b. businessUse = 50 is the eligibility boundary (spec: >=50 qualifies).
assertEq(
  recommendStrategy({
    costBasis: 125000,
    estimatedTaxableIncome: 200000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 50,
  }).key,
  STRATEGY.SECTION_179,
  'businessUse == 50% → Section 179 still available',
)

// Basis uses business-use portion: 100k at 40% business use → basis = 40k.
// With income = 50k (> 40k basis) it's still fully covered → SECTION_179.
// But business use <50% blocks §179 entirely — STANDARD_MACRS wins.
assertEq(
  recommendStrategy({
    costBasis: 100000,
    estimatedTaxableIncome: 50000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 40,
  }).key,
  STRATEGY.STANDARD_MACRS,
  'business use <50% blocks Section 179 regardless of income',
)

console.log('\n=== compareStrategies: Section 179 income limitation + NOL carryforward ===\n')

// Scenario: $125k truck, 3-year OTR tractor, placed in service 2026, income = $0.
// Expected year-1 MACRS on full basis = 125,000 × 0.3333 = 41,662.50 (half-year).
// When strategy = Section 179 with income=0: S179 applied = 0, year-1 MACRS = 41,662.50.
// When strategy = Bonus Only with income=0: year1 = 125,000 (full bonus), NOL = 125,000.
const noIncome = compareStrategies({
  assetClass: ASSET_CLASS.SEMI_TRACTOR_OTR,
  costBasis: 125000,
  salvageValue: 0,
  section179Amount: 125000, // user wants max, but income limit will clamp to 0
  bonusRate: 1.0,
  placedInServiceDate: '2026-03-15',
  businessUsePct: 100,
  taxOfNet: () => ({ totalTax: 0 }),
  netProfitBeforeDeduction: 0,
})

const s179Row = noIncome.find(r => r.key === STRATEGY.SECTION_179)
assertEq(s179Row.section179Applied, 0, '§179(b)(3): S179 clamps to $0 when income = $0')
assertNear(s179Row.year1MACRS, 125000 * 0.3333, 0.01, 'year-1 MACRS on full basis = $41,662.50')
assertEq(s179Row.nolYear1, 0, 'Section 179 strategy never produces NOL (income-limited)')

const bonusRow = noIncome.find(r => r.key === STRATEGY.BONUS_ONLY)
assertNear(bonusRow.year1, 125000, 0.5, 'Bonus only: year-1 = full basis at 100% rate')
assertNear(bonusRow.nolYear1, 125000, 0.5, 'Bonus only at $0 income: NOL = full year-1 deduction')

// With income = $60,000, Bonus Only still writes off $125k — NOL = $65k.
const lowIncome = compareStrategies({
  assetClass: ASSET_CLASS.SEMI_TRACTOR_OTR,
  costBasis: 125000,
  section179Amount: 125000,
  bonusRate: 1.0,
  placedInServiceDate: '2026-03-15',
  businessUsePct: 100,
  taxOfNet: () => ({ totalTax: 0 }),
  netProfitBeforeDeduction: 60000,
})
const bonusLow = lowIncome.find(r => r.key === STRATEGY.BONUS_ONLY)
assertNear(bonusLow.nolYear1, 65000, 0.5, 'Bonus only at $60k income: NOL = $65k ($125k - $60k)')

// Section 179 at $60k income: S179 applied = $60k (clamped), remainder MACRS.
const s179Low = lowIncome.find(r => r.key === STRATEGY.SECTION_179)
assertEq(s179Low.section179Applied, 60000, 'S179 clamps to income ceiling ($60k)')
const remaining = 125000 - 60000
const year1MACRSLow = remaining * 0.3333
assertNear(s179Low.year1MACRS, year1MACRSLow, 0.01, 'year-1 MACRS on remainder after §179 = ~$21,664.50')

console.log('\n=== buildStrategySchedule: 3-year MACRS spans 4 tax years (half-year convention) ===\n')

const standardSched = buildStrategySchedule({
  strategy: STRATEGY.STANDARD_MACRS,
  assetClass: ASSET_CLASS.SEMI_TRACTOR_OTR,
  costBasis: 125000,
  placedInServiceDate: '2026-03-15',
  businessUsePct: 100,
})
assertEq(standardSched.schedule.length, 4, '3-year property has 4 tax-year rows (half-year splits into 3.5 rounded up)')
assertNear(standardSched.totalOverLife, 125000, 0.5, 'total over full life = depreciable basis (rates sum to 1.0)')

if (failures === 0) {
  console.log('\n✓ ALL ' + passes + ' ASSERTIONS PASSED')
  process.exit(0)
} else {
  console.error('\n✗ ' + failures + ' FAILED, ' + passes + ' passed')
  process.exit(1)
}
