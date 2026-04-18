import { supabase } from './supabase'

// Unified archive helper. Every successful AI scan (receipts, part invoices,
// rate confirmations, BOLs) registers itself here so that the owner-operator
// has a single place to retrieve every document the IRS may ask about.
//
// Design principles:
//   1. Additive. Never throws — returns null on any failure and logs. Business
//      save paths must not break if archive write fails.
//   2. Accepts either a File (then uploads under the structured archive path)
//      OR an already-public URL (then just registers the metadata row).
//   3. Registration is atomic — one archive row per scanned photo, even if
//      the photo produced multiple business records (e.g. multi-line receipt).
//      Link to the first business row; follow-up query can JOIN if needed.

const ARCHIVE_BUCKET = 'receipts'

function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function yearMonth(dateStr) {
  if (dateStr && /^\d{4}-\d{2}/.test(dateStr)) return dateStr.slice(0, 7)
  return new Date().toISOString().slice(0, 7)
}

function retentionPlus3Years(docDate) {
  try {
    const base = docDate ? new Date(docDate + 'T00:00:00Z') : new Date()
    if (isNaN(base.getTime())) return null
    base.setUTCFullYear(base.getUTCFullYear() + 3)
    return base.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

function pickExt(file) {
  const name = file && file.name ? String(file.name) : ''
  if (name.includes('.')) {
    const ext = name.split('.').pop().toLowerCase()
    if (ext.length <= 5) return ext
  }
  const mime = file && file.type ? String(file.type) : ''
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic'
  return 'jpg'
}

// saveToArchive — see module header for rationale.
// Params:
//   docType     : one of 'receipt_fuel' | 'receipt_def' | 'receipt_hotel' |
//                 'receipt_food' | 'receipt_other' | 'part_invoice' |
//                 'trip_rateconf' | 'trip_bol' | 'other'
//   photoFile   : File object (optional if photoUrl is provided)
//   photoUrl    : string URL (optional if photoFile is provided)
//   ocrData     : { vendor, amount, date, raw_text, document_number, currency }
//   linkedTable : table name of the business record this document backs
//   linkedId    : uuid of the linked business record
//   vehicleId   : uuid of the vehicle (optional)
// Returns: { id, photo_url } on success, null on any failure.
export async function saveToArchive({
  docType,
  photoFile = null,
  photoUrl = null,
  ocrData = {},
  linkedTable = null,
  linkedId = null,
  vehicleId = null,
} = {}) {
  try {
    if (!docType) {
      console.warn('[archive] saveToArchive called without docType')
      return null
    }

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user) {
      console.warn('[archive] no auth user, skip')
      return null
    }
    const userId = auth.user.id

    // Auto-fill vehicle_id: caller may omit it. Fall back to the user's first
    // active vehicle so owner_operators always get their sole truck attached.
    let resolvedVehicleId = vehicleId || null
    if (!resolvedVehicleId) {
      try {
        const { data: veh } = await supabase
          .from('vehicles')
          .select('id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
        if (veh && veh.length > 0) resolvedVehicleId = veh[0].id
      } catch (e) {
        console.warn('[archive] vehicle auto-fill failed:', e)
      }
    }

    const docDate = ocrData?.date || null
    const ym = yearMonth(docDate)

    let finalUrl = photoUrl || null

    if (!finalUrl && photoFile) {
      const ext = pickExt(photoFile)
      const path = `${userId}/${docType}/${ym}/${randomUuid()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(ARCHIVE_BUCKET)
        .upload(path, photoFile, {
          contentType: photoFile.type || 'image/jpeg',
          upsert: false,
        })
      if (upErr) {
        console.error('[archive] storage upload failed:', upErr)
        return null
      }
      const { data: urlData } = supabase.storage.from(ARCHIVE_BUCKET).getPublicUrl(path)
      finalUrl = urlData?.publicUrl || null
    }

    if (!finalUrl) {
      console.warn('[archive] no photo url and no file — skip')
      return null
    }

    const amountNum = ocrData?.amount != null && ocrData.amount !== ''
      ? Number(ocrData.amount)
      : null

    const row = {
      user_id: userId,
      vehicle_id: resolvedVehicleId || null,
      doc_type: docType,
      linked_table: linkedTable || null,
      linked_id: linkedId || null,
      photo_url: finalUrl,
      vendor_name: ocrData?.vendor || null,
      document_number: ocrData?.document_number || null,
      document_date: docDate || null,
      amount: Number.isFinite(amountNum) ? amountNum : null,
      currency: ocrData?.currency || 'USD',
      ocr_raw_text: ocrData?.raw_text || null,
      retention_until: retentionPlus3Years(docDate),
    }

    const { data, error } = await supabase
      .from('documents_archive')
      .insert(row)
      .select()
    if (error) {
      console.error('[archive] insert failed:', error)
      return null
    }

    return { id: data?.[0]?.id || null, photo_url: finalUrl }
  } catch (err) {
    console.error('[archive] saveToArchive unexpected error:', err)
    return null
  }
}

// Map a receipt AI category (from ScanConfirm flow) to a doc_type value.
// Unknown / personal categories fall through to 'receipt_other'.
export function receiptDocType(aiCategory) {
  switch (aiCategory) {
    case 'fuel': return 'receipt_fuel'
    case 'def': return 'receipt_def'
    case 'hotel': return 'receipt_hotel'
    case 'food': return 'receipt_food'
    default: return 'receipt_other'
  }
}
