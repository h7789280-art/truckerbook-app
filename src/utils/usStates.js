/**
 * US States (50 + DC) + Canadian Provinces (10 + 3 territories)
 * IFTA jurisdiction mappings: full name → 2-letter code
 */

export const STATE_NAME_TO_CODE = {
  // US States
  'Alabama': 'AL',
  'Alaska': 'AK',
  'Arizona': 'AZ',
  'Arkansas': 'AR',
  'California': 'CA',
  'Colorado': 'CO',
  'Connecticut': 'CT',
  'Delaware': 'DE',
  'Florida': 'FL',
  'Georgia': 'GA',
  'Hawaii': 'HI',
  'Idaho': 'ID',
  'Illinois': 'IL',
  'Indiana': 'IN',
  'Iowa': 'IA',
  'Kansas': 'KS',
  'Kentucky': 'KY',
  'Louisiana': 'LA',
  'Maine': 'ME',
  'Maryland': 'MD',
  'Massachusetts': 'MA',
  'Michigan': 'MI',
  'Minnesota': 'MN',
  'Mississippi': 'MS',
  'Missouri': 'MO',
  'Montana': 'MT',
  'Nebraska': 'NE',
  'Nevada': 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  'Ohio': 'OH',
  'Oklahoma': 'OK',
  'Oregon': 'OR',
  'Pennsylvania': 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  'Tennessee': 'TN',
  'Texas': 'TX',
  'Utah': 'UT',
  'Vermont': 'VT',
  'Virginia': 'VA',
  'Washington': 'WA',
  'West Virginia': 'WV',
  'Wisconsin': 'WI',
  'Wyoming': 'WY',
  'District of Columbia': 'DC',

  // Canadian Provinces
  'Alberta': 'AB',
  'British Columbia': 'BC',
  'Manitoba': 'MB',
  'New Brunswick': 'NB',
  'Newfoundland and Labrador': 'NL',
  'Nova Scotia': 'NS',
  'Ontario': 'ON',
  'Prince Edward Island': 'PE',
  'Quebec': 'QC',
  'Saskatchewan': 'SK',

  // Canadian Territories
  'Northwest Territories': 'NT',
  'Nunavut': 'NU',
  'Yukon': 'YT',
}

/** Reverse mapping: 2-letter code → full name */
export const STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
)

/**
 * Array of { code, name } for UI dropdowns, sorted by code.
 * Includes US states, DC, and Canadian provinces/territories.
 */
export const US_STATES = Object.entries(STATE_NAME_TO_CODE)
  .map(([name, code]) => ({ code, name }))
  .sort((a, b) => a.code.localeCompare(b.code))

/**
 * Convert a state full name to 2-letter code.
 * Handles case-insensitive matching and already-coded values.
 * @param {string} state - Full state name or already a code
 * @returns {string|null} 2-letter code or null if not found
 */
export function stateToCode(state) {
  if (!state) return null
  const trimmed = state.trim()

  // Already a 2-letter code?
  if (trimmed.length === 2 && STATE_CODE_TO_NAME[trimmed.toUpperCase()]) {
    return trimmed.toUpperCase()
  }

  // Direct lookup
  if (STATE_NAME_TO_CODE[trimmed]) return STATE_NAME_TO_CODE[trimmed]

  // Case-insensitive lookup
  const lower = trimmed.toLowerCase()
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (name.toLowerCase() === lower) return code
  }

  return null
}
