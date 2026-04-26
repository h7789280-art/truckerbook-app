// Date helpers that respect the user's local timezone.
//
// IMPORTANT: Do NOT use `new Date().toISOString().slice(0, 10)` for default
// date values in user-facing forms or "today" calculations. `toISOString()`
// always returns UTC, which is a different calendar day from the user's
// local one whenever their timezone offset crosses midnight UTC. For US
// drivers in UTC-5 (Eastern) through UTC-10 (Hawaii), this means the form
// default can be wrong by one day during evening hours.

/**
 * Returns a date as YYYY-MM-DD in the user's local timezone.
 *
 * @param {Date} [date=new Date()] - Optional date object (defaults to now)
 * @returns {string} Date in YYYY-MM-DD format, local timezone
 */
export function getLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
