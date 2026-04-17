export const PART_PRESETS = [
  { category: 'oil', name_key: 'parts.engineOil', icon: '\uD83D\uDEE2\uFE0F', miles: 25000, months: 6 },
  { category: 'filter_fuel', name_key: 'parts.fuelFilter', icon: '\uD83D\uDCA8', miles: 25000, months: null },
  { category: 'filter_air', name_key: 'parts.airFilter', icon: '\uD83D\uDCA8', miles: 40000, months: null },
  { category: 'filter_cabin', name_key: 'parts.cabinFilter', icon: '\uD83D\uDCA8', miles: 30000, months: 12 },
  { category: 'filter_def', name_key: 'parts.defFilter', icon: '\uD83D\uDCA7', miles: 200000, months: null },
  { category: 'transmission_oil', name_key: 'parts.transmissionOil', icon: '\u2699\uFE0F', miles: 100000, months: null },
  { category: 'diff_oil', name_key: 'parts.diffOil', icon: '\u2699\uFE0F', miles: 250000, months: null },
  { category: 'brake_pads', name_key: 'parts.brakePads', icon: '\uD83D\uDD27', miles: 50000, months: null },
  { category: 'brake_disc', name_key: 'parts.brakeDisc', icon: '\uD83D\uDD27', miles: 100000, months: null },
  { category: 'clutch', name_key: 'parts.clutch', icon: '\u2699\uFE0F', miles: 500000, months: null },
  { category: 'belts', name_key: 'parts.belts', icon: '\uD83D\uDD17', miles: 100000, months: null },
  { category: 'battery', name_key: 'parts.battery', icon: '\uD83D\uDD0B', miles: null, months: 36 },
  { category: 'tire_steer', name_key: 'parts.tireSteer', icon: '\uD83D\uDEDE', miles: 100000, months: null },
  { category: 'tire_drive', name_key: 'parts.tireDrive', icon: '\uD83D\uDEDE', miles: 300000, months: null },
  { category: 'tire_trailer', name_key: 'parts.tireTrailer', icon: '\uD83D\uDEDE', miles: 150000, months: null },
  { category: 'other', name_key: 'parts.other', icon: '\uD83D\uDD29', miles: null, months: null }
]

export function getPresetByCategory(category) {
  return PART_PRESETS.find(p => p.category === category) || PART_PRESETS[PART_PRESETS.length - 1]
}
