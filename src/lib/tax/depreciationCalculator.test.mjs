// Standalone tests for the depreciation calculator recommendation logic.
// Run directly with `node src/lib/tax/depreciationCalculator.test.mjs` — no test framework needed.
// Covers the four Acceptance Criteria cases for recommendStrategy + sanity checks on
// compareStrategies (IRC §179(b)(3) income limitation, NOL carryforward, total-over-life).

import {
  recommendStrategy,
  compareStrategies,
  buildStrategySchedule,
  getMaxSection179Slider,
  reduceStrategyState,
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
// NOL: §179 caps at $0, so the whole strategy collapses into standard MACRS. The MACRS
// component is NOT income-limited, so year1 MACRS ($41,662.50) flows through as an NOL.
assertNear(s179Row.nolYear1, 125000 * 0.3333, 0.01, 'Section 179 at $0 income: MACRS component creates NOL = $41,662.50')

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

console.log('\n=== NOL carryforward parity across all 4 strategies (the bug fix) ===\n')
console.log('Uniform rule: NOL year1 = max(totalDeductionYear1 - taxableIncome, 0).\n')

// ---- Scenario A: income = 0, basis = $500,000 — every strategy produces an NOL.
const scenA = compareStrategies({
  assetClass: ASSET_CLASS.SEMI_TRACTOR_OTR,
  costBasis: 500000,
  section179Amount: 500000,
  bonusRate: 1.0,
  placedInServiceDate: '2026-03-15',
  businessUsePct: 100,
  taxOfNet: () => ({ totalTax: 0 }),
  netProfitBeforeDeduction: 0,
})
const A_std = scenA.find(r => r.key === STRATEGY.STANDARD_MACRS)
const A_s179 = scenA.find(r => r.key === STRATEGY.SECTION_179)
const A_s179b = scenA.find(r => r.key === STRATEGY.SECTION_179_BONUS)
const A_bonus = scenA.find(r => r.key === STRATEGY.BONUS_ONLY)
assertNear(A_std.nolYear1, 500000 * 0.3333, 0.5, 'A.Std MACRS: NOL = year1 $166,650 when income=0')
assertNear(A_s179.nolYear1, 500000 * 0.3333, 0.5, 'A.Section 179: §179 caps at $0, MACRS creates NOL = $166,650')
assertNear(A_s179b.nolYear1, 500000, 0.5, 'A.S179 + Bonus: NOL = $500,000 (full basis writedown)')
assertNear(A_bonus.nolYear1, 500000, 0.5, 'A.Bonus only: NOL = $500,000')

// ---- Scenario B: income = $500,000, basis = $125,000 — deduction fully absorbed, no NOL.
const scenB = compareStrategies({
  assetClass: ASSET_CLASS.SEMI_TRACTOR_OTR,
  costBasis: 125000,
  section179Amount: 125000,
  bonusRate: 1.0,
  placedInServiceDate: '2026-03-15',
  businessUsePct: 100,
  taxOfNet: () => ({ totalTax: 0 }),
  netProfitBeforeDeduction: 500000,
})
const B_std = scenB.find(r => r.key === STRATEGY.STANDARD_MACRS)
const B_s179 = scenB.find(r => r.key === STRATEGY.SECTION_179)
const B_s179b = scenB.find(r => r.key === STRATEGY.SECTION_179_BONUS)
const B_bonus = scenB.find(r => r.key === STRATEGY.BONUS_ONLY)
assertEq(B_std.nolYear1, 0, 'B.Std MACRS: income >> year1, NOL = 0')
assertEq(B_s179.nolYear1, 0, 'B.Section 179: income covers full §179 writeoff, NOL = 0')
assertEq(B_s179b.nolYear1, 0, 'B.S179 + Bonus: income $500k > year1 $125k, NOL = 0')
assertEq(B_bonus.nolYear1, 0, 'B.Bonus only: income $500k > year1 $125k, NOL = 0')

// ---- Scenario C: income = $50,000, basis = $125,000 — MACRS & S179 absorbed, Bonus overflows.
const scenC = compareStrategies({
  assetClass: ASSET_CLASS.SEMI_TRACTOR_OTR,
  costBasis: 125000,
  section179Amount: 125000,
  bonusRate: 1.0,
  placedInServiceDate: '2026-03-15',
  businessUsePct: 100,
  taxOfNet: () => ({ totalTax: 0 }),
  netProfitBeforeDeduction: 50000,
})
const C_std = scenC.find(r => r.key === STRATEGY.STANDARD_MACRS)
const C_s179 = scenC.find(r => r.key === STRATEGY.SECTION_179)
const C_s179b = scenC.find(r => r.key === STRATEGY.SECTION_179_BONUS)
const C_bonus = scenC.find(r => r.key === STRATEGY.BONUS_ONLY)
// Std MACRS: year1 = 125k × 0.3333 = $41,662.50 < $50k income → NOL = 0.
assertEq(C_std.nolYear1, 0, 'C.Std MACRS: year1 $41,662 < income $50k, NOL = 0')
// Section 179: §179 capped at $50k, MACRS on remaining $75k = 75k × 0.3333 = $24,997.50.
// year1 total = $50k + $24,997.50 = $74,997.50. NOL = 74,997.50 - 50,000 = $24,997.50.
assertNear(C_s179.nolYear1, (125000 - 50000) * 0.3333, 0.5, 'C.Section 179: MACRS on $75k remainder = NOL ~$24,997.50')
// S179 + Bonus: §179 = $50k, Bonus on remaining $75k = $75k. year1 = $125k. NOL = $75k.
assertNear(C_s179b.nolYear1, 75000, 0.5, 'C.S179 + Bonus: year1 $125k - income $50k = NOL $75,000')
// Bonus only: year1 = $125k. NOL = $125k - $50k = $75k.
assertNear(C_bonus.nolYear1, 75000, 0.5, 'C.Bonus only: year1 $125k - income $50k = NOL $75,000')

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

console.log('\n=== Calculator UI contract: sync + userOverride + slider (Scenarios A/B/C/D) ===\n')

// --- Scenario A: basis=$500k, income=$0 ---
// Recommended: BONUS_ONLY. Slider: disabled (maxSection179 = 0).
{
  const recA = recommendStrategy({
    costBasis: 500000,
    estimatedTaxableIncome: 0,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  })
  assertEq(recA.key, STRATEGY.BONUS_ONLY, 'A: recommended = Bonus only for basis=$500k, income=$0')

  const maxA = getMaxSection179Slider({ costBasis: 500000, taxableIncome: 0 })
  assertEq(maxA, 0, 'A: maxSection179 = 0 when income = 0 (slider disabled)')

  // Sync: fresh mount, no override. initial_sync should pick recommendation.
  const stateA = reduceStrategyState(
    { strategy: STRATEGY.STANDARD_MACRS, userOverride: false },
    { type: 'initial_sync', recommendedKey: recA.key },
  )
  assertEq(stateA.strategy, STRATEGY.BONUS_ONLY, 'A: sync snaps active to Bonus only')
  assertEq(stateA.userOverride, false, 'A: sync does not set userOverride')
}

// --- Scenario B: basis=$500k, income=$500k ---
// Recommended: SECTION_179. Slider: 0..$500k with default $500k.
{
  const recB = recommendStrategy({
    costBasis: 500000,
    estimatedTaxableIncome: 500000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  })
  assertEq(recB.key, STRATEGY.SECTION_179, 'B: recommended = Section 179 for basis=$500k, income=$500k')

  const maxB = getMaxSection179Slider({ costBasis: 500000, taxableIncome: 500000 })
  assertEq(maxB, 500000, 'B: maxSection179 = $500,000 (basis, income, and 2026 cap all allow)')

  // Section 179 strategy with slider at maxSection179 = $500k produces full writeoff.
  const cmpB = compareStrategies({
    assetClass: ASSET_CLASS.SEMI_TRACTOR_OTR,
    costBasis: 500000,
    section179Amount: maxB,
    bonusRate: 1.0,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
    taxOfNet: () => ({ totalTax: 0 }),
    netProfitBeforeDeduction: 500000,
  })
  const rowB = cmpB.find(r => r.key === STRATEGY.SECTION_179)
  assertEq(rowB.section179Applied, 500000, 'B: §179 applied = full $500k (no income clamp)')
  assertNear(rowB.year1MACRS, 0, 0.5, 'B: year-1 MACRS = $0 (§179 absorbed everything)')
  assertEq(rowB.nolYear1, 0, 'B: NOL = 0 (income = deduction)')
}

// --- Scenario C: basis=$500k, income=$50k ---
// Recommended: SECTION_179_BONUS. Slider for §179 capped at $50k (income).
{
  const recC = recommendStrategy({
    costBasis: 500000,
    estimatedTaxableIncome: 50000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  })
  assertEq(recC.key, STRATEGY.SECTION_179_BONUS, 'C: recommended = Section 179 + Bonus for basis=$500k, income=$50k')

  const maxC = getMaxSection179Slider({ costBasis: 500000, taxableIncome: 50000 })
  assertEq(maxC, 50000, 'C: maxSection179 = $50,000 (income limit clamps below basis)')

  // User clicks a different card (e.g. Bonus only) → userOverride=true, strategy=clicked.
  const overrideC = reduceStrategyState(
    { strategy: STRATEGY.SECTION_179_BONUS, userOverride: false },
    { type: 'user_clicked', key: STRATEGY.BONUS_ONLY },
  )
  assertEq(overrideC.strategy, STRATEGY.BONUS_ONLY, 'C: clicking Bonus only sets active strategy')
  assertEq(overrideC.userOverride, true, 'C: clicking a card locks userOverride')

  // Subsequent initial_sync must NOT overwrite while userOverride is true.
  const stickyC = reduceStrategyState(overrideC, { type: 'initial_sync', recommendedKey: STRATEGY.SECTION_179_BONUS })
  assertEq(stickyC.strategy, STRATEGY.BONUS_ONLY, 'C: userOverride blocks sync from reverting to recommendation')
  assertEq(stickyC.userOverride, true, 'C: userOverride stays true through sync')
}

// --- Scenario D: income changes $0 → $500k, userOverride resets and active re-snaps ---
{
  // Start: user was on Bonus only (recommended for income=0) and had manually tapped it.
  const start = { strategy: STRATEGY.BONUS_ONLY, userOverride: true }

  // Editing income ($0 → $500k) sends input_changed with the NEW recommendation.
  const newRec = recommendStrategy({
    costBasis: 500000,
    estimatedTaxableIncome: 500000,
    placedInServiceDate: '2026-03-15',
    businessUsePct: 100,
  })
  assertEq(newRec.key, STRATEGY.SECTION_179, 'D: new recommendation after income $0→$500k = Section 179')

  const afterEdit = reduceStrategyState(start, { type: 'input_changed', recommendedKey: newRec.key })
  assertEq(afterEdit.userOverride, false, 'D: input change resets userOverride')
  assertEq(afterEdit.strategy, STRATEGY.SECTION_179, 'D: input change snaps active to new recommendation')
}

// --- Load-record behavior: saved strategy must survive the initial sync ---
{
  // User opens the tab, Supabase returns { strategy: 'bonus_only' }.
  const loaded = reduceStrategyState(
    { strategy: STRATEGY.STANDARD_MACRS, userOverride: false },
    { type: 'load_record', key: STRATEGY.BONUS_ONLY },
  )
  assertEq(loaded.strategy, STRATEGY.BONUS_ONLY, 'Load: saved strategy is applied')
  assertEq(loaded.userOverride, true, 'Load: treated as prior override so sync leaves it alone')

  // A same-frame sync must NOT overwrite.
  const survived = reduceStrategyState(loaded, { type: 'initial_sync', recommendedKey: STRATEGY.SECTION_179 })
  assertEq(survived.strategy, STRATEGY.BONUS_ONLY, 'Load: subsequent sync does not touch the loaded strategy')
}

// --- Slider bounds: phase-out cap ---
{
  // Huge hypothetical truck at $3M, income $5M. 2026 cap is $2.56M, income > cap, basis > cap → max = $2.56M.
  const big = getMaxSection179Slider({ costBasis: 3_000_000, taxableIncome: 5_000_000 })
  assertEq(big, 2_560_000, 'Slider: 2026 cap caps the max at $2,560,000 even when income and basis allow more')
}

if (failures === 0) {
  console.log('\n✓ ALL ' + passes + ' ASSERTIONS PASSED')
  process.exit(0)
} else {
  console.error('\n✗ ' + failures + ' FAILED, ' + passes + ' passed')
  process.exit(1)
}
