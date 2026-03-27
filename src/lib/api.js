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
  const { data, error } = await supabase
    .from('fuel_entries')
    .insert({
      user_id: userId,
      station: entry.station || '',
      date: entry.date || new Date().toISOString().slice(0, 10),
      liters: parseFloat(entry.liters) || 0,
      total_cost: parseFloat(entry.amount) || 0,
      odometer: parseInt(entry.odometer, 10) || 0,
    })
    .select()
  if (error) throw error
  return data
}

export async function deleteFuel(id) {
  const { error } = await supabase
    .from('fuel_entries')
    .delete()
    .eq('id', id)
  if (error) throw error
}
