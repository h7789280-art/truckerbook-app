export function calculatePartWear(part, currentOdometer) {
  const milesUsed = (currentOdometer || 0) - (part.installed_odometer || 0)
  const daysUsed = (Date.now() - new Date(part.installed_date).getTime()) / (1000 * 60 * 60 * 24)
  const monthsUsed = daysUsed / 30.44

  const milesPercent = part.resource_miles ? (milesUsed / part.resource_miles) * 100 : 0
  const monthsPercent = part.resource_months ? (monthsUsed / part.resource_months) * 100 : 0

  const percent = Math.max(milesPercent, monthsPercent)
  const whichIsLimiting = milesPercent >= monthsPercent ? 'miles' : 'months'

  return {
    percent,
    whichIsLimiting,
    milesRemaining: part.resource_miles ? part.resource_miles - milesUsed : null,
    monthsRemaining: part.resource_months ? part.resource_months - monthsUsed : null,
    milesUsed,
    monthsUsed,
  }
}
