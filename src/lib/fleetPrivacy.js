// Privacy boundary helpers for fleet (company) byt_expenses access.
//
// CLAUDE.md guarantee: fleet owners must NOT see their hired drivers'
// personal byt_expenses (food, shower, laundry, tobacco). This module
// encapsulates the queries that touch byt_expenses on behalf of a
// fleet owner, so the privacy contract lives in one named place and
// is unit-testable without spinning up Supabase.
//
// Defense in depth: the same restriction is also enforced at the
// database layer in supabase/migrations/20260426180619_fix_fleet_byt_expenses_privacy.sql.

// Cross-driver query: returns ONLY business-visibility byt_expenses for
// every user_id in `allUserIds`. Personal entries are filtered out at
// the query level by `.eq('visibility', 'business')`.
export async function fetchFleetBytExpenses(supabase, allUserIds, start, end) {
  if (!Array.isArray(allUserIds) || allUserIds.length === 0) return []
  try {
    const { data, error } = await supabase
      .from('byt_expenses')
      .select('*')
      .in('user_id', allUserIds)
      .eq('visibility', 'business')
      .gte('date', start)
      .lt('date', end)
      .order('date')
    if (error) {
      console.warn('fetchFleetBytExpenses error:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('fetchFleetBytExpenses rejected:', e)
    return []
  }
}

// Owner-self query: returns ALL of the fleet owner's own byt_expenses
// in the window (personal + business). Owners always see their own
// data. No visibility filter here — adding one would be wrong.
export async function fetchOwnBytExpensesForReport(supabase, userId, start, end) {
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('byt_expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', end)
      .order('date')
    if (error) {
      console.warn('fetchOwnBytExpensesForReport error:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('fetchOwnBytExpensesForReport rejected:', e)
    return []
  }
}
