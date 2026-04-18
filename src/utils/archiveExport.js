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

function triggerDownload(blob, filename) {
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
  triggerDownload(content, fname)
  return { fileName: fname, size: content.size }
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
  triggerDownload(blob, fname)
  return { fileName: fname, size: blob.size }
}
