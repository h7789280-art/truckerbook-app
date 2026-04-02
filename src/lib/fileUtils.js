import { supabase } from './supabase'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_IMAGE_WIDTH = 1920
const JPEG_QUALITY = 0.85

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]

const DAILY_LIMITS = {
  trial: 3,
  pro: 10,
  business: 10,
  business_pro: 10,
}

const STORAGE_LIMITS = {
  trial: 50 * 1024 * 1024,    // 50 MB
  pro: 500 * 1024 * 1024,     // 500 MB
  business: 500 * 1024 * 1024,
  business_pro: 500 * 1024 * 1024,
}

function getPlan(profile) {
  return profile?.plan || 'trial'
}

function compressImage(file, maxWidth = MAX_IMAGE_WIDTH, quality = JPEG_QUALITY) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/heic') {
      resolve(file)
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (img.width <= maxWidth) {
        resolve(file)
        return
      }
      const ratio = maxWidth / img.width
      const canvas = document.createElement('canvas')
      canvas.width = maxWidth
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const outputQuality = outputType === 'image/png' ? undefined : quality
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const compressed = new File([blob], file.name, { type: outputType, lastModified: Date.now() })
          resolve(compressed)
        },
        outputType,
        outputQuality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

async function getDailyUploadCount(userId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [docsRes, photosRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayISO),
    supabase
      .from('vehicle_photos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayISO),
  ])

  return (docsRes.count || 0) + (photosRes.count || 0)
}

async function getTotalStorageUsed(userId) {
  const [docsRes, photosRes] = await Promise.all([
    supabase
      .from('documents')
      .select('file_size')
      .eq('user_id', userId),
    supabase
      .from('vehicle_photos')
      .select('file_size')
      .eq('user_id', userId),
  ])

  const docsSize = (docsRes.data || []).reduce((sum, r) => sum + (r.file_size || 0), 0)
  const photosSize = (photosRes.data || []).reduce((sum, r) => sum + (r.file_size || 0), 0)
  return docsSize + photosSize
}

/**
 * Validates file and compresses if image > 1920px wide.
 * Returns { ok: true, file } or { ok: false, errorKey, errorParams }.
 * errorKey is an i18n key under fileUpload.*.
 */
export async function validateAndCompressFile(file, userId, profile) {
  // Fetch profile if not provided
  if (!profile && userId) {
    const { data } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single()
    profile = data
  }

  // 1. MIME type check
  const mimeType = file.type || ''
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { ok: false, errorKey: 'fileUpload.invalidType' }
  }

  // 2. File size check
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, errorKey: 'fileUpload.tooLarge', errorParams: { max: '5' } }
  }

  // 3. Daily limit check
  const plan = getPlan(profile)
  const dailyLimit = DAILY_LIMITS[plan] || DAILY_LIMITS.trial
  const dailyCount = await getDailyUploadCount(userId)
  if (dailyCount >= dailyLimit) {
    return {
      ok: false,
      errorKey: 'fileUpload.dailyLimit',
      errorParams: { used: String(dailyCount), max: String(dailyLimit) },
    }
  }

  // 4. Storage limit check
  const storageLimit = STORAGE_LIMITS[plan] || STORAGE_LIMITS.trial
  const storageUsed = await getTotalStorageUsed(userId)
  if (storageUsed + file.size > storageLimit) {
    const usedMB = Math.round(storageUsed / (1024 * 1024))
    const maxMB = Math.round(storageLimit / (1024 * 1024))
    return {
      ok: false,
      errorKey: 'fileUpload.storageFull',
      errorParams: { used: String(usedMB), max: String(maxMB) },
    }
  }

  // 5. Compress image if needed
  let processedFile = file
  if (mimeType.startsWith('image/')) {
    processedFile = await compressImage(file)
  }

  return { ok: true, file: processedFile }
}

export function interpolate(str, params) {
  if (!params) return str
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v), str)
}

export function formatStorageUsed(bytes) {
  const mb = bytes / (1024 * 1024)
  return mb < 1 ? mb.toFixed(1) : Math.round(mb)
}
