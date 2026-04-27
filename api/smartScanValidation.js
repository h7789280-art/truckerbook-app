// Server-side validation of /api/smart-scan responses (receipt | trip | repair).
//
// Defense in depth: even when Gemini disobeys the prompt rules about
// currency / date / amount / mileage / rate, this validator refuses to
// return data that would corrupt YTD aggregations, IFTA, or year-end
// CPA exports. Examples blocked:
//   - "1970-01-01" or any pre-2017 date (older than 7-yr IRS statute)
//   - Future-dated receipts / repair invoices (impossible)
//   - ₽ / € / £ amounts mistaken for USD
//   - Zero / negative / absurdly large amounts
//   - Trip miles outside (0, 5000] (USA cross-country max ~3000 mi)
//   - Rate per mile outside (0, 20] (typical: $1.5–4/mi)
//   - Repair total > $100k (engine swap caps ~$30k)
//
// Pure function — no DB, no fetch, no env. Unit-testable.
//
// Each validator returns either:
//   { ok: true,  parsed }                        // pass-through
//   { ok: false, userError, echo, ...details }   // 422 response
//
// `echo` is the original parsed response so the client can prefill the
// Confirm screen with the readable parts and let the user fix the bad field.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── shared bounds ────────────────────────────────────────────────────────
// Minimum: 7 years before current date covers the IRS general statute
// of limitations on tax-relevant business expenses.
export const MIN_RECEIPT_DATE = '2017-01-01'
// Trips can be backdated less aggressively (newer LDAP) but pickup/delivery
// can be in the near future (rate confirmations issued before pickup).
export const MIN_TRIP_DATE = '2020-01-01'
// Repair invoices: same statute as receipts.
export const MIN_REPAIR_DATE = '2017-01-01'

export function getMaxReceiptDate(now = new Date()) {
  return now.toISOString().slice(0, 10)
}
// Trips may carry future pickup/delivery dates up to 90 days out.
export function getMaxTripDate(now = new Date()) {
  const d = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}
// Repair invoices cannot logically be from the future.
export function getMaxRepairDate(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function isValidDateString(s) {
  return typeof s === 'string' && ISO_DATE_RE.test(s)
}

// ─── receipt ──────────────────────────────────────────────────────────────
// Validates a parsed Gemini receipt response. Returns:
//   { ok: true, parsed }
//   { ok: false, userError: 'non_usd_currency' | 'date_invalid' | 'date_out_of_range' | 'amount_invalid', echo, ...details }
export function validateReceiptResponse(parsed, opts = {}) {
  const maxDate = opts.maxDate || getMaxReceiptDate()

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, userError: 'amount_invalid', echo: null, parsed: null }
  }

  // 1. Currency rejection from Gemini
  if (parsed.error === 'non_usd_currency' || parsed.error === 'ambiguous_european_format') {
    return {
      ok: false,
      userError: 'non_usd_currency',
      detectedCurrency: parsed.detected_currency || null,
      echo: parsed,
      parsed,
    }
  }

  // 2. Date errors from Gemini
  if (parsed.error === 'date_unreadable') {
    return { ok: false, userError: 'date_invalid', echo: parsed, parsed }
  }
  if (parsed.error === 'date_in_future') {
    return {
      ok: false,
      userError: 'date_out_of_range',
      detectedDate: parsed.detected_date || null,
      echo: parsed,
      parsed,
    }
  }

  // 3. Server-side date sanity check
  if (!isValidDateString(parsed.date)) {
    return {
      ok: false,
      userError: 'date_invalid',
      detectedDate: parsed.date || null,
      echo: parsed,
      parsed,
    }
  }
  if (parsed.date < MIN_RECEIPT_DATE || parsed.date > maxDate) {
    return {
      ok: false,
      userError: 'date_out_of_range',
      detectedDate: parsed.date,
      echo: parsed,
      parsed,
    }
  }

  // 4. Amount must be positive, finite, ≤ $100k
  const total = parsed.total
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || total > 100000) {
    return {
      ok: false,
      userError: 'amount_invalid',
      detectedAmount: total,
      echo: parsed,
      parsed,
    }
  }

  return { ok: true, parsed }
}

// ─── trip ────────────────────────────────────────────────────────────────
// Validates a parsed Gemini trip response. Returns:
//   { ok: true, parsed }
//   { ok: false, userError: 'miles_invalid' | 'rate_invalid' | 'date_invalid' | 'state_invalid', echo, ...details }
export function validateTripResponse(parsed, opts = {}) {
  const maxDate = opts.maxDate || getMaxTripDate()

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, userError: 'miles_invalid', echo: null, parsed: null }
  }

  // 1. Miles: must be a positive number ≤ 5000 (USA cross-country max ~3000)
  const miles = parsed.miles
  if (typeof miles !== 'number' || !Number.isFinite(miles) || miles <= 0 || miles > 5000) {
    return {
      ok: false,
      userError: 'miles_invalid',
      detectedMiles: miles,
      echo: parsed,
      parsed,
    }
  }

  // 2. Deadhead miles: optional, ≥ 0, ≤ miles*2 (sanity)
  if (parsed.deadhead_miles != null) {
    const dh = parsed.deadhead_miles
    if (typeof dh !== 'number' || !Number.isFinite(dh) || dh < 0 || dh > miles * 2) {
      return {
        ok: false,
        userError: 'miles_invalid',
        detectedMiles: dh,
        echo: parsed,
        parsed,
      }
    }
  }

  // 3. Rate: must be positive, ≤ $50k (a single $50k load is already extreme)
  const rate = parsed.rate
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 50000) {
    return {
      ok: false,
      userError: 'rate_invalid',
      detectedRate: rate,
      echo: parsed,
      parsed,
    }
  }

  // 4. rate_per_mile: optional, must be ∈ (0, 20] when present
  if (parsed.rate_per_mile != null) {
    const rpm = parsed.rate_per_mile
    if (typeof rpm !== 'number' || !Number.isFinite(rpm) || rpm <= 0 || rpm > 20) {
      return {
        ok: false,
        userError: 'rate_invalid',
        detectedRate: rpm,
        echo: parsed,
        parsed,
      }
    }
  }

  // 5. pickup_date / delivery_date: optional, but if present must be in
  //    [MIN_TRIP_DATE, today + 90d] window.
  for (const key of ['pickup_date', 'delivery_date']) {
    const v = parsed[key]
    if (v == null) continue
    if (!isValidDateString(v)) {
      return {
        ok: false,
        userError: 'date_invalid',
        detectedDate: v,
        echo: parsed,
        parsed,
      }
    }
    if (v < MIN_TRIP_DATE || v > maxDate) {
      return {
        ok: false,
        userError: 'date_invalid',
        detectedDate: v,
        echo: parsed,
        parsed,
      }
    }
  }

  // 6. State codes: 2 letters or null
  for (const key of ['origin_state', 'destination_state']) {
    const v = parsed[key]
    if (v == null) continue
    if (typeof v !== 'string' || !/^[A-Za-z]{2}$/.test(v)) {
      return {
        ok: false,
        userError: 'state_invalid',
        detectedState: v,
        echo: parsed,
        parsed,
      }
    }
  }

  return { ok: true, parsed }
}

// ─── repair ──────────────────────────────────────────────────────────────
// Validates a parsed Gemini repair-invoice response. Returns:
//   { ok: true, parsed }
//   { ok: false, userError: 'amount_invalid' | 'date_invalid' | 'date_out_of_range' | 'mileage_invalid' | 'shop_name_invalid', echo, ...details }
export function validateRepairResponse(parsed, opts = {}) {
  const maxDate = opts.maxDate || getMaxRepairDate()

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, userError: 'amount_invalid', echo: null, parsed: null }
  }

  // 1. Total: positive, ≤ $100k
  const total = parsed.total
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || total > 100000) {
    return {
      ok: false,
      userError: 'amount_invalid',
      detectedAmount: total,
      echo: parsed,
      parsed,
    }
  }

  // 2. Date: required, in [MIN_REPAIR_DATE, today]
  if (!isValidDateString(parsed.date)) {
    return {
      ok: false,
      userError: 'date_invalid',
      detectedDate: parsed.date || null,
      echo: parsed,
      parsed,
    }
  }
  if (parsed.date < MIN_REPAIR_DATE || parsed.date > maxDate) {
    return {
      ok: false,
      userError: 'date_out_of_range',
      detectedDate: parsed.date,
      echo: parsed,
      parsed,
    }
  }

  // 3. Mileage: optional, integer ∈ [0, 5_000_000]
  if (parsed.mileage != null) {
    const m = parsed.mileage
    if (typeof m !== 'number' || !Number.isFinite(m) || !Number.isInteger(m) || m < 0 || m > 5000000) {
      return {
        ok: false,
        userError: 'mileage_invalid',
        detectedMileage: m,
        echo: parsed,
        parsed,
      }
    }
  }

  // 4. shop_name: optional, ≤ 200 chars
  if (parsed.shop_name != null) {
    const s = parsed.shop_name
    if (typeof s !== 'string' || s.length > 200) {
      return {
        ok: false,
        userError: 'shop_name_invalid',
        echo: parsed,
        parsed,
      }
    }
  }

  return { ok: true, parsed }
}
