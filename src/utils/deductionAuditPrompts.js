// AI Deduction Audit prompts for Gemini.
// Returns a system prompt + user payload that asks Gemini to identify
// personal-ledger entries that look like legitimate Schedule C deductions
// for a self-employed truck driver.
//
// Output contract is JSON-only so we can parse without prose cleanup.

export const SCHEDULE_C_CATEGORIES = [
  { key: 'car_truck',    line: 'Line 9',   label_en: 'Car and truck expenses', label_ru: 'Car and truck' },
  { key: 'insurance',    line: 'Line 15',  label_en: 'Insurance',              label_ru: 'Insurance' },
  { key: 'rent_equip',   line: 'Line 20a', label_en: 'Rent of equipment',      label_ru: 'Rent of equipment' },
  { key: 'repairs',      line: 'Line 21',  label_en: 'Repairs and maintenance', label_ru: 'Repairs' },
  { key: 'supplies',     line: 'Line 22',  label_en: 'Supplies',               label_ru: 'Supplies' },
  { key: 'travel',       line: 'Line 24a', label_en: 'Travel',                 label_ru: 'Travel' },
  { key: 'meals',        line: 'Line 24b', label_en: 'Deductible meals (50%)', label_ru: 'Meals (50%)' },
  { key: 'utilities',    line: 'Line 25',  label_en: 'Utilities',              label_ru: 'Utilities' },
  { key: 'other',        line: 'Line 27a', label_en: 'Other expenses',         label_ru: 'Other' },
]

// Map audit categories to vehicle_expenses.category enum values used elsewhere.
// vehicle_expenses.category is free text in the DB, but we stick to the set
// already used by the Byt / Vehicle tabs so reports line up.
export const SCHEDULE_C_CATEGORY_TO_EXPENSE = {
  car_truck:  'fuel',
  insurance:  'other',
  rent_equip: 'other',
  repairs:    'parts',
  supplies:   'supplies',
  travel:     'hotel',
  meals:      'food',
  utilities:  'other',
  other:      'other',
}

const SYSTEM_PROMPT = `You are a US tax deduction expert analyzing personal
expenses for a self-employed truck driver (owner-operator). Your job is to
identify expenses that could legitimately be business deductions on Schedule C.

RULES:
1. Only flag expenses with HIGH confidence (>0.7) of being business-related.
2. Be conservative — false positives damage IRS credibility.
3. NEVER flag obvious personal: groceries, restaurants (unless per-diem
   context), entertainment, gifts, clothing (unless work-specific
   uniforms/boots).
4. DO flag: tools, truck parts at retail stores, work boots, DOT medical
   exams, CDL renewal fees, work phone bills (typically 50-80% business),
   GPS subscriptions, log book apps, trade publications, business software.
5. Use a neutral tone in reasoning — never accusatory or judgmental.
6. If the description is vague ("shopping", "store"), do NOT flag — we
   require clear business context.

CATEGORIES (Schedule C lines):
- Line 9  (car_truck): Car and truck expenses (fuel, DEF, oil changes).
- Line 15 (insurance): Insurance (truck insurance portion).
- Line 20a (rent_equip): Rent of vehicles/equipment.
- Line 21 (repairs): Repairs and maintenance (truck repairs, parts).
- Line 22 (supplies): Supplies (tools, cleaning supplies, small items).
- Line 24a (travel): Travel (hotels on the road — NOT per diem).
- Line 24b (meals): Deductible meals (50% — only if documented business).
- Line 25 (utilities): Utilities (phone bill business %).
- Line 27a (other): Other (DOT medical, CDL fees, licenses, trade
  publications, work-specific clothing).

OUTPUT FORMAT (JSON only, no prose, no code fences):
{
  "suggestions": [
    {
      "source_id": "<uuid of the expense>",
      "confidence": 0.85,
      "suggested_category": "supplies",
      "schedule_c_line": "Line 22",
      "reasoning": "Home Depot purchase of $340 likely includes tools or
        parts used for truck maintenance based on vendor type and amount.",
      "estimated_business_percentage": 100
    }
  ]
}

If no qualifying suggestions are found, return {"suggestions": []}.
Valid "suggested_category" values: car_truck, insurance, rent_equip,
repairs, supplies, travel, meals, utilities, other.`

// Build the user-turn content: a JSON array of expenses. Using JSON (rather
// than a CSV table) makes it straightforward for Gemini to echo source_id
// back verbatim.
export function buildAuditPrompt(expenses, profile) {
  const safeProfile = {
    role: profile?.role || 'owner_operator',
    state: profile?.state_of_residence || profile?.country || 'US',
    employment_type: profile?.employment_type || null,
  }

  const payload = (expenses || []).map(e => ({
    id: e.id,
    description: e.description || e.name || e.merchant || '',
    amount: Number(e.amount) || 0,
    date: e.date || '',
    category: e.category || null,
  }))

  const userText = [
    'Driver profile:',
    JSON.stringify(safeProfile),
    '',
    'Personal expenses to analyze (flag only confident business deductions):',
    JSON.stringify(payload),
  ].join('\n')

  return {
    systemPrompt: SYSTEM_PROMPT,
    userText,
  }
}

// Accepts the raw text body from Gemini (may have leading/trailing
// whitespace or stray markdown fences) and returns { suggestions: [] }.
// Safe against malformed output — returns empty on any parse error.
export function parseAuditResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return { suggestions: [] }
  let text = rawText.trim()
  // Strip common markdown code fences Gemini occasionally emits despite
  // the JSON-only instruction.
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  try {
    const parsed = JSON.parse(text)
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : []
    return {
      suggestions: suggestions.filter(s =>
        s && s.source_id && s.suggested_category && typeof s.confidence === 'number'
      ),
    }
  } catch {
    return { suggestions: [] }
  }
}

// Helper: lookup Schedule C line label by category key.
export function scheduleCLineFor(categoryKey) {
  const found = SCHEDULE_C_CATEGORIES.find(c => c.key === categoryKey)
  return found ? found.line : 'Line 27a'
}
