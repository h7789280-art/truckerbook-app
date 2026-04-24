// Unit tests for the unified CPM calculator.
//
// Run with: `node --test src/lib/metrics/cpmCalculator.test.mjs`
//
// Scenarios mirror the acceptance criteria in the task brief:
//   1. Month, variable-only (no fixed costs).
//   2. Full year, with depreciation and insurance.
//   3. Zero miles — no NaN / Infinity anywhere.
//   4. Month pro-rating of annual depreciation.
//
// Notes:
//   - Monetary totals are rounded to cents (±0.01 tolerance).
//   - $/mile figures are rounded to 3 decimal places (industry standard).
//     Tests allow ±$0.005 slack to absorb the rounding boundary.
//   - No Supabase involvement: we drive computeCPM via the `inputs` shortcut
//     so tests stay hermetic.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeCPM, computeCPMFromInputs } from './cpmCalculator.js'

const MONEY_TOL = 0.01
const PERMILE_TOL = 0.005

function assertMoney(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= MONEY_TOL + 1e-6,
    `${label}: expected ≈ ${expected}, got ${actual}`,
  )
}

function assertPerMile(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= PERMILE_TOL + 1e-6,
    `${label}: expected ≈ ${expected}, got ${actual}`,
  )
}

test('Scenario 1: month with only variable costs (maintenance + per diem)', async () => {
  const result = await computeCPM({
    year: 2026,
    month: 4,
    inputs: {
      miles: 3278,
      fuel: 0,
      maintenance: 1005,
      tolls: 0,
      parking: 0,
      perDiem: 310,
      insurance: 0,
      truckPayment: 0,
      depreciationAnnual: 0,
      revenue: 9700,
    },
  })

  assert.equal(result.miles, 3278)

  assertMoney(result.variable.fuel, 0, 'variable.fuel')
  assertMoney(result.variable.maintenance, 1005, 'variable.maintenance')
  assertMoney(result.variable.tolls, 0, 'variable.tolls')
  assertMoney(result.variable.parking, 0, 'variable.parking')
  assertMoney(result.variable.perDiem, 310, 'variable.perDiem')
  assertMoney(result.variable.total, 1315, 'variable.total')
  assertPerMile(result.variable.perMile, 1315 / 3278, 'variable.perMile')

  assertMoney(result.fixed.insurance, 0, 'fixed.insurance')
  assertMoney(result.fixed.truckPayment, 0, 'fixed.truckPayment')
  assertMoney(result.fixed.depreciation, 0, 'fixed.depreciation')
  assertMoney(result.fixed.total, 0, 'fixed.total')
  assertMoney(result.fixed.perMile, 0, 'fixed.perMile')

  assertMoney(result.fullyLoaded.total, 1315, 'fullyLoaded.total')
  assertPerMile(result.fullyLoaded.perMile, 1315 / 3278, 'fullyLoaded.perMile')

  assertMoney(result.revenue.total, 9700, 'revenue.total')
  assertPerMile(result.revenue.perMile, 9700 / 3278, 'revenue.perMile')

  assertMoney(result.profit.variable, 9700 - 1315, 'profit.variable')
  assertPerMile(result.profit.variablePerMile, (9700 - 1315) / 3278, 'profit.variablePerMile')
  assertMoney(result.profit.fullyLoaded, 9700 - 1315, 'profit.fullyLoaded')
  assertPerMile(result.profit.fullyLoadedPerMile, (9700 - 1315) / 3278, 'profit.fullyLoadedPerMile')
})

test('Scenario 2: full year with depreciation and insurance', async () => {
  const result = await computeCPM({
    year: 2026,
    // no month → full-year period
    inputs: {
      miles: 120000,
      fuel: 50000,
      maintenance: 8000,
      tolls: 2000,
      parking: 0,
      perDiem: 16000,
      insurance: 6000,
      truckPayment: 0,
      depreciationAnnual: 41662,
      revenue: 0,
    },
  })

  assert.equal(result.miles, 120000)

  assertMoney(result.variable.total, 76000, 'variable.total')
  assertPerMile(result.variable.perMile, 76000 / 120000, 'variable.perMile ≈ $0.633')

  // Year period → depreciation used as-is (no /12 pro-rating).
  assertMoney(result.fixed.depreciation, 41662, 'fixed.depreciation (no pro-rating for year)')
  assertMoney(result.fixed.insurance, 6000, 'fixed.insurance')
  assertMoney(result.fixed.truckPayment, 0, 'fixed.truckPayment')
  assertMoney(result.fixed.total, 47662, 'fixed.total')
  assertPerMile(result.fixed.perMile, 47662 / 120000, 'fixed.perMile ≈ $0.397')

  assertMoney(result.fullyLoaded.total, 123662, 'fullyLoaded.total')
  assertPerMile(result.fullyLoaded.perMile, 123662 / 120000, 'fullyLoaded.perMile ≈ $1.03')
})

test('Scenario 3: zero miles — no divide-by-zero, no NaN, no Infinity', async () => {
  const result = await computeCPM({
    year: 2026,
    month: 7,
    inputs: {
      miles: 0,
      fuel: 500,
      maintenance: 1200,
      tolls: 50,
      parking: 25,
      perDiem: 300,
      insurance: 500,
      truckPayment: 2000,
      depreciationAnnual: 12000,
      revenue: 0,
    },
  })

  assert.equal(result.miles, 0)

  // Totals still accumulate normally.
  assertMoney(result.variable.total, 500 + 1200 + 50 + 25 + 300, 'variable.total')
  assertMoney(result.fixed.insurance, 500, 'fixed.insurance')
  assertMoney(result.fixed.truckPayment, 2000, 'fixed.truckPayment')
  assertMoney(result.fixed.depreciation, 12000 / 12, 'fixed.depreciation pro-rated')

  // Every *PerMile MUST be a finite 0 — never NaN or Infinity.
  const perMileFields = [
    ['variable.perMile', result.variable.perMile],
    ['fixed.perMile', result.fixed.perMile],
    ['fullyLoaded.perMile', result.fullyLoaded.perMile],
    ['revenue.perMile', result.revenue.perMile],
    ['profit.variablePerMile', result.profit.variablePerMile],
    ['profit.fullyLoadedPerMile', result.profit.fullyLoadedPerMile],
  ]
  for (const [label, v] of perMileFields) {
    assert.ok(Number.isFinite(v), `${label} must be finite, got ${v}`)
    assert.equal(v, 0, `${label} must be 0 when miles === 0`)
  }
})

test('Scenario 4: month pro-rates annual depreciation (÷ 12)', async () => {
  const result = await computeCPM({
    year: 2026,
    month: 5,
    inputs: {
      miles: 10000,
      fuel: 0,
      maintenance: 0,
      tolls: 0,
      parking: 0,
      perDiem: 0,
      insurance: 0,
      truckPayment: 0,
      depreciationAnnual: 41662,
      revenue: 0,
    },
  })

  // 41662 / 12 ≈ 3471.83 (≈ $3,472 to the nearest dollar).
  assertMoney(result.fixed.depreciation, 41662 / 12, 'fixed.depreciation ≈ $3,472')

  assertMoney(result.fixed.total, 41662 / 12, 'fixed.total')
  assertPerMile(result.fixed.perMile, (41662 / 12) / 10000, 'fixed.perMile ≈ $0.347')
})

test('computeCPMFromInputs: treats missing inputs as zeros (defensive defaults)', () => {
  const result = computeCPMFromInputs({ miles: 100, fuel: 50 })
  assertMoney(result.variable.total, 50, 'variable.total')
  assertMoney(result.fixed.total, 0, 'fixed.total')
  assertPerMile(result.variable.perMile, 0.5, 'variable.perMile')
  assertPerMile(result.fullyLoaded.perMile, 0.5, 'fullyLoaded.perMile')
})

test('computeCPM: throws when neither inputs nor supabase is provided', async () => {
  await assert.rejects(
    () => computeCPM({ year: 2026, month: 1, userId: 'u1' }),
    /supabase.*inputs/,
  )
})

test('computeCPM: year period keeps depreciation whole (no /12)', async () => {
  const monthResult = await computeCPM({
    year: 2026, month: 3,
    inputs: { miles: 12000, depreciationAnnual: 12000 },
  })
  const yearResult = await computeCPM({
    year: 2026,
    inputs: { miles: 12000, depreciationAnnual: 12000 },
  })
  assertMoney(monthResult.fixed.depreciation, 1000, 'month depreciation pro-rated')
  assertMoney(yearResult.fixed.depreciation, 12000, 'year depreciation full')
})
