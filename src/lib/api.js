import { supabase } from './supabase'
import { addToSyncQueue } from './offlineDb'

async function offlineInsert(table, row) {
  await addToSyncQueue(table, 'insert', row)
  return [{ ...row, id: 'offline-' + Date.now(), _offline: true }]
}

// --- Receipt photo upload ---

export async function uploadReceiptPhoto(userId, category, file, { date, plate, amount } = {}) {
  const ext = file.name ? file.name.split('.').pop() : 'jpg'
  const d = date || new Date().toISOString().slice(0, 10)
  const p = (plate || '').replace(/[\s\/\\<>:"|?*]/g, '') || 'noplate'
  const c = (category || 'other').replace(/[\/\\<>:"|?*]/g, '').trim()
  const a = amount ? String(amount).replace(/[^0-9.,]/g, '') : '0'
  const path = `${userId}/receipts/${d}_${p}_${c}_${a}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('receipts')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (upErr) {
    console.error('uploadReceiptPhoto error:', JSON.stringify(upErr))
    throw upErr
  }
  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
  return urlData?.publicUrl || ''
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
    latitude: entry.latitude != null ? parseFloat(entry.latitude) : null,
    longitude: entry.longitude != null ? parseFloat(entry.longitude) : null,
    state: entry.state || null,
    receipt_url: entry.receipt_url || null,
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

  const distance = parseFloat(entry.distance) || 0
  const income = parseFloat(entry.rate) || 0

  // Calculate driver_pay based on profile pay_type/pay_rate
  let driverPay = null
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('pay_type, pay_rate')
      .eq('id', user.id)
      .single()
    if (prof && prof.pay_type && prof.pay_type !== 'none' && prof.pay_rate) {
      if (prof.pay_type === 'per_mile') {
        driverPay = distance * parseFloat(prof.pay_rate)
      } else if (prof.pay_type === 'percent') {
        driverPay = income * parseFloat(prof.pay_rate) / 100
      }
      if (driverPay !== null) driverPay = Math.round(driverPay * 100) / 100
    }
  } catch (e) {
    console.error('addTrip: failed to fetch pay info', e)
  }

  const row = {
    user_id: user.id,
    vehicle_id: entry.vehicle_id || null,
    origin: entry.from || '',
    destination: entry.to || '',
    distance_km: distance,
    deadhead_km: parseFloat(entry.deadhead) || 0,
    income,
    receipt_url: entry.receipt_url || null,
    driver_pay: driverPay,
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
    receipt_url: entry.receipt_url || null,
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

export async function fetchVehicles(userId, { asDriver = false } = {}) {
  let query = supabase
    .from('vehicles')
    .select('*')
    .order('created_at', { ascending: true })
  if (asDriver) {
    // Hired driver: see only vehicles assigned to them
    query = query.eq('driver_id', userId)
  } else {
    // Owner / fleet owner: see all their vehicles
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query
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
    category: entry.category || 'repair',
    description: entry.name || '',
    service_station: entry.sto || '',
    cost: parseFloat(entry.amount) || 0,
    odometer: parseInt(entry.odometer, 10) || 0,
    date: entry.date || new Date().toISOString().slice(0, 10),
    receipt_url: entry.receipt_url || null,
  }
  if (!navigator.onLine) return offlineInsert('service_records', row)
  const { data, error } = await supabase
    .from('service_records')
    .insert(row)
    .select()
  if (error) {
    console.error('addServiceRecord error:', JSON.stringify(error))
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

export async function uploadOdometerPhoto(userId, file) {
  const ext = file.name ? file.name.split('.').pop() : 'jpg'
  const path = `${userId}/odometer/${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('receipts')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (upErr) { console.error('uploadOdometerPhoto storage error:', JSON.stringify(upErr)); throw upErr }
  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
  return urlData?.publicUrl || ''
}

export async function startShift(userId, vehicleId, odometerStart, driverName, odometerPhotoUrl) {
  const row = {
    user_id: userId,
    vehicle_id: vehicleId || null,
    odometer_start: parseInt(odometerStart, 10) || 0,
    driver_name: driverName || '',
    started_at: new Date().toISOString(),
    status: 'active',
    odometer_photo_url: odometerPhotoUrl || null,
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

export async function endShift(shiftId, odometerEnd, odometerPhotoUrl) {
  const end = parseInt(odometerEnd, 10) || 0
  const updateData = {
    ended_at: new Date().toISOString(),
    odometer_end: end,
    status: 'completed',
  }
  if (odometerPhotoUrl) updateData.odometer_photo_end_url = odometerPhotoUrl
  const { data, error } = await supabase
    .from('shifts')
    .update(updateData)
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

export async function getShiftStats(userId, period, customFrom, customTo) {
  const now = new Date()
  let since, until
  if (period === 'custom' && customFrom && customTo) {
    since = new Date(customFrom)
    since.setHours(0, 0, 0, 0)
    until = new Date(customTo)
    until.setHours(23, 59, 59, 999)
  } else if (period === 'month') {
    since = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  }
  if (!until) since.setHours(0, 0, 0, 0)

  let query = supabase
    .from('shifts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('started_at', since.toISOString())
  if (until) query = query.lte('started_at', until.toISOString())
  const { data, error } = await query.order('started_at', { ascending: false })
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

// --- Vehicle shifts (team driving) ---

export async function getVehicleShifts(vehicleId, limit = 20) {
  if (!vehicleId) return []
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
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

export async function getRouteNotes(userId) {
  const { data, error } = await supabase
    .from('route_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addRouteNote(userId, lat, lng, type, title, description) {
  const row = {
    user_id: userId,
    lat,
    lng,
    type: type || 'fuel',
    title: title || '',
    description: description || '',
  }
  if (!navigator.onLine) return offlineInsert('route_notes', row)
  const { data, error } = await supabase
    .from('route_notes')
    .insert(row)
    .select()
  if (error) {
    console.error('addRouteNote error:', error)
    throw error
  }
  return data
}

export async function deleteRouteNote(noteId) {
  const { error } = await supabase
    .from('route_notes')
    .delete()
    .eq('id', noteId)
  if (error) throw error
}

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
    receipt_url: entry.receipt_url || null,
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
  if (error) { console.error('vehicle_photos insert error:', JSON.stringify(error)); throw error }
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
    size: entry.size || '',
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
  if (entry.size !== undefined) updates.size = entry.size
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

export async function getTireRecordsByVehicle(vehicleId) {
  const { data, error } = await supabase
    .from('tire_records')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('installed_at', { ascending: false })
  if (error) throw error
  return data || []
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
  const ext = (file.name || '').split('.').pop() || 'jpg'
  const path = `${userId}/${docType}_${timestamp}.${ext}`
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
    title: title || file.name || '',
    notes: notes || '',
    file_url: fileUrl,
    storage_path: path,
    file_name: file.name || '',
    file_size: file.size || 0,
    mime_type: file.type || '',
  }
  const { data, error } = await supabase
    .from('documents')
    .insert(row)
    .select()
  if (error) { console.error('documents insert error:', JSON.stringify(error)); throw error }
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

// --- Jobs ---

export async function fetchJobs(country, jobType) {
  let query = supabase
    .from('jobs')
    .select('*')
    .eq('status', 'published')
    .order('is_premium', { ascending: false })
    .order('created_at', { ascending: false })
  if (country) {
    query = query.eq('country', country)
  }
  if (jobType && jobType !== 'all') {
    query = query.eq('job_type', jobType)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function fetchJobById(id) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
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

// --- Job applications ---

export async function applyToJob(jobId, userId) {
  const row = {
    job_id: jobId,
    applicant_id: userId,
    status: 'new',
  }
  const { data, error } = await supabase
    .from('job_applications')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function checkApplication(jobId, userId) {
  const { data, error } = await supabase
    .from('job_applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('applicant_id', userId)
    .limit(1)
  if (error) throw error
  return data && data.length > 0
}

// --- Job bookmarks ---

export async function toggleBookmark(userId, jobId) {
  const { data: existing, error: checkErr } = await supabase
    .from('job_bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .limit(1)
  if (checkErr) throw checkErr

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('job_bookmarks')
      .delete()
      .eq('id', existing[0].id)
    if (error) throw error
    return false
  } else {
    const { error } = await supabase
      .from('job_bookmarks')
      .insert({ user_id: userId, job_id: jobId })
    if (error) throw error
    return true
  }
}

export async function getBookmarks(userId) {
  const { data, error } = await supabase
    .from('job_bookmarks')
    .select('job_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data || []).map(b => b.job_id)
}

// --- Driver resumes ---

export async function getMyResume(userId) {
  const { data, error } = await supabase
    .from('driver_resumes')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single()
  if (error && error.code === 'PGRST116') return null
  if (error) throw error
  return data
}

export async function createResume(resumeData) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('No active session')

  const row = {
    user_id: user.id,
    title: resumeData.title || '',
    about: resumeData.about || '',
    cdl_category: resumeData.cdl_category || '',
    experience_years: parseInt(resumeData.experience_years, 10) || 0,
    preferred_type: resumeData.preferred_type || '',
    preferred_salary: parseInt(resumeData.preferred_salary, 10) || 0,
    salary_currency: resumeData.salary_currency || 'RUB',
    city: resumeData.city || '',
    country: resumeData.country || 'RU',
    has_own_truck: resumeData.has_own_truck || false,
    truck_types: resumeData.truck_types || '',
    hazmat: resumeData.hazmat || false,
    is_public: resumeData.is_public !== undefined ? resumeData.is_public : true,
  }
  const { data, error } = await supabase
    .from('driver_resumes')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function getResumeById(resumeId) {
  const { data, error } = await supabase
    .from('driver_resumes')
    .select('*')
    .eq('id', resumeId)
    .single()
  if (error) throw error
  return data
}

export async function updateResume(id, resumeData) {
  const updates = {}
  if (resumeData.title !== undefined) updates.title = resumeData.title
  if (resumeData.about !== undefined) updates.about = resumeData.about
  if (resumeData.cdl_category !== undefined) updates.cdl_category = resumeData.cdl_category
  if (resumeData.experience_years !== undefined) updates.experience_years = parseInt(resumeData.experience_years, 10) || 0
  if (resumeData.preferred_type !== undefined) updates.preferred_type = resumeData.preferred_type
  if (resumeData.preferred_salary !== undefined) updates.preferred_salary = parseInt(resumeData.preferred_salary, 10) || 0
  if (resumeData.salary_currency !== undefined) updates.salary_currency = resumeData.salary_currency
  if (resumeData.city !== undefined) updates.city = resumeData.city
  if (resumeData.country !== undefined) updates.country = resumeData.country
  if (resumeData.has_own_truck !== undefined) updates.has_own_truck = resumeData.has_own_truck
  if (resumeData.truck_types !== undefined) updates.truck_types = resumeData.truck_types
  if (resumeData.hazmat !== undefined) updates.hazmat = resumeData.hazmat
  if (resumeData.is_public !== undefined) updates.is_public = resumeData.is_public

  const { data, error } = await supabase
    .from('driver_resumes')
    .update(updates)
    .eq('id', id)
    .select()
  if (error) throw error
  return data?.[0]
}

// --- Employer jobs ---

export async function createJob(jobData) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('No active session')

  const row = {
    employer_id: user.id,
    title: jobData.title || '',
    description: jobData.description || '',
    company_name: jobData.company_name || '',
    location: jobData.location || '',
    country: jobData.country || 'RU',
    job_type: jobData.job_type || 'otr',
    salary_min: parseInt(jobData.salary_min, 10) || null,
    salary_max: parseInt(jobData.salary_max, 10) || null,
    salary_currency: jobData.salary_currency || 'RUB',
    salary_period: jobData.salary_period || 'month',
    cdl_required: jobData.cdl_required || '',
    experience_min: parseInt(jobData.experience_min, 10) || 0,
    truck_provided: jobData.truck_provided || false,
    home_time: jobData.home_time || '',
    benefits: jobData.benefits || '',
    contact_phone: jobData.contact_phone || '',
    contact_method: jobData.contact_method || 'phone',
    status: jobData.status || 'draft',
  }
  const { data, error } = await supabase
    .from('jobs')
    .insert(row)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function updateJob(id, jobData) {
  const updates = {}
  const fields = [
    'title', 'description', 'company_name', 'location', 'country',
    'job_type', 'salary_currency', 'salary_period', 'cdl_required',
    'truck_provided', 'home_time', 'benefits', 'contact_phone',
    'contact_method', 'status',
  ]
  fields.forEach(f => {
    if (jobData[f] !== undefined) updates[f] = jobData[f]
  })
  if (jobData.salary_min !== undefined) updates.salary_min = parseInt(jobData.salary_min, 10) || null
  if (jobData.salary_max !== undefined) updates.salary_max = parseInt(jobData.salary_max, 10) || null
  if (jobData.experience_min !== undefined) updates.experience_min = parseInt(jobData.experience_min, 10) || 0

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', id)
    .select()
  if (error) throw error
  return data?.[0]
}

export async function fetchMyJobs(userId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('employer_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchApplicationsForJob(jobId) {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*, profiles:applicant_id(name, phone), driver_resumes:resume_id(*)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  if (error) {
    // Fallback without joins if FK relations not set up
    const { data: fallback, error: err2 } = await supabase
      .from('job_applications')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
    if (err2) throw err2
    return fallback || []
  }
  return data || []
}

export async function fetchNews(country, category) {
  let query = supabase
    .from('news_articles')
    .select('*')
    .in('country', [country, 'ALL'])
    .order('published_at', { ascending: false })
    .limit(50)
  if (category) {
    query = query.eq('category', category)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// --- Marketplace / Ads ---

export async function fetchAdCategories() {
  const { data, error } = await supabase
    .from('ad_categories')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchAds(country, categoryKey) {
  let query = supabase
    .from('ads')
    .select('*')
    .eq('status', 'active')
    .in('country', [country, 'ALL'])
    .order('is_premium', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)
  if (categoryKey) {
    const { data: catData } = await supabase
      .from('ad_categories')
      .select('id')
      .eq('key', categoryKey)
      .single()
    if (catData) {
      query = query.eq('category_id', catData.id)
    }
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function fetchAdById(id) {
  const { data, error } = await supabase
    .from('ads')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function trackAdClick(adId, userId, clickType) {
  const { error } = await supabase
    .from('ad_clicks')
    .insert({
      ad_id: adId,
      user_id: userId || null,
      click_type: clickType,
    })
  if (error) console.error('trackAdClick error:', error)
}

export async function updateApplicationStatus(id, status) {
  const { data, error } = await supabase
    .from('job_applications')
    .update({ status })
    .eq('id', id)
    .select()
  if (error) throw error
  return data?.[0]
}

// --- Fleet summary (B2B) ---

export async function fetchFleetSummary(userId) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const [vehiclesRes, fuelsRes, tripsRes, vehicleExpRes, serviceRes, shiftsRes] = await Promise.all([
    supabase.from('vehicles').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('fuel_entries').select('*').eq('user_id', userId).gte('date', monthStart),
    supabase.from('trips').select('*').eq('user_id', userId).gte('created_at', monthStart + 'T00:00:00'),
    supabase.from('vehicle_expenses').select('*').eq('user_id', userId).gte('date', monthStart),
    supabase.from('service_records').select('*').eq('user_id', userId).gte('date', monthStart),
    supabase.from('driving_sessions').select('*').eq('user_id', userId).gte('started_at', monthStart + 'T00:00:00'),
  ])

  const vehicles = vehiclesRes.data || []
  const fuels = fuelsRes.data || []
  const trips = tripsRes.data || []
  const vehicleExps = vehicleExpRes.data || []
  const serviceRecs = serviceRes.data || []
  const shifts = shiftsRes.data || []

  const totalIncome = trips.reduce((s, t) => s + (t.income || 0), 0)
  const totalFuelCost = fuels.reduce((s, e) => s + (e.cost || 0), 0)
  const totalVehicleExpCost = vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totalServiceCost = serviceRecs.reduce((s, e) => s + (e.cost || 0), 0)
  // Company role should NOT see personal expenses (byt) — only vehicle/business expenses
  const totalExpenses = totalFuelCost + totalVehicleExpCost + totalServiceCost
  const totalKm = shifts.reduce((s, sh) => s + (sh.km_driven || 0), 0)
  const tripCount = trips.length

  // Active driving sessions (no ended_at) = vehicles on trip
  const onTripVehicleIds = new Set(
    shifts.filter(sh => !sh.ended_at).map(sh => sh.vehicle_id).filter(Boolean)
  )
  const onTripCount = onTripVehicleIds.size

  // Per-vehicle stats
  const vehicleStats = vehicles.map(v => {
    const vFuel = fuels.filter(f => f.vehicle_id === v.id).reduce((s, e) => s + (e.cost || 0), 0)
    const vService = serviceRecs.filter(r => r.vehicle_id === v.id).reduce((s, e) => s + (e.cost || 0), 0)
    const vVehicleExp = vehicleExps.filter(e => e.vehicle_id === v.id).reduce((s, e) => s + (e.amount || 0), 0)
    const vTrips = trips.filter(t => t.vehicle_id === v.id)
    const vIncome = vTrips.reduce((s, t) => s + (t.income || 0), 0)
    const vKm = shifts.filter(sh => sh.vehicle_id === v.id).reduce((s, sh) => s + (sh.km_driven || 0), 0)
    return {
      ...v,
      monthFuelCost: vFuel,
      monthServiceCost: vService,
      monthVehicleExpCost: vVehicleExp,
      monthExpenses: vFuel + vService + vVehicleExp,
      monthIncome: vIncome,
      monthTrips: vTrips.length,
      monthKm: vKm,
      isOnTrip: onTripVehicleIds.has(v.id),
    }
  })

  return {
    vehicles,
    vehicleStats,
    totalVehicles: vehicles.length,
    totalIncome,
    totalExpenses,
    totalKm,
    tripCount,
    onTripCount,
  }
}

// --- Vehicle detail report (B2B) ---

export async function fetchVehicleReport(vehicleId, userId, period = 'month') {
  const now = new Date()
  let startDate
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    startDate = d.toISOString().slice(0, 10)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }

  const [fuelsRes, tripsRes, serviceRes, vehicleExpRes, shiftsRes] = await Promise.all([
    supabase.from('fuel_entries').select('*').eq('vehicle_id', vehicleId).gte('date', startDate),
    supabase.from('trips').select('*').eq('vehicle_id', vehicleId).gte('created_at', startDate + 'T00:00:00'),
    supabase.from('service_records').select('*').eq('vehicle_id', vehicleId).gte('date', startDate),
    supabase.from('vehicle_expenses').select('*').eq('vehicle_id', vehicleId).gte('date', startDate).catch(() => ({ data: [] })),
    supabase.from('driving_sessions').select('*').eq('vehicle_id', vehicleId).gte('started_at', startDate + 'T00:00:00'),
  ])

  const fuels = fuelsRes.data || []
  const trips = tripsRes.data || []
  const serviceRecs = serviceRes.data || []
  const vehicleExps = vehicleExpRes.data || []
  const shifts = shiftsRes.data || []

  const fuelLiters = fuels.reduce((s, e) => s + (e.liters || 0), 0)
  const fuelCost = fuels.reduce((s, e) => s + (e.cost || 0), 0)
  const serviceCost = serviceRecs.reduce((s, e) => s + (e.cost || 0), 0)
  const vehicleExpCost = vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totalIncome = trips.reduce((s, t) => s + (t.income || 0), 0)
  const totalKm = shifts.reduce((s, sh) => s + (sh.km_driven || 0), 0) || trips.reduce((s, t) => s + (t.distance_km || 0), 0)
  const totalExpenses = fuelCost + serviceCost + vehicleExpCost
  const profit = totalIncome - totalExpenses

  return {
    fuelLiters,
    fuelCost,
    serviceCost,
    vehicleExpCost,
    totalIncome,
    totalExpenses,
    totalKm,
    profit,
    tripCount: trips.length,
    trips: trips.map(t => ({
      id: t.id,
      from: t.route_from || '',
      to: t.route_to || '',
      date: (t.created_at || '').slice(0, 10),
      km: t.distance_km || 0,
      income: t.income || 0,
    })),
  }
}

// --- Driver report (B2B) ---

export async function fetchDriverReport(driverName, userId, period = 'month') {
  const now = new Date()
  let startDate
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    startDate = d.toISOString().slice(0, 10)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }

  const [shiftsRes, vehiclesRes, fuelsRes, tripsRes] = await Promise.all([
    supabase.from('driving_sessions').select('*').eq('user_id', userId).eq('driver_name', driverName).gte('started_at', startDate + 'T00:00:00'),
    supabase.from('vehicles').select('*').eq('user_id', userId),
    supabase.from('fuel_entries').select('*').eq('user_id', userId).gte('date', startDate),
    supabase.from('trips').select('*').eq('user_id', userId).gte('created_at', startDate + 'T00:00:00'),
  ])

  const shifts = shiftsRes.data || []
  const vehicles = vehiclesRes.data || []
  const fuels = fuelsRes.data || []
  const trips = tripsRes.data || []

  const totalKm = shifts.reduce((s, sh) => s + (sh.km_driven || 0), 0)
  const totalMinutes = shifts.reduce((s, sh) => {
    if (!sh.ended_at) return s
    return s + (new Date(sh.ended_at).getTime() - new Date(sh.started_at).getTime()) / 60000
  }, 0)
  const totalHours = totalMinutes / 60

  // Vehicles this driver worked on
  const driverVehicleIds = [...new Set(shifts.map(sh => sh.vehicle_id).filter(Boolean))]
  const driverVehicles = vehicles.filter(v => driverVehicleIds.includes(v.id))

  // Fuel used on those vehicles during period
  const fuelCost = fuels.filter(f => driverVehicleIds.includes(f.vehicle_id)).reduce((s, e) => s + (e.cost || 0), 0)
  const fuelLiters = fuels.filter(f => driverVehicleIds.includes(f.vehicle_id)).reduce((s, e) => s + (e.liters || 0), 0)

  // Trips on those vehicles
  const driverTrips = trips.filter(t => driverVehicleIds.includes(t.vehicle_id))

  return {
    driverName,
    shiftCount: shifts.length,
    totalKm,
    totalHours,
    tripCount: driverTrips.length,
    fuelCost,
    fuelLiters,
    vehicles: driverVehicles.map(v => ({ id: v.id, brand: v.brand, model: v.model, plate_number: v.plate_number })),
  }
}

// --- Fleet analytics with daily breakdown (B2B) ---

export async function fetchFleetAnalytics(userId, period = 'month') {
  const now = new Date()
  let startDate
  if (period === 'day') {
    startDate = now.toISOString().slice(0, 10)
  } else if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    startDate = d.toISOString().slice(0, 10)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }

  const [fuelsRes, tripsRes, serviceRes, vehicleExpRes, shiftsRes] = await Promise.all([
    supabase.from('fuel_entries').select('*').eq('user_id', userId).gte('date', startDate),
    supabase.from('trips').select('*').eq('user_id', userId).gte('created_at', startDate + 'T00:00:00'),
    supabase.from('service_records').select('*').eq('user_id', userId).gte('date', startDate),
    supabase.from('vehicle_expenses').select('*').eq('user_id', userId).gte('date', startDate).catch(() => ({ data: [] })),
    supabase.from('driving_sessions').select('*').eq('user_id', userId).gte('started_at', startDate + 'T00:00:00'),
  ])

  const fuels = fuelsRes.data || []
  const trips = tripsRes.data || []
  const serviceRecs = serviceRes.data || []
  const vehicleExps = vehicleExpRes.data || []
  const shifts = shiftsRes.data || []

  const totalIncome = trips.reduce((s, t) => s + (t.income || 0), 0)
  const totalFuelCost = fuels.reduce((s, e) => s + (e.cost || 0), 0)
  const totalFuelLiters = fuels.reduce((s, e) => s + (e.liters || 0), 0)
  const totalServiceCost = serviceRecs.reduce((s, e) => s + (e.cost || 0), 0)
  const totalVehicleExpCost = vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totalExpenses = totalFuelCost + totalServiceCost + totalVehicleExpCost
  const totalKm = shifts.reduce((s, sh) => s + (sh.km_driven || 0), 0) || trips.reduce((s, t) => s + (t.distance_km || 0), 0)
  const tripCount = trips.length

  // Daily breakdown for chart
  const dailyMap = {}
  const addDay = (dateStr, field, val) => {
    const day = (dateStr || '').slice(0, 10)
    if (!day) return
    if (!dailyMap[day]) dailyMap[day] = { date: day, income: 0, expense: 0 }
    dailyMap[day][field] += val
  }
  trips.forEach(t => addDay(t.created_at, 'income', t.income || 0))
  fuels.forEach(e => addDay(e.date, 'expense', e.cost || 0))
  serviceRecs.forEach(e => addDay(e.date, 'expense', e.cost || 0))
  vehicleExps.forEach(e => addDay(e.date, 'expense', e.amount || 0))

  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalIncome,
    totalExpenses,
    profit: totalIncome - totalExpenses,
    totalFuelCost,
    totalFuelLiters,
    totalKm,
    tripCount,
    daily,
  }
}

// --- Fleet analytics per driver with income (B2B) ---

export async function fetchDriversSalaryData(userId, period = 'month') {
  const now = new Date()
  let startDate
  if (period === 'day') {
    startDate = now.toISOString().slice(0, 10)
  } else if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    startDate = d.toISOString().slice(0, 10)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }

  const [shiftsRes, tripsRes, vehiclesRes] = await Promise.all([
    supabase.from('driving_sessions').select('*').eq('user_id', userId).gte('started_at', startDate + 'T00:00:00'),
    supabase.from('trips').select('*').eq('user_id', userId).gte('created_at', startDate + 'T00:00:00'),
    supabase.from('vehicles').select('id, driver_name').eq('user_id', userId),
  ])

  const shifts = shiftsRes.data || []
  const trips = tripsRes.data || []
  const vehicles = vehiclesRes.data || []

  const nameSet = new Set()
  shifts.forEach(sh => { if (sh.driver_name) nameSet.add(sh.driver_name) })
  vehicles.forEach(v => { if (v.driver_name) nameSet.add(v.driver_name) })

  return [...nameSet].map(name => {
    const driverShifts = shifts.filter(sh => sh.driver_name === name)
    const totalKm = driverShifts.reduce((s, sh) => s + (sh.km_driven || 0), 0)
    const vehicleIds = [...new Set(driverShifts.map(sh => sh.vehicle_id).filter(Boolean))]
    const driverTrips = trips.filter(t => vehicleIds.includes(t.vehicle_id))
    const income = driverTrips.reduce((s, t) => s + (t.income || 0), 0)
    return {
      name,
      trips: driverTrips.length,
      km: totalKm,
      income,
    }
  })
}

export async function fetchAllDriversComparison(userId, period = 'month') {
  const now = new Date()
  let startDate
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    startDate = d.toISOString().slice(0, 10)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }

  const [shiftsRes, tripsRes, vehiclesRes] = await Promise.all([
    supabase.from('driving_sessions').select('*').eq('user_id', userId).gte('started_at', startDate + 'T00:00:00'),
    supabase.from('trips').select('*').eq('user_id', userId).gte('created_at', startDate + 'T00:00:00'),
    supabase.from('vehicles').select('id, driver_name').eq('user_id', userId),
  ])

  const shifts = shiftsRes.data || []
  const trips = tripsRes.data || []
  const vehicles = vehiclesRes.data || []

  // Collect unique driver names from shifts + vehicles
  const nameSet = new Set()
  shifts.forEach(sh => { if (sh.driver_name) nameSet.add(sh.driver_name) })
  vehicles.forEach(v => { if (v.driver_name) nameSet.add(v.driver_name) })
  const driverNames = [...nameSet]

  return driverNames.map(name => {
    const driverShifts = shifts.filter(sh => sh.driver_name === name)
    const totalKm = driverShifts.reduce((s, sh) => s + (sh.km_driven || 0), 0)
    const totalMinutes = driverShifts.reduce((s, sh) => {
      if (!sh.ended_at) return s
      return s + (new Date(sh.ended_at).getTime() - new Date(sh.started_at).getTime()) / 60000
    }, 0)
    const vehicleIds = [...new Set(driverShifts.map(sh => sh.vehicle_id).filter(Boolean))]
    const driverTrips = trips.filter(t => vehicleIds.includes(t.vehicle_id))

    return {
      name,
      shifts: driverShifts.length,
      km: totalKm,
      hours: totalMinutes / 60,
      trips: driverTrips.length,
    }
  })
}

// --- DVIR Inspections ---

export async function fetchDVIRInspections(userId, vehicleId) {
  let query = supabase
    .from('dvir_inspections')
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

export async function addDVIRInspection(entry) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('No active session')

  const row = {
    user_id: user.id,
    vehicle_id: entry.vehicle_id || null,
    inspection_type: entry.inspection_type || 'pre_trip',
    status: entry.status || 'pass',
    items: entry.items || [],
    notes: entry.notes || '',
    defects_count: entry.defects_count || 0,
  }
  if (!navigator.onLine) return offlineInsert('dvir_inspections', row)
  const { data, error } = await supabase
    .from('dvir_inspections')
    .insert(row)
    .select()
  if (error) { console.error('dvir_inspections insert error:', JSON.stringify(error)); throw error }
  return data?.[0]
}

export async function uploadDVIRPhoto(userId, inspectionId, itemKey, file) {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/dvir/${inspectionId}/${itemKey}_${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('receipts')
    .upload(path, file)
  if (upErr) throw upErr

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
  const photoUrl = urlData?.publicUrl || ''

  const { data, error } = await supabase
    .from('dvir_photos')
    .insert({
      inspection_id: inspectionId,
      item_key: itemKey,
      photo_url: photoUrl,
      storage_path: path,
    })
    .select()
  if (error) { console.error('dvir_photos insert error:', JSON.stringify(error)); throw error }
  return data?.[0]
}

// --- Achievements Stats ---

export async function fetchAchievementStats(userId) {
  const [tripsRes, fuelRes, dvirRes, sessionsRes] = await Promise.all([
    supabase.from('trips').select('id, origin, destination, distance_km').eq('user_id', userId),
    supabase.from('fuel_entries').select('id').eq('user_id', userId),
    supabase.from('dvir_inspections').select('id, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('driving_sessions').select('id').eq('user_id', userId),
  ])

  const trips = tripsRes.data || []
  const fuels = fuelRes.data || []
  const dvirs = dvirRes.data || []
  const sessions = sessionsRes.data || []

  const tripCount = trips.length
  const fuelCount = fuels.length
  const dvirCount = dvirs.length
  const sessionCount = sessions.length
  const totalKm = trips.reduce((sum, t) => sum + (parseFloat(t.distance_km) || 0), 0)

  // Unique cities from origin + destination
  const cities = new Set()
  trips.forEach(t => {
    if (t.origin) cities.add(t.origin.trim().toLowerCase())
    if (t.destination) cities.add(t.destination.trim().toLowerCase())
  })
  const uniqueCities = cities.size

  // DVIR pass streak (consecutive passes from most recent)
  let dvirPassStreak = 0
  for (const d of dvirs) {
    if (d.status === 'pass') dvirPassStreak++
    else break
  }

  // Consecutive days with expenses (byt or fuel)
  let consecutiveDays = 0
  try {
    const [bytRes, fuelDatesRes] = await Promise.all([
      supabase.from('byt_expenses').select('date').eq('user_id', userId),
      supabase.from('fuel_entries').select('date').eq('user_id', userId),
    ])
    const daySet = new Set()
    ;(bytRes.data || []).forEach(r => { if (r.date) daySet.add(r.date.slice(0, 10)) })
    ;(fuelDatesRes.data || []).forEach(r => { if (r.date) daySet.add(r.date.slice(0, 10)) })
    const sorted = [...daySet].sort().reverse()
    if (sorted.length > 0) {
      consecutiveDays = 1
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1])
        const curr = new Date(sorted[i])
        const diff = (prev - curr) / 86400000
        if (diff === 1) consecutiveDays++
        else break
      }
    }
  } catch { /* ignore */ }

  return { tripCount, fuelCount, dvirCount, sessionCount, totalKm, uniqueCities, dvirPassStreak, consecutiveDays }
}

// --- Dispatch Board (fleet overview for company) ---

export async function fetchDispatchBoard(userId) {
  const [vehiclesRes, sessionsRes] = await Promise.all([
    supabase.from('vehicles').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('driving_sessions').select('id, vehicle_id, started_at, ended_at').eq('user_id', userId).order('started_at', { ascending: false }),
  ])

  const vehicles = vehiclesRes.data || []
  const sessions = sessionsRes.data || []

  const result = vehicles.map(v => {
    const vSessions = sessions.filter(s => s.vehicle_id === v.id)
    const latest = vSessions[0] || null
    const isOnDuty = latest ? !latest.ended_at : false
    let lastActivity = null
    if (latest) {
      const d = new Date(latest.ended_at || latest.started_at)
      lastActivity = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }
    return { ...v, isOnDuty, lastActivity }
  })

  return { vehicles: result }
}

// --- GPS Waypoints ---

export async function insertWaypoint(row) {
  if (!navigator.onLine) return offlineInsert('trip_waypoints', row)
  const { data, error } = await supabase
    .from('trip_waypoints')
    .insert(row)
    .select()
  if (error) {
    console.error('insertWaypoint error:', error)
    throw error
  }
  return data
}

export async function fetchWaypoints(tripId) {
  const { data, error } = await supabase
    .from('trip_waypoints')
    .select('*')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function updateTripTracking(tripId, isTracking) {
  const { error } = await supabase
    .from('trips')
    .update({ is_tracking: isTracking })
    .eq('id', tripId)
  if (error) throw error
}

export async function fetchChatMessages(limit = 50) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

export async function sendChatMessage(userId, senderName, message, vehicleId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      sender_name: senderName,
      message,
      vehicle_id: vehicleId || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// --- Driver advances ---

export async function fetchDriverAdvances(userId, startDate, endDate) {
  let query = supabase
    .from('driver_advances')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (startDate) query = query.gte('date', startDate)
  if (endDate) query = query.lte('date', endDate)
  const { data, error } = await query
  if (error) {
    // Table may not exist yet
    console.warn('fetchDriverAdvances:', error.message)
    return []
  }
  return data || []
}

// --- Driver report data for Excel export ---

export async function fetchDriverReportExportData(userId, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  // Safe query wrapper: handles both Supabase error responses and rejections
  const safeQuery = async (query) => {
    try {
      const res = await query
      if (res.error) {
        console.warn('Supabase query error:', res.error.message)
        return []
      }
      return res.data || []
    } catch (e) {
      console.warn('Supabase query rejected:', e)
      return []
    }
  }

  const [fuels, trips, bytExps, serviceRecs, vehicleExps, tireRecs, advances, sessions] = await Promise.all([
    safeQuery(supabase.from('fuel_entries').select('*').eq('user_id', userId).gte('date', start).lt('date', end).order('date')),
    safeQuery(supabase.from('trips').select('*').eq('user_id', userId).gte('created_at', start + 'T00:00:00').lt('created_at', end + 'T00:00:00').order('created_at')),
    safeQuery(supabase.from('byt_expenses').select('*').eq('user_id', userId).gte('date', start).lt('date', end).order('date')),
    safeQuery(supabase.from('service_records').select('*').eq('user_id', userId).gte('date', start).lt('date', end).order('date')),
    safeQuery(supabase.from('vehicle_expenses').select('*').eq('user_id', userId).gte('date', start).lt('date', end).order('date')),
    safeQuery(supabase.from('tire_records').select('*').eq('user_id', userId).gte('installed_at', start).lt('installed_at', end).order('installed_at')),
    fetchDriverAdvances(userId, start, end),
    safeQuery(supabase.from('driving_sessions').select('*').eq('user_id', userId).gte('started_at', start + 'T00:00:00').lt('started_at', end + 'T00:00:00').order('started_at')),
  ])

  return {
    fuels,
    trips,
    bytExps,
    serviceRecs,
    vehicleExps,
    tireRecs,
    advances,
    sessions,
  }
}

// --- Fleet report data for Excel export (company role) ---

export async function fetchFleetReportExportData(userId, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  // Safe query wrapper: handles both Supabase error responses and rejections
  const safeQuery = async (query) => {
    try {
      const res = await query
      if (res.error) {
        console.warn('Supabase query error:', res.error.message)
        return []
      }
      return res.data || []
    } catch (e) {
      console.warn('Supabase query rejected:', e)
      return []
    }
  }

  // Fetch fleet vehicles + drivers (profiles with company_id = userId)
  const [vehicles, drivers] = await Promise.all([
    safeQuery(supabase.from('vehicles').select('*').eq('user_id', userId).order('created_at')),
    safeQuery(supabase.from('profiles').select('*').eq('company_id', userId)),
  ])

  // Collect all user IDs: fleet owner + all drivers
  const allUserIds = [userId, ...drivers.map(d => d.id)]

  // Collect all vehicle IDs owned by fleet owner
  const vehicleIds = vehicles.map(v => v.id)

  // Fetch all data for all users in the fleet for the month
  // Query by owner user_id (eq), by all user_ids (in), AND by vehicle_id to capture all entries
  // Using separate eq(userId) queries to match dashboard fetch pattern exactly
  const [
    fuelsByOwner, fuelsByAllUsers, fuelsByVehicle,
    trips,
    serviceRecsByOwner, serviceRecsByAllUsers, serviceRecsByVehicle,
    tireRecsByOwner, tireRecsByVehicle,
    vehicleExpsByOwner, vehicleExpsByAllUsers, vehicleExpsByVehicle,
    bytExpsByOwner, bytExpsByAllUsers,
    sessions, advances,
  ] = await Promise.all([
    // Fuel: by owner, by all users, by vehicle
    safeQuery(supabase.from('fuel_entries').select('*').eq('user_id', userId).gte('date', start).lt('date', end).order('date')),
    allUserIds.length > 1
      ? safeQuery(supabase.from('fuel_entries').select('*').in('user_id', allUserIds).gte('date', start).lt('date', end).order('date'))
      : Promise.resolve([]),
    vehicleIds.length > 0
      ? safeQuery(supabase.from('fuel_entries').select('*').in('vehicle_id', vehicleIds).gte('date', start).lt('date', end).order('date'))
      : Promise.resolve([]),
    // Trips: by all users (owner included)
    safeQuery(supabase.from('trips').select('*').in('user_id', allUserIds).gte('created_at', start + 'T00:00:00').lt('created_at', end + 'T00:00:00').order('created_at')),
    // Service records: by owner, by all users, by vehicle
    safeQuery(supabase.from('service_records').select('*').eq('user_id', userId).gte('date', start).lt('date', end).order('date')),
    allUserIds.length > 1
      ? safeQuery(supabase.from('service_records').select('*').in('user_id', allUserIds).gte('date', start).lt('date', end).order('date'))
      : Promise.resolve([]),
    vehicleIds.length > 0
      ? safeQuery(supabase.from('service_records').select('*').in('vehicle_id', vehicleIds).gte('date', start).lt('date', end).order('date'))
      : Promise.resolve([]),
    // Tire records: by owner, by vehicle
    safeQuery(supabase.from('tire_records').select('*').in('user_id', allUserIds).gte('installed_at', start).lt('installed_at', end).order('installed_at')),
    vehicleIds.length > 0
      ? safeQuery(supabase.from('tire_records').select('*').in('vehicle_id', vehicleIds).gte('installed_at', start).lt('installed_at', end).order('installed_at'))
      : Promise.resolve([]),
    // Vehicle expenses: use EXACT same function as dashboard (fetchVehicleExpenses)
    // This is a direct copy of the working dashboard query — no safeQuery wrapper
    fetchVehicleExpenses(userId).then(r => { alert('EXPORT fetchVehicleExpenses userId=' + userId + ' total=' + r.length + ' first2=' + JSON.stringify((r || []).slice(0,2))); return r; }).catch(() => []),
    Promise.resolve([]),  // placeholder — dashboard only queries by user_id
    Promise.resolve([]),  // placeholder — dashboard only queries by user_id
    // Byt (personal) expenses: by owner, by all users
    safeQuery(supabase.from('byt_expenses').select('*').eq('user_id', userId).gte('date', start).lt('date', end).order('date')),
    allUserIds.length > 1
      ? safeQuery(supabase.from('byt_expenses').select('*').in('user_id', allUserIds).gte('date', start).lt('date', end).order('date'))
      : Promise.resolve([]),
    // Sessions & advances
    safeQuery(supabase.from('driving_sessions').select('*').in('user_id', allUserIds).gte('started_at', start + 'T00:00:00').lt('started_at', end + 'T00:00:00').order('started_at')),
    safeQuery(supabase.from('driver_advances').select('*').in('user_id', allUserIds).gte('date', start).lt('date', end).order('date')),
  ])

  // Merge and deduplicate by id — combine all query sources
  const dedup = (...arrays) => {
    const map = {}
    arrays.forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(e => { if (e.id) map[e.id] = e })
    })
    return Object.values(map)
  }
  const fuels = dedup(fuelsByOwner, fuelsByAllUsers, fuelsByVehicle)
  const serviceRecs = dedup(serviceRecsByOwner, serviceRecsByAllUsers, serviceRecsByVehicle)
  const tireRecs = dedup(tireRecsByOwner, tireRecsByVehicle)
  // vehicleExpsByOwner = result of fetchVehicleExpenses(userId) — exact dashboard function
  // No dedup needed — single source, same as dashboard
  alert('EXPORT FILTER: vehicleExpsByOwner.length=' + vehicleExpsByOwner.length + ' start=' + start + ' end=' + end + ' dates=' + JSON.stringify(vehicleExpsByOwner.slice(0,3).map(e => e.date)))
  const vehicleExps = vehicleExpsByOwner.filter(e => {
    const d = (e.date || '').slice(0, 10)
    return d >= start && d < end
  })
  alert('EXPORT AFTER FILTER: vehicleExps.length=' + vehicleExps.length)
  const bytExps = dedup(bytExpsByOwner, bytExpsByAllUsers)

  const result = { vehicles, drivers, fuels, trips, serviceRecs, tireRecs, vehicleExps, bytExps, sessions, advances }
  console.log('fetchFleetReportExportData result keys:', Object.keys(result).map(k => k + ':' + (Array.isArray(result[k]) ? result[k].length : typeof result[k])).join(', '))
  return result
}

// --- Fetch BOL documents for a user filtered by period ---

export async function fetchBolDocuments(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'bol')
    .gte('created_at', startDate + 'T00:00:00')
    .lt('created_at', endDate + 'T00:00:00')
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('fetchBolDocuments error:', error.message)
    return []
  }
  return data || []
}

// --- Fetch BOL documents for fleet (all users) ---

export async function fetchFleetBolDocuments(userId, startDate, endDate) {
  // Get fleet driver IDs
  const { data: drivers } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', userId)
  const allUserIds = [userId, ...(drivers || []).map(d => d.id)]

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .in('user_id', allUserIds)
    .eq('type', 'bol')
    .gte('created_at', startDate + 'T00:00:00')
    .lt('created_at', endDate + 'T00:00:00')
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('fetchFleetBolDocuments error:', error.message)
    return []
  }
  return data || []
}

// --- Trailer photos (stored in vehicle_photos with trailer_ prefix on photo_type) ---

export async function uploadTrailerPhoto(userId, vehicleId, file, photoType, notes) {
  const timestamp = Date.now()
  const path = `${userId}/trailer_${vehicleId}_${timestamp}.jpg`
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
    photo_type: 'trailer_' + (photoType || 'overview'),
    driver_name: '',
    notes: notes || '',
    storage_path: path,
  }
  const { data, error } = await supabase
    .from('vehicle_photos')
    .insert(row)
    .select()
  if (error) { console.error('trailer photo insert error:', JSON.stringify(error)); throw error }
  return data?.[0]
}

// --- Incidents (stored in documents with type = fine|inspection_record|accident) ---

const INCIDENT_TYPES = ['fine', 'inspection_record', 'accident']

export async function addIncidentRecord(userId, vehicleId, incidentType, date, description, amount, files) {
  const results = []
  if (files && files.length > 0) {
    for (const file of files) {
      const timestamp = Date.now()
      const ext = (file.name || '').split('.').pop() || 'jpg'
      const path = `${userId}/incident_${timestamp}.${ext}`
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
        type: incidentType,
        title: description || '',
        notes: amount ? JSON.stringify({ amount: Number(amount), date }) : JSON.stringify({ date }),
        file_url: fileUrl,
        storage_path: path,
        file_name: file.name || '',
        file_size: file.size || 0,
        mime_type: file.type || '',
      }
      const { data, error } = await supabase.from('documents').insert(row).select()
      if (error) throw error
      if (data?.[0]) results.push(data[0])
    }
  } else {
    const row = {
      user_id: userId,
      vehicle_id: vehicleId || null,
      type: incidentType,
      title: description || '',
      notes: amount ? JSON.stringify({ amount: Number(amount), date }) : JSON.stringify({ date }),
      file_url: null,
      storage_path: null,
      file_name: '',
      file_size: 0,
      mime_type: '',
    }
    const { data, error } = await supabase.from('documents').insert(row).select()
    if (error) throw error
    if (data?.[0]) results.push(data[0])
  }
  return results
}

export async function getIncidentRecords(userId, vehicleId, startDate, endDate) {
  let query = supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .in('type', INCIDENT_TYPES)
    .order('created_at', { ascending: false })
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  if (startDate) query = query.gte('created_at', startDate)
  if (endDate) query = query.lte('created_at', endDate)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function deleteIncidentRecord(docId) {
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', docId)
    .single()
  if (doc?.storage_path) {
    await supabase.storage.from('documents').remove([doc.storage_path])
  }
  const { error } = await supabase.from('documents').delete().eq('id', docId)
  if (error) throw error
}
