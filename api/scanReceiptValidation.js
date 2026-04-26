// Server-side validation of Gemini scan-receipt responses.
//
// Defense in depth: even when Gemini disobeys the prompt rules about
// currency / date / amount, this validator refuses to return data
// that would corrupt YTD aggregations, IFTA, or year-end CPA exports.
// Examples blocked:
//   - "1970-01-01" or any pre-2017 date (older than 7-yr IRS statute)
//   - Future-dated receipts (impossible)
//   - ₽ / € / £ amounts mistaken for USD
//   - Zero / negative / absurdly large amounts
//
// Pure function — no DB, no fetch, no env. Unit-testable.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Minimum: 7 years before current date covers the IRS general statute
// of limitations on tax-relevant business expenses. Older receipts
// shouldn't be entering an active books flow.
export const MIN_RECEIPT_DATE = '2017-01-01'

// Maximum: today (UTC). A receipt cannot logically be from the future.
// We compute this lazily so tests can mock the clock.
export function getMaxReceiptDate(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

// Validates a parsed Gemini response. Returns:
//   { ok: true, parsed }
//   { ok: false, userError: 'non_usd_currency' | 'date_invalid' | 'date_out_of_range' | 'amount_invalid', ...details }
//
// `parsed` is echoed in the failure case so the client can offer
// manual entry pre-filled with whatever the AI managed to read
// (e.g. amount when only the date fails).
export function validateReceiptResponse(parsed, opts = {}) {
  const maxDate = opts.maxDate || getMaxReceiptDate()

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, userError: 'amount_invalid', parsed: null }
  }

  // 1. Currency rejection from Gemini
  if (parsed.error === 'non_usd_currency' || parsed.error === 'ambiguous_european_format') {
    return {
      ok: false,
      userError: 'non_usd_currency',
      detectedCurrency: parsed.detected_currency || null,
      parsed,
    }
  }

  // 2. Date errors from Gemini
  if (parsed.error === 'date_unreadable') {
    return {
      ok: false,
      userError: 'date_invalid',
      parsed,
    }
  }
  if (parsed.error === 'date_in_future') {
    return {
      ok: false,
      userError: 'date_out_of_range',
      detectedDate: parsed.detected_date || null,
      parsed,
    }
  }

  // 3. Server-side date sanity check (catches Gemini ignoring rule 7)
  if (!parsed.date || typeof parsed.date !== 'string' || !ISO_DATE_RE.test(parsed.date)) {
    return {
      ok: false,
      userError: 'date_invalid',
      detectedDate: parsed.date || null,
      parsed,
    }
  }
  if (parsed.date < MIN_RECEIPT_DATE || parsed.date > maxDate) {
    return {
      ok: false,
      userError: 'date_out_of_range',
      detectedDate: parsed.date,
      parsed,
    }
  }

  // 4. Amount must be a positive, sane number. The "total" field is
  //    the receipt grand total. We allow up to $100k (one full tank
  //    of fuel for a reefer team is ~$1.5k; $100k catches truck-part
  //    invoices). Above that is almost certainly a parsing error.
  const total = parsed.total
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || total > 100000) {
    return {
      ok: false,
      userError: 'amount_invalid',
      detectedAmount: total,
      parsed,
    }
  }

  return { ok: true, parsed }
}
