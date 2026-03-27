import { supabase } from './supabase'

export async function fetchFuels(userId) {
  const { data, error } = await supabase
    .from('fuel_entries')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addFuel(userId, entry) {
  // Get user_id from active Supabase session, not from props
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    const msg = 'No active session: ' + (authError ? authError.message : 'user is null')
    alert(msg)
    throw new Error(msg)
  }
  alert('user_id: ' + user.id)

  const row = {
    user_id: user.id,
    vehicle_id: entry.vehicle_id || null,
    station: entry.station || '',
    date: entry.date || new Date().toISOString().slice(0, 10),
    liters: parseFloat(entry.liters) || 0,
    cost: parseFloat(entry.amount) || 0,
    odometer: parseInt(entry.odometer, 10) || 0,
  }
  const { data, error } = await supabase
    .from('fuel_entries')
    .insert(row)
    .select()
  if (error) {
    console.error('addFuel error:', error)
    alert('Fuel save error: ' + error.message + ' (code: ' + error.code + ')')
    throw error
  }
  return data
}

export async function deleteFuel(id) {
  const { error } = await supabase
    .from('fuel_entries')
    .delete()
    .eq('id', id)
  if (error) throw error
}
