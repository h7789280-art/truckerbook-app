/**
 * US State Income Tax Data — 2026 Tax Year
 *
 * Source: Tax Foundation (Rev. Proc. 2025-32, state tax statutes on Jan 1, 2026)
 * https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/
 *
 * Structure:
 *   type: 'none' | 'flat' | 'progressive'
 *   rate (flat): decimal tax rate
 *   brackets (progressive): { threshold, rate } array per filing status
 *   standardDeduction / personalExemption: by filing status
 *   startingPoint: 'federal_agi' | 'federal_taxable' — base for state taxable income
 *   bracketStart / bracketStartMFJ: income level where state tax starts (for states with zero-bracket)
 *
 * For states with complex phaseout / AMT / local piggyback rules, simplified to base brackets.
 * Marked with // TODO comments where simplification applies.
 */

export const STATE_TAX_2026 = {
  // === 9 STATES WITH NO INCOME TAX ===
  'AK': { name: 'Alaska', type: 'none' },
  'FL': { name: 'Florida', type: 'none' },
  'NV': { name: 'Nevada', type: 'none' },
  'NH': { name: 'New Hampshire', type: 'none' }, // repealed interest/dividends tax as of 2025
  'SD': { name: 'South Dakota', type: 'none' },
  'TN': { name: 'Tennessee', type: 'none' },
  'TX': { name: 'Texas', type: 'none' },
  'WA': { name: 'Washington', type: 'none' }, // only capital gains tax, not SE income
  'WY': { name: 'Wyoming', type: 'none' },

  // === FLAT-RATE STATES ===
  'AZ': {
    name: 'Arizona',
    type: 'flat',
    rate: 0.0250,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
  },
  'CO': {
    name: 'Colorado',
    type: 'flat',
    rate: 0.0440,
    startingPoint: 'federal_taxable',
    // CO starts from federal taxable income (after federal standard deduction)
  },
  'GA': {
    name: 'Georgia',
    type: 'flat',
    rate: 0.0519,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 12000, married_jointly: 24000, married_separately: 12000, head_of_household: 12000 },
  },
  'ID': {
    name: 'Idaho',
    type: 'flat',
    rate: 0.0530,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
    bracketStart: 4811,
    bracketStartMFJ: 9622,
  },
  'IL': {
    name: 'Illinois',
    type: 'flat',
    rate: 0.0495,
    startingPoint: 'federal_agi',
    personalExemption: { single: 2925, married_jointly: 5850, married_separately: 2925, head_of_household: 2925 },
  },
  'IN': {
    name: 'Indiana',
    type: 'flat',
    rate: 0.0295,
    startingPoint: 'federal_agi',
    personalExemption: { single: 1000, married_jointly: 2000, married_separately: 1000, head_of_household: 1000 },
  },
  'IA': {
    name: 'Iowa',
    type: 'flat',
    rate: 0.0380,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
  },
  'KY': {
    name: 'Kentucky',
    type: 'flat',
    rate: 0.0350,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 3360, married_jointly: 3360, married_separately: 3360, head_of_household: 3360 },
  },
  'LA': {
    name: 'Louisiana',
    type: 'flat',
    rate: 0.0300,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 12875, married_jointly: 25750, married_separately: 12875, head_of_household: 12875 },
  },
  'MI': {
    name: 'Michigan',
    type: 'flat',
    rate: 0.0425,
    startingPoint: 'federal_agi',
    personalExemption: { single: 5900, married_jointly: 11800, married_separately: 5900, head_of_household: 5900 },
  },
  'MS': {
    name: 'Mississippi',
    type: 'flat',
    rate: 0.0400,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 2300, married_jointly: 4600, married_separately: 2300, head_of_household: 2300 },
    personalExemption: { single: 6000, married_jointly: 12000, married_separately: 6000, head_of_household: 8000 },
    bracketStart: 10000, // MS taxes income only above first $10k (single/MFS). Simplified: same threshold both.
  },
  'NC': {
    name: 'North Carolina',
    type: 'flat',
    rate: 0.0399,
    startingPoint: 'federal_agi',
    standardDeduction: { single: 12750, married_jointly: 25500, married_separately: 12750, head_of_household: 19125 },
  },
  'PA': {
    name: 'Pennsylvania',
    type: 'flat',
    rate: 0.0307,
    startingPoint: 'federal_agi',
    // PA has no standard deduction or personal exemption
  },
  'UT': {
    name: 'Utah',
    type: 'flat',
    rate: 0.0450,
    startingPoint: 'federal_agi',
    // TODO: UT uses a taxpayer credit that phases out; simplified to flat rate on AGI
  },

  // === PROGRESSIVE STATES ===
  'AL': {
    name: 'Alabama',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 3000, married_jointly: 8500, married_separately: 4250, head_of_household: 5200 },
    personalExemption: { single: 1500, married_jointly: 3000, married_separately: 1500, head_of_household: 1500 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.02 },
        { threshold: 500, rate: 0.04 },
        { threshold: 3000, rate: 0.05 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.02 },
        { threshold: 1000, rate: 0.04 },
        { threshold: 6000, rate: 0.05 },
      ],
    },
  },
  'AR': {
    name: 'Arkansas',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 2410, married_jointly: 4820, married_separately: 2410, head_of_household: 2410 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.02 },
        { threshold: 4500, rate: 0.039 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.02 },
        { threshold: 4500, rate: 0.039 },
      ],
    },
    // TODO: AR has complex bracket schedules for low/mid/high incomes; simplified to top-bracket structure
  },
  'CA': {
    name: 'California',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 5540, married_jointly: 11080, married_separately: 5540, head_of_household: 11080 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.01 },
        { threshold: 11079, rate: 0.02 },
        { threshold: 26264, rate: 0.04 },
        { threshold: 41452, rate: 0.06 },
        { threshold: 57542, rate: 0.08 },
        { threshold: 72724, rate: 0.093 },
        { threshold: 371479, rate: 0.103 },
        { threshold: 445771, rate: 0.113 },
        { threshold: 742953, rate: 0.123 },
        { threshold: 1000000, rate: 0.133 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.01 },
        { threshold: 22158, rate: 0.02 },
        { threshold: 52528, rate: 0.04 },
        { threshold: 82904, rate: 0.06 },
        { threshold: 115084, rate: 0.08 },
        { threshold: 145448, rate: 0.093 },
        { threshold: 742958, rate: 0.103 },
        { threshold: 891542, rate: 0.113 },
        { threshold: 1000000, rate: 0.123 },
        { threshold: 1485906, rate: 0.133 },
      ],
    },
  },
  'CT': {
    name: 'Connecticut',
    type: 'progressive',
    startingPoint: 'federal_agi',
    // TODO: CT has complex phaseout rules for high earners — simplified to base brackets
    brackets: {
      single: [
        { threshold: 0, rate: 0.02 },
        { threshold: 10000, rate: 0.045 },
        { threshold: 50000, rate: 0.055 },
        { threshold: 100000, rate: 0.06 },
        { threshold: 200000, rate: 0.065 },
        { threshold: 250000, rate: 0.069 },
        { threshold: 500000, rate: 0.0699 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.02 },
        { threshold: 20000, rate: 0.045 },
        { threshold: 100000, rate: 0.055 },
        { threshold: 200000, rate: 0.06 },
        { threshold: 400000, rate: 0.065 },
        { threshold: 500000, rate: 0.069 },
        { threshold: 1000000, rate: 0.0699 },
      ],
    },
  },
  'DE': {
    name: 'Delaware',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 3250, married_jointly: 6500, married_separately: 3250, head_of_household: 3250 },
    brackets: {
      single: [
        { threshold: 2000, rate: 0.022 },
        { threshold: 5000, rate: 0.039 },
        { threshold: 10000, rate: 0.048 },
        { threshold: 20000, rate: 0.052 },
        { threshold: 25000, rate: 0.0555 },
        { threshold: 60000, rate: 0.066 },
      ],
      married_jointly: [
        { threshold: 2000, rate: 0.022 },
        { threshold: 5000, rate: 0.039 },
        { threshold: 10000, rate: 0.048 },
        { threshold: 20000, rate: 0.052 },
        { threshold: 25000, rate: 0.0555 },
        { threshold: 60000, rate: 0.066 },
      ],
    },
  },
  'HI': {
    name: 'Hawaii',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 4400, married_jointly: 8800, married_separately: 4400, head_of_household: 6424 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.014 },
        { threshold: 2400, rate: 0.032 },
        { threshold: 4800, rate: 0.055 },
        { threshold: 9600, rate: 0.064 },
        { threshold: 14400, rate: 0.068 },
        { threshold: 19200, rate: 0.072 },
        { threshold: 24000, rate: 0.076 },
        { threshold: 36000, rate: 0.079 },
        { threshold: 48000, rate: 0.0825 },
        { threshold: 150000, rate: 0.09 },
        { threshold: 175000, rate: 0.10 },
        { threshold: 200000, rate: 0.11 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.014 },
        { threshold: 4800, rate: 0.032 },
        { threshold: 9600, rate: 0.055 },
        { threshold: 19200, rate: 0.064 },
        { threshold: 28800, rate: 0.068 },
        { threshold: 38400, rate: 0.072 },
        { threshold: 48000, rate: 0.076 },
        { threshold: 72000, rate: 0.079 },
        { threshold: 96000, rate: 0.0825 },
        { threshold: 300000, rate: 0.09 },
        { threshold: 350000, rate: 0.10 },
        { threshold: 400000, rate: 0.11 },
      ],
    },
  },
  'KS': {
    name: 'Kansas',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 3605, married_jointly: 8240, married_separately: 4120, head_of_household: 6180 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.052 },
        { threshold: 23000, rate: 0.0558 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.052 },
        { threshold: 46000, rate: 0.0558 },
      ],
    },
  },
  'ME': {
    name: 'Maine',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.058 },
        { threshold: 27050, rate: 0.0675 },
        { threshold: 64050, rate: 0.0715 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.058 },
        { threshold: 54100, rate: 0.0675 },
        { threshold: 128100, rate: 0.0715 },
      ],
    },
  },
  'MD': {
    name: 'Maryland',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 2550, married_jointly: 5150, married_separately: 2550, head_of_household: 2550 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.02 },
        { threshold: 1000, rate: 0.03 },
        { threshold: 2000, rate: 0.04 },
        { threshold: 3000, rate: 0.0475 },
        { threshold: 100000, rate: 0.05 },
        { threshold: 125000, rate: 0.0525 },
        { threshold: 150000, rate: 0.055 },
        { threshold: 250000, rate: 0.0575 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.02 },
        { threshold: 1000, rate: 0.03 },
        { threshold: 2000, rate: 0.04 },
        { threshold: 3000, rate: 0.0475 },
        { threshold: 150000, rate: 0.05 },
        { threshold: 175000, rate: 0.0525 },
        { threshold: 225000, rate: 0.055 },
        { threshold: 300000, rate: 0.0575 },
      ],
    },
  },
  'MA': {
    name: 'Massachusetts',
    type: 'progressive',
    startingPoint: 'federal_agi',
    personalExemption: { single: 4400, married_jointly: 8800, married_separately: 4400, head_of_household: 6800 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.05 },
        { threshold: 1083150, rate: 0.09 }, // millionaire's surtax
      ],
      married_jointly: [
        { threshold: 0, rate: 0.05 },
        { threshold: 1083150, rate: 0.09 },
      ],
    },
  },
  'MN': {
    name: 'Minnesota',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
    // TODO: MN has itemized-deduction phaseout and alternative-minimum rules for high earners — simplified
    brackets: {
      single: [
        { threshold: 0, rate: 0.0535 },
        { threshold: 32570, rate: 0.068 },
        { threshold: 106990, rate: 0.0785 },
        { threshold: 198630, rate: 0.0985 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.0535 },
        { threshold: 47620, rate: 0.068 },
        { threshold: 189180, rate: 0.0785 },
        { threshold: 330410, rate: 0.0985 },
      ],
    },
  },
  'MO': {
    name: 'Missouri',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
    brackets: {
      single: [
        { threshold: 1273, rate: 0.02 },
        { threshold: 2546, rate: 0.025 },
        { threshold: 3819, rate: 0.03 },
        { threshold: 5092, rate: 0.035 },
        { threshold: 6365, rate: 0.04 },
        { threshold: 7638, rate: 0.045 },
        { threshold: 8911, rate: 0.047 },
      ],
      married_jointly: [
        { threshold: 1273, rate: 0.02 },
        { threshold: 2546, rate: 0.025 },
        { threshold: 3819, rate: 0.03 },
        { threshold: 5092, rate: 0.035 },
        { threshold: 6365, rate: 0.04 },
        { threshold: 7638, rate: 0.045 },
        { threshold: 8911, rate: 0.047 },
      ],
    },
  },
  'MT': {
    name: 'Montana',
    type: 'progressive',
    startingPoint: 'federal_taxable',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.047 },
        { threshold: 21100, rate: 0.059 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.047 },
        { threshold: 42200, rate: 0.059 },
      ],
    },
  },
  'NE': {
    name: 'Nebraska',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 8800, married_jointly: 17600, married_separately: 8800, head_of_household: 13000 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.0246 },
        { threshold: 4030, rate: 0.0351 },
        { threshold: 24120, rate: 0.0501 },
        { threshold: 38870, rate: 0.052 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.0246 },
        { threshold: 8060, rate: 0.0351 },
        { threshold: 48240, rate: 0.0501 },
        { threshold: 77740, rate: 0.052 },
      ],
    },
  },
  'NJ': {
    name: 'New Jersey',
    type: 'progressive',
    startingPoint: 'federal_agi',
    personalExemption: { single: 1000, married_jointly: 2000, married_separately: 1000, head_of_household: 1500 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.014 },
        { threshold: 20000, rate: 0.0175 },
        { threshold: 35000, rate: 0.035 },
        { threshold: 40000, rate: 0.0553 },
        { threshold: 75000, rate: 0.0637 },
        { threshold: 500000, rate: 0.0897 },
        { threshold: 1000000, rate: 0.1075 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.014 },
        { threshold: 20000, rate: 0.0175 },
        { threshold: 50000, rate: 0.0245 },
        { threshold: 70000, rate: 0.035 },
        { threshold: 80000, rate: 0.0553 },
        { threshold: 150000, rate: 0.0637 },
        { threshold: 500000, rate: 0.0897 },
        { threshold: 1000000, rate: 0.1075 },
      ],
    },
  },
  'NM': {
    name: 'New Mexico',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.015 },
        { threshold: 5500, rate: 0.032 },
        { threshold: 16500, rate: 0.043 },
        { threshold: 33500, rate: 0.047 },
        { threshold: 66500, rate: 0.049 },
        { threshold: 210000, rate: 0.059 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.015 },
        { threshold: 8000, rate: 0.032 },
        { threshold: 25000, rate: 0.043 },
        { threshold: 50000, rate: 0.047 },
        { threshold: 100000, rate: 0.049 },
        { threshold: 315000, rate: 0.059 },
      ],
    },
  },
  'NY': {
    name: 'New York',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 8000, married_jointly: 16050, married_separately: 8000, head_of_household: 11200 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.039 },
        { threshold: 8500, rate: 0.044 },
        { threshold: 11700, rate: 0.0515 },
        { threshold: 13900, rate: 0.054 },
        { threshold: 80650, rate: 0.059 },
        { threshold: 215400, rate: 0.0685 },
        { threshold: 1077550, rate: 0.0965 },
        { threshold: 5000000, rate: 0.103 },
        { threshold: 25000000, rate: 0.109 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.039 },
        { threshold: 17150, rate: 0.044 },
        { threshold: 23600, rate: 0.0515 },
        { threshold: 27900, rate: 0.054 },
        { threshold: 161550, rate: 0.059 },
        { threshold: 323200, rate: 0.0685 },
        { threshold: 2155350, rate: 0.0965 },
        { threshold: 5000000, rate: 0.103 },
        { threshold: 25000000, rate: 0.109 },
      ],
    },
  },
  'ND': {
    name: 'North Dakota',
    type: 'progressive',
    startingPoint: 'federal_taxable',
    // ND uses federal taxable income as starting point; low/flat-ish rates
    brackets: {
      single: [
        { threshold: 0, rate: 0.00 },
        { threshold: 48475, rate: 0.0195 },
        { threshold: 244825, rate: 0.025 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.00 },
        { threshold: 80950, rate: 0.0195 },
        { threshold: 298150, rate: 0.025 },
      ],
    },
  },
  'OH': {
    name: 'Ohio',
    type: 'progressive',
    startingPoint: 'federal_agi',
    // OH: first $26,050 exempt; then 2.75% up to $100k, 3.5% above
    brackets: {
      single: [
        { threshold: 0, rate: 0.00 },
        { threshold: 26050, rate: 0.0275 },
        { threshold: 100000, rate: 0.035 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.00 },
        { threshold: 26050, rate: 0.0275 },
        { threshold: 100000, rate: 0.035 },
      ],
    },
  },
  'OK': {
    name: 'Oklahoma',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 6350, married_jointly: 12700, married_separately: 6350, head_of_household: 9350 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.0025 },
        { threshold: 1000, rate: 0.0075 },
        { threshold: 2500, rate: 0.0175 },
        { threshold: 3750, rate: 0.0275 },
        { threshold: 4900, rate: 0.0375 },
        { threshold: 7200, rate: 0.0475 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.0025 },
        { threshold: 2000, rate: 0.0075 },
        { threshold: 5000, rate: 0.0175 },
        { threshold: 7500, rate: 0.0275 },
        { threshold: 9800, rate: 0.0375 },
        { threshold: 12200, rate: 0.0475 },
      ],
    },
  },
  'OR': {
    name: 'Oregon',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 2835, married_jointly: 5665, married_separately: 2835, head_of_household: 4565 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.0475 },
        { threshold: 4300, rate: 0.0675 },
        { threshold: 10750, rate: 0.0875 },
        { threshold: 125000, rate: 0.099 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.0475 },
        { threshold: 8600, rate: 0.0675 },
        { threshold: 21500, rate: 0.0875 },
        { threshold: 250000, rate: 0.099 },
      ],
    },
  },
  'RI': {
    name: 'Rhode Island',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 11250, married_jointly: 22500, married_separately: 11250, head_of_household: 16875 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.0375 },
        { threshold: 79900, rate: 0.0475 },
        { threshold: 181650, rate: 0.0599 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.0375 },
        { threshold: 79900, rate: 0.0475 },
        { threshold: 181650, rate: 0.0599 },
      ],
    },
  },
  'SC': {
    name: 'South Carolina',
    type: 'progressive',
    startingPoint: 'federal_taxable',
    // SC rates dropped to 3.0% low / 6.2% top in 2026
    brackets: {
      single: [
        { threshold: 0, rate: 0.00 },
        { threshold: 3460, rate: 0.03 },
        { threshold: 17330, rate: 0.062 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.00 },
        { threshold: 3460, rate: 0.03 },
        { threshold: 17330, rate: 0.062 },
      ],
    },
  },
  'VT': {
    name: 'Vermont',
    type: 'progressive',
    startingPoint: 'federal_taxable',
    brackets: {
      single: [
        { threshold: 0, rate: 0.0335 },
        { threshold: 47900, rate: 0.066 },
        { threshold: 116000, rate: 0.076 },
        { threshold: 242000, rate: 0.0875 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.0335 },
        { threshold: 80000, rate: 0.066 },
        { threshold: 193500, rate: 0.076 },
        { threshold: 294500, rate: 0.0875 },
      ],
    },
  },
  'VA': {
    name: 'Virginia',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 8500, married_jointly: 17000, married_separately: 8500, head_of_household: 8500 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.02 },
        { threshold: 3000, rate: 0.03 },
        { threshold: 5000, rate: 0.05 },
        { threshold: 17000, rate: 0.0575 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.02 },
        { threshold: 3000, rate: 0.03 },
        { threshold: 5000, rate: 0.05 },
        { threshold: 17000, rate: 0.0575 },
      ],
    },
  },
  'WV': {
    name: 'West Virginia',
    type: 'progressive',
    startingPoint: 'federal_agi',
    brackets: {
      single: [
        { threshold: 0, rate: 0.0222 },
        { threshold: 10000, rate: 0.0296 },
        { threshold: 25000, rate: 0.0333 },
        { threshold: 40000, rate: 0.0444 },
        { threshold: 60000, rate: 0.0482 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.0222 },
        { threshold: 10000, rate: 0.0296 },
        { threshold: 25000, rate: 0.0333 },
        { threshold: 40000, rate: 0.0444 },
        { threshold: 60000, rate: 0.0482 },
      ],
    },
  },
  'WI': {
    name: 'Wisconsin',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 13230, married_jointly: 24490, married_separately: 11630, head_of_household: 17090 },
    // TODO: WI standard deduction phases out at higher incomes — simplified to base amounts
    brackets: {
      single: [
        { threshold: 0, rate: 0.035 },
        { threshold: 14320, rate: 0.044 },
        { threshold: 28640, rate: 0.053 },
        { threshold: 315310, rate: 0.0765 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.035 },
        { threshold: 19090, rate: 0.044 },
        { threshold: 38190, rate: 0.053 },
        { threshold: 420420, rate: 0.0765 },
      ],
    },
  },
  'DC': {
    name: 'Washington DC',
    type: 'progressive',
    startingPoint: 'federal_agi',
    standardDeduction: { single: 16100, married_jointly: 32200, married_separately: 16100, head_of_household: 24150 },
    brackets: {
      single: [
        { threshold: 0, rate: 0.04 },
        { threshold: 10000, rate: 0.06 },
        { threshold: 40000, rate: 0.065 },
        { threshold: 60000, rate: 0.085 },
        { threshold: 250000, rate: 0.0925 },
        { threshold: 500000, rate: 0.0975 },
        { threshold: 1000000, rate: 0.1075 },
      ],
      married_jointly: [
        { threshold: 0, rate: 0.04 },
        { threshold: 10000, rate: 0.06 },
        { threshold: 40000, rate: 0.065 },
        { threshold: 60000, rate: 0.085 },
        { threshold: 250000, rate: 0.0925 },
        { threshold: 500000, rate: 0.0975 },
        { threshold: 1000000, rate: 0.1075 },
      ],
    },
  },
}

/**
 * Sorted list for UI dropdowns: [{ code, name }]
 */
export const STATE_OPTIONS = Object.entries(STATE_TAX_2026)
  .map(([code, data]) => ({ code, name: data.name }))
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * Get state name for display. Falls back to code if unknown.
 */
export function getStateName(code) {
  return STATE_TAX_2026[code]?.name || code
}
