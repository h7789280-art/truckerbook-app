// Archive export utilities.
//
// Two formats are supported:
//   1. ZIP with photos grouped by doc_type + CSV index (for Excel/Sheets users)
//   2. Single PDF "binder" — cover page, registry table, one photo per page
//
// Both run entirely in the browser (JSZip + jsPDF). Photos are streamed from
// Supabase Storage via fetch → blob. Progress is reported through an optional
// onProgress callback and an AbortSignal can cancel mid-run.

const DEFAULT_IMAGE_EXT = 'jpg'

function normalizeLocale(lang) {
  const map = { ru: 'ru-RU', en: 'en-US', uk: 'uk-UA', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', tr: 'tr-TR', pl: 'pl-PL' }
  return map[lang] || 'en-US'
}

function formatDateForFile(iso) {
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10)
  return 'no-date'
}

function formatDateForDisplay(iso, locale) {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString(locale || 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

function sanitizeSlug(s) {
  if (!s) return ''
  return String(s)
    // replace any char outside safe set with underscore
    .replace(/[^A-Za-z0-9\u0400-\u04FF\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function fileExtFromUrl(url) {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\.([a-zA-Z0-9]{1,5})$/)
    if (m) return m[1].toLowerCase()
  } catch {}
  return DEFAULT_IMAGE_EXT
}

function formatMoney(amount, currency) {
  if (amount == null) return ''
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  const cur = currency || 'USD'
  const symbol = cur === 'USD' ? '$' : cur === 'EUR' ? '\u20AC' : cur === 'RUB' ? '\u20BD' : ''
  return symbol ? symbol + n.toFixed(2) : n.toFixed(2) + ' ' + cur
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  }
}

async function fetchBlob(url, signal) {
  const resp = await fetch(url, { signal })
  if (!resp.ok) throw new Error('photo fetch failed: ' + resp.status)
  return await resp.blob()
}

// Load a blob into an HTMLImageElement and return { dataUrl, width, height }.
// The image is redrawn onto a canvas and exported as JPEG at ~0.82 quality,
// rescaled so the longer edge is at most `maxLongEdge` px. This keeps PDF file
// size reasonable and applies EXIF rotation (browsers do it automatically when
// the image is drawn to a canvas).
async function blobToSizedJpegDataUrl(blob, maxLongEdge = 1400) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = (e) => reject(e)
      i.src = objectUrl
    })
    const srcW = img.naturalWidth || img.width
    const srcH = img.naturalHeight || img.height
    if (!srcW || !srcH) throw new Error('invalid image dimensions')
    const scale = Math.min(1, maxLongEdge / Math.max(srcW, srcH))
    const dstW = Math.max(1, Math.round(srcW * scale))
    const dstH = Math.max(1, Math.round(srcH * scale))
    const canvas = document.createElement('canvas')
    canvas.width = dstW
    canvas.height = dstH
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dstW, dstH)
    ctx.drawImage(img, 0, 0, dstW, dstH)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    return { dataUrl, width: dstW, height: dstH }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// Hand the generated file to the user.
//
// On iOS Safari, <a download> opens the blob in a new tab that's unreachable
// after close — the only reliable way to save is the Web Share API ("Save to
// Files"). On Android/desktop, <a download> works fine and avoids dumping the
// user into a share sheet where they might accidentally pick Telegram or mail.
//
// Returns:
//   { shared: true }                 — user was shown the share sheet and did not cancel
//   { shared: false, cancelled }     — user dismissed the share sheet
//   { shared: false, downloaded }    — fallback path (Android/desktop/old browsers)
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true
  // iPadOS 13+ reports as Mac but exposes touch — treat as iOS so share sheet is used
  if (ua.includes('Macintosh') && navigator.maxTouchPoints > 1) return true
  return false
}

async function shareOrDownload(blob, filename, mimeType) {
  const file = new File([blob], filename, { type: mimeType })

  if (isIOSDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return { shared: true }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { shared: false, cancelled: true }
      }
      console.warn('[archiveExport] share failed, falling back to download:', err)
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    try { document.body.removeChild(a) } catch {}
    URL.revokeObjectURL(url)
  }, 500)
  return { shared: false, downloaded: true }
}

// ---------------------------------------------------------------------------
// ZIP (photos + CSV)
// ---------------------------------------------------------------------------
//
// Structure:
//   receipt_fuel/
//     2026-01-15_Pilot_245.00.jpg
//   receipt_hotel/
//     2026-02-03_Motel6_89.00.jpg
//   index.csv
export async function exportArchiveZip({ docs, filterSlug, labels, lang, onProgress, signal } = {}) {
  if (!docs || docs.length === 0) return null
  throwIfAborted(signal)

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const locale = normalizeLocale(lang)

  const total = docs.length
  let processed = 0
  if (onProgress) onProgress(0, total)

  // CSV header
  const csvLines = [
    [
      labels.csvDate,
      labels.csvType,
      labels.csvVendor,
      labels.csvNumber,
      labels.csvAmount,
      labels.csvCurrency,
      labels.csvRetention,
      labels.csvFile,
    ].map(csvEscape).join(','),
  ]

  // de-dup filenames inside the same folder
  const usedNames = new Map()

  for (const doc of docs) {
    throwIfAborted(signal)

    const docType = doc.doc_type || 'other'
    const datePart = formatDateForFile(doc.document_date)
    const vendorPart = sanitizeSlug(doc.vendor_name) || 'doc'
    const amountPart = doc.amount != null && Number.isFinite(Number(doc.amount))
      ? Number(doc.amount).toFixed(2)
      : ''
    const ext = fileExtFromUrl(doc.photo_url || '')
    const baseName = [datePart, vendorPart, amountPart].filter(Boolean).join('_')
    let name = baseName + '.' + ext
    const folderKey = docType + '/'
    const folderName = docType
    const usedKey = folderKey + name
    if (usedNames.has(usedKey)) {
      const n = usedNames.get(usedKey) + 1
      usedNames.set(usedKey, n)
      name = baseName + '_' + n + '.' + ext
    } else {
      usedNames.set(usedKey, 1)
    }

    const zipPath = folderName + '/' + name

    let added = false
    if (doc.photo_url) {
      try {
        const blob = await fetchBlob(doc.photo_url, signal)
        zip.file(zipPath, blob)
        added = true
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        console.warn('[archiveExport] skip photo', doc.id, err)
      }
    }

    csvLines.push([
      formatDateForDisplay(doc.document_date, locale),
      labels.docTypeLabels[doc.doc_type] || doc.doc_type || '',
      doc.vendor_name || '',
      doc.document_number || '',
      doc.amount != null ? Number(doc.amount).toFixed(2) : '',
      doc.currency || '',
      formatDateForDisplay(doc.retention_until, locale),
      added ? zipPath : '',
    ].map(csvEscape).join(','))

    processed += 1
    if (onProgress) onProgress(processed, total)
  }

  // BOM for Excel compatibility with UTF-8
  const csvContent = '\uFEFF' + csvLines.join('\r\n')
  zip.file('index.csv', csvContent)

  throwIfAborted(signal)
  const content = await zip.generateAsync({ type: 'blob' })
  const fname = 'documents_' + (filterSlug || 'export') + '.zip'
  const delivery = await shareOrDownload(content, fname, 'application/zip')
  return { fileName: fname, size: content.size, ...delivery }
}

// ---------------------------------------------------------------------------
// Excel (XLSX) — single sheet with embedded photos in the last column
// ---------------------------------------------------------------------------
//
// Bold frozen header row, autoWidth columns. For every row whose document has
// a photo we stream the image, shrink it to ~600px long edge JPEG, and embed
// it anchored to the "Photo" column of that row. Rows with photos get 90pt
// height; rows without a photo keep the default height. Photo downloads run
// in parallel (max 10 concurrent); individual failures are logged and
// skipped so one 404 doesn't break the whole export.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return results
}

export async function exportArchiveExcel({ docs, filterSlug, labels, lang, onProgress, signal } = {}) {
  if (!docs || docs.length === 0) return null
  throwIfAborted(signal)

  const ExcelJS = (await import('exceljs')).default
  const locale = normalizeLocale(lang)

  const headers = [
    labels.csvDate,
    labels.csvType,
    labels.csvVendor,
    labels.csvNumber,
    labels.csvAmount,
    labels.csvCurrency,
    labels.csvRetention,
    labels.csvFile,
    labels.csvPhoto || 'Photo',
  ]

  const rows = docs.map((d) => {
    const datePart = formatDateForFile(d.document_date)
    const vendorPart = sanitizeSlug(d.vendor_name) || 'doc'
    const amountPart = d.amount != null && Number.isFinite(Number(d.amount))
      ? Number(d.amount).toFixed(2)
      : ''
    const ext = fileExtFromUrl(d.photo_url || '')
    const fileName = d.photo_url
      ? [datePart, vendorPart, amountPart].filter(Boolean).join('_') + '.' + ext
      : ''
    return [
      formatDateForDisplay(d.document_date, locale),
      labels.docTypeLabels[d.doc_type] || d.doc_type || '',
      d.vendor_name || '',
      d.document_number || '',
      d.amount != null ? Number(d.amount) : '',
      d.currency || '',
      formatDateForDisplay(d.retention_until, locale),
      fileName,
      '',
    ]
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Archive', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.addRow(headers)
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }

  for (const row of rows) ws.addRow(row)

  // Autowidth (capped 10..50). Photo column fixed at 18.
  ws.columns = headers.map((h, c) => {
    if (c === headers.length - 1) return { width: 18 }
    let max = String(h || '').length
    for (const row of rows) {
      const v = row[c]
      const len = v == null ? 0 : String(v).length
      if (len > max) max = len
    }
    return { width: Math.max(10, Math.min(max + 2, 50)) }
  })

  // Collect rows with photos and download them with bounded concurrency.
  // Documents store the public URL in `photo_url` (same field the PDF export
  // uses successfully) — see ArchiveScreen / documentsArchive.js. If this is
  // ever renamed, update the PDF export in lockstep.
  const photoTasks = []
  docs.forEach((d, i) => {
    if (d.photo_url) photoTasks.push({ url: d.photo_url, rowIdx: i, docId: d.id, field: 'photo_url' })
  })
  const totalPhotos = photoTasks.length
  if (onProgress) onProgress(0, totalPhotos)

  let loaded = 0
  await mapWithConcurrency(photoTasks, 10, async (task) => {
    throwIfAborted(signal)
    try {
      const resp = await fetch(task.url, { signal })
      console.log('[archiveExport] xlsx fetch', task.docId, { field: task.field, status: resp.status, ok: resp.ok })
      if (!resp.ok) {
        console.warn('[archiveExport] xlsx photo fetch failed', task.docId, resp.status)
        return
      }
      const mimeType = (resp.headers.get('content-type') || '').toLowerCase()
      const blob = await resp.blob()
      if (blob.size === 0) {
        console.warn('[archiveExport] xlsx photo empty blob', task.docId, { mime: mimeType })
        return
      }
      // Re-encode via canvas → JPEG (applies EXIF rotation, caps size).
      const { dataUrl } = await blobToSizedJpegDataUrl(blob, 600)
      const commaIdx = dataUrl.indexOf(',')
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : ''
      if (!base64) {
        console.warn('[archiveExport] xlsx photo no base64 payload', task.docId)
        return
      }
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      if (bytes.byteLength === 0) {
        console.warn('[archiveExport] xlsx photo empty ArrayBuffer, skipping', task.docId)
        return
      }
      console.log('[archiveExport] xlsx addImage', task.docId, { sourceMime: mimeType, bytes: bytes.byteLength })
      // exceljs in the browser is more reliable with a raw buffer than base64.
      // We always emit JPEG because blobToSizedJpegDataUrl re-encodes on a
      // canvas, regardless of the source MIME (PNG/HEIC/WebP all become JPEG).
      const imageId = wb.addImage({ buffer: bytes.buffer, extension: 'jpeg' })
      // Header is worksheet row 1. Data row N (0-based) sits at worksheet row
      // N+2. exceljs tl.row is 0-based "line before row", so row N+2 starts
      // at line N+1.
      ws.addImage(imageId, {
        tl: { col: 8, row: task.rowIdx + 1 },
        ext: { width: 120, height: 120 },
      })
      ws.getRow(task.rowIdx + 2).height = 90
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      console.warn('[archiveExport] xlsx photo skip', task.docId, err)
    } finally {
      loaded += 1
      if (onProgress) onProgress(loaded, totalPhotos)
    }
  })

  throwIfAborted(signal)
  const arrayBuffer = await wb.xlsx.writeBuffer()
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const blob = new Blob([arrayBuffer], { type: mime })
  const fname = 'archive_' + (filterSlug || 'export') + '.xlsx'

  const delivery = await shareOrDownload(blob, fname, mime)
  return { fileName: fname, size: blob.size, ...delivery }
}

// ---------------------------------------------------------------------------
// PDF binder
// ---------------------------------------------------------------------------
export async function exportArchivePdf({ docs, filterSlug, labels, meta, lang, onProgress, signal } = {}) {
  if (!docs || docs.length === 0) return null
  throwIfAborted(signal)

  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { robotoRegularBase64, robotoBoldBase64 } = await import('./roboto-font.js')

  const locale = normalizeLocale(lang)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginL = 14
  const marginR = 14
  const contentW = pageW - marginL - marginR

  const totalAmount = docs.reduce((acc, d) => acc + (Number(d.amount) || 0), 0)
  const currency = docs.find(d => d.currency)?.currency || 'USD'
  const totalAmountStr = formatMoney(totalAmount, currency)

  // ================= Cover page =================
  let y = 22

  doc.setFillColor(245, 158, 11)
  doc.rect(marginL, y - 4, contentW, 1.2, 'F')
  y += 6

  doc.setFont('Roboto', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(20, 20, 20)
  doc.text('\uD83D\uDCC1 ' + labels.pdfTitle, marginL, y)
  y += 14

  doc.setFont('Roboto', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(90, 90, 90)

  const coverRows = [
    [labels.pdfPeriod, meta.periodText],
    [labels.pdfType, meta.typeText],
    [labels.pdfTotalDocs, String(docs.length)],
    [labels.pdfTotalSum, totalAmountStr],
    [labels.pdfOwner, meta.ownerName || '\u2014'],
    [labels.pdfGeneratedAt, new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })],
  ]

  for (const [label, value] of coverRows) {
    doc.setFont('Roboto', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.setFontSize(10)
    doc.text(label, marginL, y)
    doc.setFont('Roboto', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(12)
    const valueStr = value == null ? '\u2014' : String(value)
    const wrapped = doc.splitTextToSize(valueStr, contentW - 45)
    doc.text(wrapped, marginL + 45, y)
    y += Math.max(9, wrapped.length * 6)
  }

  // Disclaimer at bottom of cover page
  const disclaimerY = pageH - 28
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  const disclaimerLines = doc.splitTextToSize(labels.pdfDisclaimer, contentW)
  doc.text(disclaimerLines, marginL, disclaimerY)

  // ================= Registry page(s) =================
  doc.addPage()
  y = 20
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(20, 20, 20)
  doc.text(labels.pdfRegistry, marginL, y)
  y += 8

  const registryBody = docs.map((d, idx) => [
    String(idx + 1),
    formatDateForDisplay(d.document_date, locale),
    labels.docTypeLabels[d.doc_type] || d.doc_type || '',
    d.vendor_name || '\u2014',
    d.amount != null ? formatMoney(d.amount, d.currency || currency) : '\u2014',
    d.document_number || '\u2014',
  ])

  autoTable(doc, {
    startY: y,
    head: [[
      labels.colNum,
      labels.colDate,
      labels.colType,
      labels.colVendor,
      labels.colAmount,
      labels.colNumber,
    ]],
    body: registryBody,
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
      overflow: 'linebreak',
      font: 'Roboto',
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [245, 158, 11],
      textColor: 255,
      fontStyle: 'bold',
      font: 'Roboto',
      fontSize: 9,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'left', cellWidth: 38 },
      3: { halign: 'left' },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 26 },
    },
    margin: { left: marginL, right: marginR },
  })

  const tableEndY = doc.lastAutoTable?.finalY || y
  let subtotalY = tableEndY + 8
  if (subtotalY > pageH - 20) {
    doc.addPage()
    subtotalY = 20
  }
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  const subtotalLine = labels.pdfRegistryTotal
    .replace('{n}', String(docs.length))
    .replace('{total}', totalAmountStr)
  doc.text(subtotalLine, marginL, subtotalY)

  // ================= One page per document =================
  const total = docs.length
  let processed = 0
  if (onProgress) onProgress(0, total)

  for (let i = 0; i < docs.length; i++) {
    throwIfAborted(signal)
    const d = docs[i]
    doc.addPage()
    let py = 18

    const typeLabel = labels.docTypeLabels[d.doc_type] || d.doc_type || ''
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    const title = labels.pdfDocNumber.replace('{i}', String(i + 1))
    doc.text(title, marginL, py)
    py += 6

    doc.setFont('Roboto', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(90, 90, 90)
    const captionParts = [
      formatDateForDisplay(d.document_date, locale),
      d.vendor_name,
      d.amount != null ? formatMoney(d.amount, d.currency || currency) : null,
      typeLabel,
    ].filter(Boolean)
    const captionLines = doc.splitTextToSize(captionParts.join(' \u00B7 '), contentW)
    doc.text(captionLines, marginL, py)
    py += captionLines.length * 5 + 4

    const availableH = pageH - py - 14
    if (d.photo_url) {
      try {
        const blob = await fetchBlob(d.photo_url, signal)
        const { dataUrl, width, height } = await blobToSizedJpegDataUrl(blob, 1400)
        const aspect = width / height
        let drawW = contentW
        let drawH = drawW / aspect
        if (drawH > availableH) {
          drawH = availableH
          drawW = drawH * aspect
        }
        const drawX = marginL + (contentW - drawW) / 2
        doc.addImage(dataUrl, 'JPEG', drawX, py, drawW, drawH, undefined, 'FAST')
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        console.warn('[archiveExport] pdf photo skip', d.id, err)
        doc.setFont('Roboto', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(150, 150, 150)
        doc.text('\u2014', marginL, py + 10)
      }
    }

    processed += 1
    if (onProgress) onProgress(processed, total)
  }

  throwIfAborted(signal)

  const fname = 'archive_' + (filterSlug || 'export') + '.pdf'
  const blob = doc.output('blob')
  const delivery = await shareOrDownload(blob, fname, 'application/pdf')
  return { fileName: fname, size: blob.size, ...delivery }
}
