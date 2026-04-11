// Filing Deadlines Generator
// Generates standard US tax and regulatory deadlines for truckers

/**
 * Generate annual deadlines for a given year
 * @param {number} year
 * @returns {Array<{deadline_type: string, title: string, due_date: string, category: string}>}
 */
export function generateAnnualDeadlines(year) {
  return [
    // IFTA Quarterly
    { deadline_type: `IFTA-Q1-${year}`, title: `IFTA Q1 ${year}`, due_date: `${year}-04-30`, category: 'ifta' },
    { deadline_type: `IFTA-Q2-${year}`, title: `IFTA Q2 ${year}`, due_date: `${year}-07-31`, category: 'ifta' },
    { deadline_type: `IFTA-Q3-${year}`, title: `IFTA Q3 ${year}`, due_date: `${year}-10-31`, category: 'ifta' },
    { deadline_type: `IFTA-Q4-${year}`, title: `IFTA Q4 ${year}`, due_date: `${year + 1}-01-31`, category: 'ifta' },

    // Estimated Tax (1040-ES)
    { deadline_type: `1040ES-Q1-${year}`, title: `Estimated Tax Q1 ${year}`, due_date: `${year}-04-15`, category: 'tax' },
    { deadline_type: `1040ES-Q2-${year}`, title: `Estimated Tax Q2 ${year}`, due_date: `${year}-06-15`, category: 'tax' },
    { deadline_type: `1040ES-Q3-${year}`, title: `Estimated Tax Q3 ${year}`, due_date: `${year}-09-15`, category: 'tax' },
    { deadline_type: `1040ES-Q4-${year}`, title: `Estimated Tax Q4 ${year}`, due_date: `${year + 1}-01-15`, category: 'tax' },

    // Annual
    { deadline_type: `Form2290-${year}`, title: 'Form 2290 (HVUT)', due_date: `${year}-08-31`, category: 'annual' },
    { deadline_type: `LLC-Annual-${year}`, title: 'LLC Annual Report', due_date: `${year}-05-01`, category: 'annual' },
    { deadline_type: `1099NEC-${year}`, title: '1099-NEC Filing', due_date: `${year}-01-31`, category: 'annual' },
  ]
}

/**
 * Sync deadlines to Supabase — inserts missing ones, skips existing
 * @param {{ supabase: object, userId: string, year: number }} params
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function syncDeadlines({ supabase, userId, year }) {
  const deadlines = generateAnnualDeadlines(year)

  // Fetch existing for this user+year range
  const minDate = `${year}-01-01`
  const maxDate = `${year + 1}-12-31`

  const { data: existing, error } = await supabase
    .from('filing_deadlines')
    .select('deadline_type, due_date')
    .eq('user_id', userId)
    .gte('due_date', minDate)
    .lte('due_date', maxDate)

  if (error) throw error

  const existingSet = new Set(
    (existing || []).map(e => `${e.deadline_type}|${e.due_date}`)
  )

  const toInsert = deadlines
    .filter(d => !existingSet.has(`${d.deadline_type}|${d.due_date}`))
    .map(d => ({
      user_id: userId,
      deadline_type: d.deadline_type,
      title: d.title,
      due_date: d.due_date,
      status: 'pending',
      notes: null,
    }))

  let inserted = 0
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('filing_deadlines')
      .insert(toInsert)
    if (insertError) throw insertError
    inserted = toInsert.length
  }

  return { inserted, skipped: deadlines.length - inserted }
}
