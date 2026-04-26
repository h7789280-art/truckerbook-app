// Currency-safe prompt construction + violation detection for AI Forecast.
//
// Why this lives here, not inline in AIForecast.jsx:
//   1) Pure JS so it can be unit-tested without spinning up React/Vite.
//   2) Reused by api/gemini.js as a server-side defense-in-depth check
//      (Russian-language prompts have historically caused Gemini to
//       hallucinate monetary values in rubles instead of USD, even when
//       the underlying business is US-only).

const LANG_MAP = {
  ru: 'Russian',
  en: 'English',
  uk: 'Ukrainian',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  tr: 'Turkish',
  pl: 'Polish',
}

// Hard currency rule prepended to every forecast prompt. The phrasing
// is deliberately blunt — Gemini follows ALL-CAPS imperative rules far
// more reliably than soft suggestions.
const CURRENCY_RULE = [
  'CRITICAL CURRENCY RULE:',
  '- All monetary values MUST be in US Dollars (USD) only.',
  '- Always prefix amounts with "$" symbol.',
  '- NEVER use RUB (рубли), EUR, GBP, or any non-USD currency, even if the user\'s interface language is not English.',
  '- TruckerBook is a US tax planning tool — all financial figures are USD.',
  '- If you would naturally say "11000 рублей" in Russian — instead say "$11,000".',
  '- Format: $1,234.56 (US-style: comma thousand separator, period decimal).',
].join('\n')

/**
 * Build the system prompt for an AI Forecast call.
 * The currency rule MUST come first so it has the highest salience.
 */
export function buildForecastPrompt({ data, lang, monthCount }) {
  const language = LANG_MAP[lang] || 'English'
  const partialNote = monthCount < 3
    ? ` Based on ${monthCount} month(s) of data (partial history, may be less accurate).`
    : ''

  return [
    CURRENCY_RULE,
    '',
    `You are a financial analyst for a trucking business. Based on the expense data below, provide a brief forecast for next month. Include: 1) Expected total expenses 2) Which category will likely increase 3) One money-saving tip. Keep it under 100 words. Respond in ${language} language.${partialNote} Data: ${JSON.stringify(data)}`,
  ].join('\n')
}

// Patterns that indicate a non-USD currency leaked into the response.
// Designed to be tight: only currency markers, NOT generic words.
// Cyrillic "рубл" matches рубль/рубли/рублей/рублях but does NOT match
// рекомендую, рублевый-something-else, etc., because the stem only
// appears in ruble-related vocabulary.
const NON_USD_PATTERNS = [
  /рубл/i,    // "рубль", "рубли", "рублей", "рублях"
  /руб\./i,   // "руб." abbreviation
  /\bRUB\b/i, // ISO code RUB
  /₽/,        // Ruble symbol
  /€/,        // Euro symbol
  /\bEUR\b/i, // ISO code EUR
  /£/,        // GBP symbol
  /\bGBP\b/i, // ISO code GBP
]

/**
 * Returns true iff `text` contains a recognizable non-USD currency marker.
 * Used as a server-side sanity check on Gemini responses for forecast.
 */
export function containsNonUsdCurrency(text) {
  if (typeof text !== 'string' || !text) return false
  return NON_USD_PATTERNS.some((p) => p.test(text))
}

// Exposed for snapshot tests so the constant cannot drift silently.
export const _CURRENCY_RULE = CURRENCY_RULE
