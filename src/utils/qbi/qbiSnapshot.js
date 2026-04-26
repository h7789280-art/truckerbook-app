// Pure helpers for QBI snapshot persistence (Session 2B).
//
// Extracted out of QBICalculatorTab.jsx so the save-payload shape and the
// tier-detection logic can be tested without spinning up React. The component
// composes these on click; the migration only adds estimated_tax_settings.sehi_annual,
// so this module reuses the existing qbi_calculations.qbi_loss_carryover column
// for prior-year QBI loss carryover (§199A(c)(2)).

// Determine which of the three §199A "tiers" actually bound the deduction.
// Returns 1, 2, or 3.
//
// Inputs come straight from QBICalculatorTab: tier1 = 0.20*qbi, tier2 =
// 0.20*taxable_income, tier3 = max(0.50*W2, 0.25*W2 + 0.025*UBIA).
// The match is done against the calculator's published `deduction` value
// with a $1 tolerance to absorb floating-point drift, then a deterministic
// fallback ensures we never return null.
//
// Phase rules:
//  - 'below'           → tier3 doesn't apply; pick min(tier1, tier2)
//  - 'above' & SSTB    → SSTB phased out; deduction is 0; pick min(tier1, tier2)
//  - 'within' / 'above' (non-SSTB) → all three tiers are live
export function determineTierUsed({
  phase,
  isSSTB = false,
  tier1 = 0,
  tier2 = 0,
  tier3 = 0,
  deduction = 0,
}) {
  const t1 = Math.max(0, Number(tier1) || 0)
  const t2 = Math.max(0, Number(tier2) || 0)
  const t3 = Math.max(0, Number(tier3) || 0)
  const d = Math.max(0, Number(deduction) || 0)

  const sstbPhasedOut = isSSTB === true && phase === 'above'
  const tier3Live = phase !== 'below' && !sstbPhasedOut

  // Match by closest value to the calculator's published deduction.
  const candidates = tier3Live
    ? [
        { tier: 1, value: t1 },
        { tier: 2, value: t2 },
        { tier: 3, value: t3 },
      ]
    : [
        { tier: 1, value: t1 },
        { tier: 2, value: t2 },
      ]

  let best = candidates[0]
  let bestDiff = Math.abs(candidates[0].value - d)
  for (let i = 1; i < candidates.length; i++) {
    const diff = Math.abs(candidates[i].value - d)
    if (diff < bestDiff) {
      best = candidates[i]
      bestDiff = diff
    }
  }
  if (bestDiff <= 1) return best.tier

  // Deterministic fallback: the binding tier is the smallest applicable one.
  let minVal = Infinity
  let minTier = 1
  for (const c of candidates) {
    if (c.value < minVal) {
      minVal = c.value
      minTier = c.tier
    }
  }
  return minTier
}

// Build the row that will be UPSERT-ed into qbi_calculations. Shape mirrors
// the existing schema (see supabase/migrations/20260424_qbi_deduction.sql);
// extras (tier_used, net_profit, se_tax, sehi_annual, ubia_used) ride inside
// calculation_snapshot — they are not stored as separate columns.
//
// All numerics are coerced to finite numbers; objects without enough data
// produce a row with safe zero defaults rather than throwing, so the caller
// can rely on shape stability for tests and DB writes.
export function buildQBISavePayload({
  userId,
  taxYear,
  filingStatus,
  qbiBase,
  taxableIncomeCap,
  isSSTB,
  w2Wages,
  ubia,
  priorYearLoss,
  sehiAnnual,
  netProfit,
  seTax,
  result,
  tier1,
  tier2,
  tier3,
  now,
}) {
  const num = (v, dflt = 0) => (Number.isFinite(Number(v)) ? Number(v) : dflt)
  const ts = (now instanceof Date ? now : new Date()).toISOString()
  const r = result || {}

  const tierUsed = determineTierUsed({
    phase: r.phase,
    isSSTB,
    tier1,
    tier2,
    tier3,
    deduction: r.deduction,
  })

  return {
    user_id: userId,
    tax_year: num(taxYear),
    filing_status: filingStatus,
    taxable_income_before_qbi: num(taxableIncomeCap),
    qbi: num(qbiBase),
    w2_wages: num(w2Wages),
    ubia: num(ubia),
    net_capital_gain: 0,
    is_sstb: !!isSSTB,
    deduction: num(r.deduction),
    phase: r.phase || 'below',
    applied_rule: r.appliedRule || null,
    qbi_loss_carryover: num(priorYearLoss),
    calculation_snapshot: {
      ...r,
      tier_used: tierUsed,
      net_profit: num(netProfit),
      se_tax: num(seTax),
      sehi_annual: num(sehiAnnual),
      ubia_used: num(ubia),
      prior_year_qbi_loss: num(priorYearLoss),
    },
    calculated_at: ts,
    updated_at: ts,
  }
}
