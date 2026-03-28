import { supabase } from './supabase'

// --- Fuel ---

export async function fetchFuels(userId) {
  const { data, error } = await supabase
    .from('fuel_entries')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addFuel(_userId, entry) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    const msg = 'No active session: ' + (authError ? authError.message : 'user is null')
    console.error(msg)
    throw new Error(msg)
  }

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

// --- Trips ---

export async function fetchTrips(userId) {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addTrip(entry) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('No active session')
    throw new Error('No active session')
  }

  const row = {
    user_id: user.id,
    vehicle_id: entry.vehicle_id || null,
    origin: entry.from || '',
    destination: entry.to || '',
    distance_km: parseFloat(entry.distance) || 0,
    income: parseFloat(entry.rate) || 0,
  }
  const { data, error } = await supabase
    .from('trips')
    .insert(row)
    .select()
  if (error) {
    console.error('addTrip error:', error)
    throw error
  }
  return data
}

export async function deleteTrip(id) {
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// --- Byt expenses ---

export async function fetchBytExpenses(userId) {
  const { data, error } = await supabase
    .from('byt_expenses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addBytExpense(entry) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('No active session')
    throw new Error('No active session')
  }

  const row = {
    user_id: user.id,
    category: entry.category || 'other',
    name: entry.name || '',
    date: entry.date || new Date().toISOString().slice(0, 10),
    amount: parseFloat(entry.amount) || 0,
  }
  const { data, error } = await supabase
    .from('byt_expenses')
    .insert(row)
    .select()
  if (error) {
    console.error('addBytExpense error:', error)
    throw error
  }
  return data
}

export async function deleteBytExpense(id) {
  const { error } = await supabase
    .from('byt_expenses')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// --- Vehicles ---

export async function fetchVehicles(userId) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// --- Service records ---

export async function fetchServiceRecords(userId) {
  const { data, error } = await supabase
    .from('service_records')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addServiceRecord(entry) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('No active session')
    throw new Error('No active session')
  }

  const row = {
    user_id: user.id,
    vehicle_id: entry.vehicle_id || null,
    description: entry.name || '',
    service_station: entry.sto || '',
    cost: parseFloat(entry.amount) || 0,
    odometer: parseInt(entry.odometer, 10) || 0,
    date: entry.date || new Date().toISOString().slice(0, 10),
  }
  const { data, error } = await supabase
    .from('service_records')
    .insert(row)
    .select()
  if (error) {
    console.error('addServiceRecord error:', error)
    throw error
  }
  return data
}

// --- Insurance ---

export async function fetchInsurance(userId) {
  const { data, error } = await supabase
    .from('insurance')
    .select('*')
    .eq('user_id', userId)
    .order('date_to', { ascending: true })
  if (error) throw error
  return data || []
}

// --- Shifts ---

export async function getActiveShift(userId) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .single()
  if (error && error.code === 'PGRST116') return null
  if (error) throw error
  return data
}

export async function startShift(userId, vehicleId, odometerStart, driverName) {
  const row = {
    user_id: userId,
    vehicle_id: vehicleId || null,
    odometer_start: parseInt(odometerStart, 10) || 0,
    driver_name: driverName || '',
    started_at: new Date().toISOString(),
    status: 'active',
  }
  const { data, error } = await supabase
    .from('shifts')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function endShift(shiftId, odometerEnd) {
  const end = parseInt(odometerEnd, 10) || 0
  const { data, error } = await supabase
    .from('shifts')
    .update({
      ended_at: new Date().toISOString(),
      odometer_end: end,
      status: 'completed',
    })
    .eq('id', shiftId)
    .select()
  if (error) throw error
  const shift = data?.[0]
  if (shift && shift.odometer_start) {
    const kmDriven = end - shift.odometer_start
    await supabase
      .from('shifts')
      .update({ km_driven: kmDriven > 0 ? kmDriven : 0 })
      .eq('id', shiftId)
  }
  return shift
}

export async function getCompletedShifts(userId, limit = 10) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getShiftStats(userId, period) {
  const now = new Date()
  let since
  if (period === 'month') {
    since = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  }
  since.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('started_at', since.toISOString())
    .order('started_at', { ascending: false })
  if (error) throw error

  const shifts = data || []
  let totalKm = 0
  let totalHours = 0
  shifts.forEach(s => {
    totalKm += s.km_driven || 0
    if (s.started_at && s.ended_at) {
      totalHours += (new Date(s.ended_at) - new Date(s.started_at)) / 3600000
    }
  })

  return { count: shifts.length, totalKm, totalHours }
}

// --- Route notes ---

export async function fetchRouteNotes(userId) {
  const { data, error } = await supabase
    .from('route_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
