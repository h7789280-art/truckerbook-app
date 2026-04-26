// Tests for qbiSnapshot.js — Session 2B persistence helpers.
// Run with `node`; exits 0 iff every assertion holds.
//
// Component-level tests (React Testing Library) are not feasible in this
// project — package.json runs vanilla `node` test scripts and there is no
// vitest/jest harness. Instead we verify the two pure pieces that actually
// drive the save flow:
//   1. determineTierUsed — Petr (Tier 3 binds at $3,125)
//   2. buildQBISavePayload — shape + tier_used + reuse of qbi_loss_carryover
//   3. SEHI conditional persistence intent (sehiAnnual handled in payload)
//
// The Supabase upsert/delete code paths in QBICalculatorTab.jsx call into
// these helpers and a mocked client locally — but cannot be run from node
// without DOM. Smoke verification is left to the manual QA step in the
// post-push reminder to Elena.

import { determineTierUsed, buildQBISavePayload } from './qbiSnapshot.js'

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

function assertClose(actual, expected, label, tol = 0.01) {
  const a = Number(actual)
  const e = Number(expected)
  if (Number.isFinite(a) && Number.isFinite(e) && Math.abs(a - e) <= tol) {
    passes++
  } else {
    failures++
    mismatches.push(label + ' (actual=' + actual + ', expected=' + expected + ')')
    console.error('  FAIL ' + label + ': expected ' + e + ' ±' + tol + ', got ' + a)
  }
}

console.log('\n=== QBI Snapshot helpers tests ===\n')

// ----------------------------------------------------------------------
// Test 1 — determineTierUsed: Petr scenario, Tier 3 binds
// ----------------------------------------------------------------------
// MFJ owner-operator with Net Profit $500,139.50, UBIA $125k, no W-2 wages.
// QBI base ≈ $464,170; taxable_income_cap ≈ $470,070; tier3 = max(0, 0.025 * 125000) = $3,125.
// Phase is 'above' (TI > $553,500 upper threshold? actually $470k is within for MFJ),
// but for purposes of this assertion the published deduction equals tier3 = $3,125.
// (Mirrors the spec: "У Петра минимум — Tier 3 = $3,125, значит итоговый QBI вычет = $3,125")
{
  const tier = determineTierUsed({
    phase: 'within',
    isSSTB: false,
    tier1: 92834,    // 0.20 × 464170
    tier2: 94014,    // 0.20 × 470070
    tier3: 3125,     // 0.025 × 125000
    deduction: 3125, // calculator output
  })
  assertEq(tier, 3, 'Petr.tierUsed = 3 (W-2/UBIA cap binds)')
}

// ----------------------------------------------------------------------
// Test 2 — determineTierUsed: below-threshold case → tier3 not applicable
// ----------------------------------------------------------------------
{
  const tier = determineTierUsed({
    phase: 'below',
    isSSTB: false,
    tier1: 10000,
    tier2: 12000,
    tier3: 5000,
    deduction: 10000,
  })
  assertEq(tier, 1, 'Below-threshold.tierUsed = 1 (QBI*20% binds)')
}

// ----------------------------------------------------------------------
// Test 3 — determineTierUsed: TI lower than QBI → tier 2 binds
// ----------------------------------------------------------------------
{
  const tier = determineTierUsed({
    phase: 'below',
    isSSTB: false,
    tier1: 20000,
    tier2: 8000,
    tier3: 50000,
    deduction: 8000,
  })
  assertEq(tier, 2, 'Tier2 binds when taxable income is the smallest')
}

// ----------------------------------------------------------------------
// Test 4 — determineTierUsed: SSTB phased out → tier3 ignored
// ----------------------------------------------------------------------
{
  const tier = determineTierUsed({
    phase: 'above',
    isSSTB: true,
    tier1: 20000,
    tier2: 25000,
    tier3: 100, // would normally apply, but SSTB phased out
    deduction: 0,
  })
  // Closest match to deduction=0 among [tier1, tier2] is tier1=20000 (diff 20000)
  // vs tier2=25000 (diff 25000) → tier1. Both are >$1 from 0, so falls through
  // to deterministic fallback "smallest applicable" → also tier1.
  assertEq(tier, 1, 'SSTB phased-out picks smallest of tier1/tier2')
}

// ----------------------------------------------------------------------
// Test 5 — buildQBISavePayload: shape + key fields for Petr
// ----------------------------------------------------------------------
{
  const payload = buildQBISavePayload({
    userId: 'user-123',
    taxYear: 2026,
    filingStatus: 'mfj',
    qbiBase: 464170,
    taxableIncomeCap: 470070,
    isSSTB: false,
    w2Wages: 0,
    ubia: 125000,
    priorYearLoss: 0,
    sehiAnnual: 0,
    netProfit: 500139.50,
    seTax: 38179.40,
    result: {
      deduction: 3125,
      phase: 'within',
      appliedRule: 'min(tier1, tier2, tier3)',
    },
    tier1: 92834,
    tier2: 94014,
    tier3: 3125,
    now: new Date('2026-04-26T10:00:00Z'),
  })

  assertEq(payload.user_id, 'user-123', 'payload.user_id')
  assertEq(payload.tax_year, 2026, 'payload.tax_year')
  assertEq(payload.filing_status, 'mfj', 'payload.filing_status')
  assertEq(payload.is_sstb, false, 'payload.is_sstb')
  assertClose(payload.deduction, 3125, 'payload.deduction = $3,125')
  assertClose(payload.qbi, 464170, 'payload.qbi (= qbi base)')
  assertClose(payload.taxable_income_before_qbi, 470070, 'payload.taxable_income_before_qbi (= cap)')
  assertClose(payload.ubia, 125000, 'payload.ubia')
  assertClose(payload.qbi_loss_carryover, 0, 'payload.qbi_loss_carryover (Session 2B reuses existing column)')
  assertEq(payload.phase, 'within', 'payload.phase')
  assertEq(payload.calculation_snapshot.tier_used, 3, 'payload.snapshot.tier_used = 3')
  assertClose(payload.calculation_snapshot.net_profit, 500139.50, 'payload.snapshot.net_profit')
  assertClose(payload.calculation_snapshot.se_tax, 38179.40, 'payload.snapshot.se_tax')
  assertEq(payload.calculation_snapshot.sehi_annual, 0, 'payload.snapshot.sehi_annual = 0 when not provided')
}

// ----------------------------------------------------------------------
// Test 6 — buildQBISavePayload: prior-year loss reuses qbi_loss_carryover
// ----------------------------------------------------------------------
{
  const payload = buildQBISavePayload({
    userId: 'user-1',
    taxYear: 2026,
    filingStatus: 'single',
    qbiBase: 100000,
    taxableIncomeCap: 95000,
    isSSTB: false,
    w2Wages: 0,
    ubia: 0,
    priorYearLoss: 12500,
    sehiAnnual: 5000,
    netProfit: 130000,
    seTax: 18000,
    result: { deduction: 19000, phase: 'below', appliedRule: 'min(tier1, tier2)' },
    tier1: 20000,
    tier2: 19000,
    tier3: 0,
  })

  assertClose(payload.qbi_loss_carryover, 12500, 'qbi_loss_carryover stores priorYearLoss (not a new column)')
  assertClose(payload.calculation_snapshot.prior_year_qbi_loss, 12500, 'snapshot mirrors prior_year_qbi_loss for forward-compat')
  assertClose(payload.calculation_snapshot.sehi_annual, 5000, 'snapshot persists sehi_annual for re-render')
  assertEq(payload.calculation_snapshot.tier_used, 2, 'tier 2 binds when TI cap < tier1')
}

// ----------------------------------------------------------------------
// Test 7 — buildQBISavePayload: defensive defaults on missing input
// ----------------------------------------------------------------------
{
  const payload = buildQBISavePayload({
    userId: 'u',
    taxYear: 2026,
    filingStatus: 'single',
    isSSTB: false,
    result: {},
  })
  assertEq(payload.deduction, 0, 'missing result.deduction → 0')
  assertEq(payload.phase, 'below', 'missing result.phase → \'below\'')
  assertEq(payload.applied_rule, null, 'missing appliedRule → null')
  assertEq(payload.qbi, 0, 'missing qbiBase → 0')
  assertEq(payload.is_sstb, false, 'is_sstb coerced from undefined → false')
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
console.log('\nAll QBI Snapshot helper tests passed.\n')
