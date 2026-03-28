import { supabase } from './supabase'
import { addToSyncQueue } from './offlineDb'

async function offlineInsert(table, row) {
  await addToSyncQueue(table, 'insert', row)
  return [{ ...row, id: 'offline-' + Date.now(), _offline: true }]
}

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
  if (!navigator.onLine) return offlineInsert('fuel_entries', row)
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
  if (!navigator.onLine) return offlineInsert('trips', row)
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
    .eq('visibility', 'personal')
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
  if (!navigator.onLine) return offlineInsert('byt_expenses', row)
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
  if (!navigator.onLine) return offlineInsert('service_records', row)
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
  if (!navigator.onLine) {
    const result = await offlineInsert('shifts', row)
    return result[0]
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

export async function getTodayShiftSummary(userId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('started_at', today.toISOString())
  if (error) throw error
  const shifts = data || []
  if (shifts.length === 0) return null
  let totalKm = 0
  let totalMinutes = 0
  shifts.forEach(s => {
    totalKm += s.km_driven || 0
    if (s.started_at && s.ended_at) {
      totalMinutes += Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000)
    }
  })
  return { count: shifts.length, totalKm, totalMinutes }
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

// --- Driving sessions ---

export async function startDrivingSession(userId, vehicleId) {
  const row = {
    user_id: userId,
    vehicle_id: vehicleId || null,
    started_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('driving_sessions')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function endDrivingSession(sessionId) {
  const now = new Date()
  const { data: existing, error: fetchErr } = await supabase
    .from('driving_sessions')
    .select('started_at')
    .eq('id', sessionId)
    .single()
  if (fetchErr) throw fetchErr

  const startedAt = new Date(existing.started_at)
  const durationMinutes = Math.round((now - startedAt) / 60000)

  const { data, error } = await supabase
    .from('driving_sessions')
    .update({
      ended_at: now.toISOString(),
      duration_minutes: durationMinutes,
    })
    .eq('id', sessionId)
    .select()
  if (error) throw error
  return data?.[0]
}

// --- Route notes ---

// --- Vehicle expenses ---

export async function addVehicleExpense(entry) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('No active session')
    throw new Error('No active session')
  }

  const row = {
    user_id: user.id,
    vehicle_id: entry.vehicle_id || null,
    category: entry.category || 'other',
    description: entry.description || '',
    amount: parseFloat(entry.amount) || 0,
    date: entry.date || new Date().toISOString().slice(0, 10),
  }
  if (!navigator.onLine) return offlineInsert('vehicle_expenses', row)
  const { data, error } = await supabase
    .from('vehicle_expenses')
    .insert(row)
    .select()
  if (error) {
    console.error('addVehicleExpense error:', error)
    throw error
  }
  return data
}

export async function fetchVehicleExpenses(userId) {
  const { data, error } = await supabase
    .from('vehicle_expenses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchVehicleExpensesByMonth(userId, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
  const { data, error } = await supabase
    .from('vehicle_expenses')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lt('date', end)
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function deleteVehicleExpense(id) {
  const { error } = await supabase
    .from('vehicle_expenses')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// --- Trailers ---

export async function getActiveTrailer(userId) {
  const { data, error } = await supabase
    .from('trailers')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .single()
  if (error && error.code === 'PGRST116') return null
  if (error) throw error
  return data
}

export async function getTrailerHistory(userId, limit = 5) {
  const { data, error } = await supabase
    .from('trailers')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'returned')
    .order('picked_up_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function uploadTrailerPhoto(userId, trailerId, file) {
  const timestamp = Date.now()
  const path = `${userId}/${trailerId}_${timestamp}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('trailer-photos')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (uploadError) throw uploadError
  const { data: urlData } = supabase.storage
    .from('trailer-photos')
    .getPublicUrl(path)
  return urlData.publicUrl
}

export async function pickUpTrailer(userId, vehicleId, trailerNumber, driverName, notes, photos) {
  const row = {
    user_id: userId,
    vehicle_id: vehicleId || null,
    trailer_number: trailerNumber,
    driver_name: driverName || '',
    notes: notes || '',
    photos: photos || [],
    picked_up_at: new Date().toISOString(),
    status: 'active',
  }
  const { data, error } = await supabase
    .from('trailers')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function dropOffTrailer(trailerId, photos) {
  const updateData = {
    dropped_off_at: new Date().toISOString(),
    status: 'returned',
  }
  if (photos && photos.length > 0) {
    const { data: existing } = await supabase
      .from('trailers')
      .select('photos')
      .eq('id', trailerId)
      .single()
    const existingPhotos = existing?.photos || []
    updateData.photos = [...existingPhotos, ...photos]
  }
  const { data, error } = await supabase
    .from('trailers')
    .update(updateData)
    .eq('id', trailerId)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function deleteTrailer(trailerId) {
  const { error } = await supabase
    .from('trailers')
    .delete()
    .eq('id', trailerId)
  if (error) throw error
}

// --- Vehicle photos ---

export async function uploadVehiclePhoto(userId, vehicleId, file, photoType, driverName, notes) {
  const timestamp = Date.now()
  const path = `${userId}/${vehicleId}_${timestamp}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (uploadError) throw uploadError
  const { data: urlData } = supabase.storage
    .from('vehicle-photos')
    .getPublicUrl(path)
  const photoUrl = urlData.publicUrl

  const row = {
    user_id: userId,
    vehicle_id: vehicleId || null,
    photo_url: photoUrl,
    photo_type: photoType || 'inspection',
    driver_name: driverName || '',
    notes: notes || '',
    storage_path: path,
  }
  const { data, error } = await supabase
    .from('vehicle_photos')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function getVehiclePhotos(userId, vehicleId) {
  let query = supabase
    .from('vehicle_photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (vehicleId) {
    query = query.eq('vehicle_id', vehicleId)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function deleteVehiclePhoto(photoId, photoUrl) {
  // Extract storage path from URL or use storage_path
  const { data: photo } = await supabase
    .from('vehicle_photos')
    .select('storage_path')
    .eq('id', photoId)
    .single()

  if (photo?.storage_path) {
    await supabase.storage
      .from('vehicle-photos')
      .remove([photo.storage_path])
  }

  const { error } = await supabase
    .from('vehicle_photos')
    .delete()
    .eq('id', photoId)
  if (error) throw error
}

// --- Tire records ---

export async function getTireRecords(userId) {
  const { data, error } = await supabase
    .from('tire_records')
    .select('*')
    .eq('user_id', userId)
    .order('installed_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addTireRecord(entry) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('No active session')
    throw new Error('No active session')
  }

  const row = {
    user_id: user.id,
    vehicle_id: entry.vehicle_id || null,
    brand: entry.brand || '',
    model: entry.model || '',
    position: entry.position || '',
    installed_at: entry.installed_at || new Date().toISOString().slice(0, 10),
    installed_odometer: parseInt(entry.installed_odometer, 10) || 0,
    condition: entry.condition || 'new',
    cost: parseFloat(entry.cost) || 0,
    notes: entry.notes || '',
  }
  if (!navigator.onLine) return offlineInsert('tire_records', row)
  const { data, error } = await supabase
    .from('tire_records')
    .insert(row)
    .select()
  if (error) {
    console.error('addTireRecord error:', error)
    throw error
  }
  return data
}

export async function updateTireRecord(id, entry) {
  const updates = {}
  if (entry.brand !== undefined) updates.brand = entry.brand
  if (entry.model !== undefined) updates.model = entry.model
  if (entry.position !== undefined) updates.position = entry.position
  if (entry.installed_at !== undefined) updates.installed_at = entry.installed_at
  if (entry.installed_odometer !== undefined) updates.installed_odometer = parseInt(entry.installed_odometer, 10) || 0
  if (entry.condition !== undefined) updates.condition = entry.condition
  if (entry.cost !== undefined) updates.cost = parseFloat(entry.cost) || 0
  if (entry.notes !== undefined) updates.notes = entry.notes

  const { data, error } = await supabase
    .from('tire_records')
    .update(updates)
    .eq('id', id)
    .select()
  if (error) {
    console.error('updateTireRecord error:', error)
    throw error
  }
  return data
}

export async function deleteTireRecord(id) {
  const { error } = await supabase
    .from('tire_records')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// --- Route notes ---

// --- Documents ---

export async function uploadDocument(userId, vehicleId, file, docType, title, notes) {
  const timestamp = Date.now()
  const path = `${userId}/${docType}_${timestamp}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (uploadError) throw uploadError
  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(path)
  const fileUrl = urlData.publicUrl

  const row = {
    user_id: userId,
    vehicle_id: vehicleId || null,
    type: docType || 'other',
    title: title || '',
    notes: notes || '',
    file_url: fileUrl,
    storage_path: path,
  }
  const { data, error } = await supabase
    .from('documents')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function getDocuments(userId) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function deleteDocument(docId) {
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', docId)
    .single()

  if (doc?.storage_path) {
    await supabase.storage
      .from('documents')
      .remove([doc.storage_path])
  }

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', docId)
  if (error) throw error
}

export async function fetchRouteNotes(userId) {
  const { data, error } = await supabase
    .from('route_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
