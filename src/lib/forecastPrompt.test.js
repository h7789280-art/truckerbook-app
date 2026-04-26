// Tests for src/lib/forecastPrompt.js — currency-safe Gemini prompt
// and post-response violation detection. Run with `node`.

import {
  buildForecastPrompt,
  containsNonUsdCurrency,
  _CURRENCY_RULE,
} from './forecastPrompt.js'

let failures = 0
let passes = 0
const mismatches = []

function assertTrue(cond, label) {
  if (cond) {
    passes++
  } else {
    failures++
    mismatches.push(label)
    console.error('  FAIL ' + label)
  }
}

function assertFalse(cond, label) {
  assertTrue(!cond, label)
}

console.log('\n=== forecastPrompt tests ===\n')

// ----------------------------------------------------------------------
// Test 1 — Snapshot: prompt contains the load-bearing currency phrases
// ----------------------------------------------------------------------
{
  const prompt = buildForecastPrompt({
    data: { '2026-04': { fuel: 1000 } },
    lang: 'ru',
    monthCount: 1,
  })
  assertTrue(prompt.includes('USD'), "Test1a: prompt mentions 'USD'")
  assertTrue(prompt.includes('only'), "Test1b: prompt mentions 'only'")
  assertTrue(prompt.includes('$'), "Test1c: prompt contains '$' symbol")
  assertTrue(prompt.includes('NEVER use RUB'), "Test1d: prompt contains 'NEVER use RUB'")
  assertTrue(prompt.includes('TruckerBook is a US tax'), "Test1e: prompt contains 'TruckerBook is a US tax'")
  assertTrue(prompt.indexOf('CRITICAL CURRENCY RULE') === 0, 'Test1f: currency rule appears at the top of the prompt')
  assertTrue(_CURRENCY_RULE.includes('NEVER use RUB'), 'Test1g: exported _CURRENCY_RULE matches expected text')
}

// ----------------------------------------------------------------------
// Test 2 — Detector positive: Russian word forms
// ----------------------------------------------------------------------
{
  assertTrue(
    containsNonUsdCurrency('Прогноз: 11 000 рублей на следующий месяц'),
    "Test2a: detects 'рублей'",
  )
  assertTrue(
    containsNonUsdCurrency('Расходы составят примерно 5000 руб. в месяц'),
    "Test2b: detects 'руб.' abbreviation",
  )
  assertTrue(
    containsNonUsdCurrency('Бюджет: рубль колеблется'),
    "Test2c: detects nominative 'рубль'",
  )
}

// ----------------------------------------------------------------------
// Test 3 — Detector positive: ISO code RUB
// ----------------------------------------------------------------------
{
  assertTrue(
    containsNonUsdCurrency('Forecast: 5000 RUB next month'),
    "Test3a: detects standalone 'RUB'",
  )
  assertFalse(
    containsNonUsdCurrency('grub stake for the trip'),
    "Test3b: 'grub' (substring) does NOT trigger \\bRUB\\b match",
  )
}

// ----------------------------------------------------------------------
// Test 4 — Detector positive: ruble symbol ₽
// ----------------------------------------------------------------------
{
  assertTrue(
    containsNonUsdCurrency('Расходы 8000₽ за месяц'),
    "Test4: detects '₽' symbol",
  )
}

// ----------------------------------------------------------------------
// Test 5 — Detector negative: USD-only forecast in any language
// ----------------------------------------------------------------------
{
  assertFalse(
    containsNonUsdCurrency('Прогноз $11,000 на следующий месяц'),
    'Test5a: USD-only Russian text passes',
  )
  assertFalse(
    containsNonUsdCurrency('Next month: $5,234.56 across all categories'),
    'Test5b: USD-only English text passes',
  )
}

// ----------------------------------------------------------------------
// Test 6 — Detector negative: Russian text with NO currency mentions
// must NOT trigger. Specifically, common words that share Cyrillic
// letters with currency markers (e.g. "рекомендую") should not falsely
// match.
// ----------------------------------------------------------------------
{
  assertFalse(
    containsNonUsdCurrency('Рекомендую увеличить расходы на топливо в следующем месяце'),
    "Test6a: 'рекомендую' does NOT trigger ruble detector",
  )
  assertFalse(
    containsNonUsdCurrency('Расход топлива растёт в зимний период'),
    "Test6b: generic Russian sentence without currency markers passes",
  )
}

// ----------------------------------------------------------------------
// Test 7 — Detector positive: other non-USD currencies (€, £, EUR, GBP)
// ----------------------------------------------------------------------
{
  assertTrue(containsNonUsdCurrency('Cost: €1,200 next month'), "Test7a: detects '€'")
  assertTrue(containsNonUsdCurrency('Roughly 1500 EUR'), "Test7b: detects 'EUR'")
  assertTrue(containsNonUsdCurrency('£500 budget'), "Test7c: detects '£'")
  assertTrue(containsNonUsdCurrency('Estimated 2000 GBP'), "Test7d: detects 'GBP'")
}

// ----------------------------------------------------------------------
// Test 8 — Edge cases: non-string and empty inputs
// ----------------------------------------------------------------------
{
  assertFalse(containsNonUsdCurrency(''), 'Test8a: empty string returns false')
  assertFalse(containsNonUsdCurrency(null), 'Test8b: null returns false')
  assertFalse(containsNonUsdCurrency(undefined), 'Test8c: undefined returns false')
  assertFalse(containsNonUsdCurrency(123), 'Test8d: number returns false')
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
console.log('\nAll forecastPrompt tests passed.\n')
