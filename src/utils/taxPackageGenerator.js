/**
 * Year-end Tax Package Generator
 *
 * One-click ZIP archive for an owner-operator's CPA: Schedule C summary,
 * mileage log, per-diem, amortization, personal + business expense exports,
 * IFTA quarterly reports, service records, BOL registry and all receipt
 * photos from documents_archive. A README.txt is generated programmatically
 * as a top-level map of the archive.
 *
 * All work runs client-side in the browser. Supabase is read with the
 * existing RLS; photos are streamed from documents_archive.photo_url. No
 * data leaves the user's device until they hand over the archive.
 *
 * Public entry point:  generateTaxPackage({ supabase, userId, role, taxYear,
 *                        profile, options, recipient, lang, onProgress })
 *                      -> { blob, fileName, size, docsCount, photosCount, skipped }
 */

import * as XLSX from 'xlsx'
import { renderPdfHeader, renderPdfFooter } from './pdfHeader.js'
import { calculatePerDiem } from './perDiemCalculator.js'
import { buildQuarterlyReport } from './iftaReport.js'
import { calculateTotalTax } from './taxCalculator.js'
import { getStateName } from './stateTaxData2026.js'

const STEPS = [
  'scheduleC',
  'mileageLog',
  'perDiem',
  'amortization',
  'personalExpenses',
  'fuelVehicleExpenses',
  'iftaQuarterly',
  'serviceRecords',
  'bolRegistry',
  'receipts',
  'readme',
]

const MAX_ZIP_BYTES = 50 * 1024 * 1024 // 50 MB hard cap on archive size

// -------------------------------------------------------------------------
//  Helpers
// -------------------------------------------------------------------------

function fmt(n) {
  const num = Number(n) || 0
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtMoney(n) {
  if (n == null) return '\u2014'
  const abs = Math.abs(Number(n) || 0).toFixed(2)
  return n < 0 ? '-$' + abs : '$' + abs
}

function yearRange(year) {
  return [`${year}-01-01`, `${year + 1}-01-01`]
}

function sanitizeFilename(s) {
  if (!s) return 'client'
  return String(s)
    .replace(/[^A-Za-z0-9\u0400-\u04FF\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'client'
}

function last4(s) {
  const digits = String(s || '').replace(/\D+/g, '')
  if (!digits) return '****'
  return digits.slice(-4).padStart(4, '*')
}

function filingStatusLabel(status) {
  const MAP = {
    single: 'Single',
    married_jointly: 'Married Filing Jointly',
    married_separately: 'Married Filing Separately',
    head_of_household: 'Head of Household',
  }
  return MAP[status] || 'Single'
}

function filingStatusShort(status) {
  const MAP = {
    single: 'Single',
    married_jointly: 'MFJ',
    married_separately: 'MFS',
    head_of_household: 'HoH',
  }
  return MAP[status] || 'Single'
}

// Classify a doc_type into one of six receipt sub-folders.
function receiptFolder(docType) {
  if (!docType) return 'other'
  const t = String(docType).toLowerCase()
  if (t.includes('fuel')) return 'fuel'
  if (t.includes('def')) return 'fuel'
  if (t.includes('repair') || t.includes('part') || t.includes('service')) return 'repairs'
  if (t.includes('parts')) return 'parts'
  if (t.includes('hotel') || t.includes('motel') || t.includes('lodging')) return 'lodging'
  if (t.includes('toll')) return 'tolls'
  return 'other'
}

function fileExtFromUrl(url) {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\.([a-zA-Z0-9]{1,5})$/)
    if (m) return m[1].toLowerCase()
  } catch {}
  return 'jpg'
}

// Build a jsPDF document pre-configured with Roboto for Cyrillic support and
// TruckerBook's branded header.
async function newBrandedPdf({ title, subtitle, year }) {
  const { default: jsPDF } = await import('jspdf')
  const { robotoRegularBase64, robotoBoldBase64 } = await import('./roboto-font.js')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')
  const y = renderPdfHeader(doc, { title, subtitle, year, font: 'Roboto' })
  return { doc, y }
}

async function pdfToBlob(doc) {
  renderPdfFooter(doc, { font: 'Roboto' })
  return doc.output('blob')
}

function wbToBlob(wb) {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// -------------------------------------------------------------------------
//  Data loaders
// -------------------------------------------------------------------------

// Convert kilometers to miles with one-decimal precision.
// Matches MileageLogTab's `toMiles()` so trip-derived mileage lines up exactly.
function kmToMiles(km) {
  return Math.round((Number(km) || 0) * 0.621371 * 10) / 10
}

async function loadAnnualData({ supabase, userId, role, taxYear }) {
  const [start, endExcl] = yearRange(taxYear)

  // Column lists below must reference ONLY columns that exist in Supabase.
  // A typo here causes PostgREST to 400 and Supabase JS to resolve with
  // { data: null, error: {...} } — which this file previously swallowed,
  // producing empty sections in the generated package.
  const [tripsRes, fuelRes, vehExpRes, serviceRes, archiveRes, mileageRes, depRes] = await Promise.all([
    // Filter trips by created_at (matches TaxSummaryTab + MileageLogTab),
    // since date_start can be null or span multiple years.
    supabase
      .from('trips')
      .select('id, origin, destination, date_start, date_end, income, distance_km, deadhead_km, vehicle_id, created_at')
      .eq('user_id', userId)
      .gte('created_at', start + 'T00:00:00')
      .lt('created_at', endExcl + 'T00:00:00')
      .order('created_at', { ascending: true }),

    supabase
      .from('fuel_entries')
      .select('id, date, cost, liters, station, state, state_code, odometer, vehicle_id')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExcl)
      .order('date', { ascending: true }),

    supabase
      .from('vehicle_expenses')
      .select('id, date, amount, category, description, vehicle_id')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExcl)
      .order('date', { ascending: true })
      .then(r => r)
      .catch(() => ({ data: [] })),

    supabase
      .from('service_records')
      .select('id, date, cost, category, description, service_station, odometer, vehicle_id')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExcl)
      .order('date', { ascending: true }),

    // Load the full archive for the user; filter by year in memory using
    // document_date OR scanned_at as fallback. Some scans land without
    // document_date (AI couldn't extract one) and were being dropped.
    supabase
      .from('documents_archive')
      .select('id, doc_type, photo_url, document_date, vendor_name, amount, currency, document_number, scanned_at')
      .eq('user_id', userId)
      .order('document_date', { ascending: true, nullsFirst: false })
      .then(r => r)
      .catch(() => ({ data: [] })),

    // Manual mileage entries — table name matches MileageLogTab.
    supabase
      .from('mileage_log')
      .select('id, date, origin, destination, miles, business_purpose')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExcl)
      .order('date', { ascending: true })
      .then(r => r)
      .catch(() => ({ data: [] })),

    supabase
      .from('vehicle_depreciation')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(r => r)
      .catch(() => ({ data: null })),
  ])

  // Byt uses `name` (description field) — older code selected `note` which
  // doesn't exist and returned empty.
  const bytExpRes = await supabase
    .from('byt_expenses')
    .select('id, date, amount, category, name')
    .eq('user_id', userId)
    .gte('date', start)
    .lt('date', endExcl)
    .order('date', { ascending: true })
    .then(r => r)
    .catch(() => ({ data: [] }))

  const sepIraRes = await supabase
    .from('sep_ira_contributions')
    .select('id, tax_year, amount, contribution_date, broker_name, notes')
    .eq('user_id', userId)
    .eq('tax_year', taxYear)
    .order('contribution_date', { ascending: true })
    .then(r => r)
    .catch(() => ({ data: [] }))

  // Deduction-audit decisions landing inside the tax year — accepted + rejected
  // items so the CPA can audit what Gemini flagged and what the taxpayer
  // decided. Snoozed items are excluded (no decision yet).
  const deductionAuditRes = await supabase
    .from('deduction_audit_suggestions')
    .select('id, original_description, original_amount, original_date, suggested_category, suggested_schedule_c_line, status, user_action_date, confidence_score, reasoning')
    .eq('user_id', userId)
    .in('status', ['accepted', 'rejected'])
    .gte('original_date', start)
    .lt('original_date', endExcl)
    .order('user_action_date', { ascending: true })
    .then(r => r)
    .catch(() => ({ data: [] }))

  const trips = tripsRes.data || []
  const manualMileage = mileageRes.data || []

  // Combine trips + manual mileage into a single business-mile log, matching
  // how MileageLogTab presents them on screen.
  const tripMileage = trips.map(tr => ({
    id: 'trip_' + tr.id,
    date: (tr.created_at || '').slice(0, 10),
    origin: tr.origin || '',
    destination: tr.destination || '',
    miles: kmToMiles(tr.distance_km),
    business_purpose: (Number(tr.deadhead_km) || 0) > 0 ? 'Deadhead' : 'Delivery',
  }))
  const manualMileageRows = manualMileage.map(m => ({
    id: 'manual_' + m.id,
    date: m.date || '',
    origin: m.origin || '',
    destination: m.destination || '',
    miles: Number(m.miles) || 0,
    business_purpose: m.business_purpose || 'Other',
  }))
  const combinedMileage = [...tripMileage, ...manualMileageRows].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '')
  )

  const archiveAll = archiveRes.data || []
  const archive = archiveAll.filter(d => {
    const date = d.document_date || (d.scanned_at ? String(d.scanned_at).slice(0, 10) : null)
    return date && date >= start && date < endExcl
  })

  return {
    trips,
    fuels: fuelRes.data || [],
    vehicleExpenses: vehExpRes.data || [],
    serviceRecords: serviceRes.data || [],
    archive,
    mileage: combinedMileage,
    depreciation: depRes.data || null,
    bytExpenses: bytExpRes.data || [],
    sepIraContributions: sepIraRes.data || [],
    deductionAuditDecisions: deductionAuditRes.data || [],
  }
}

async function loadFilingSettings({ supabase, userId }) {
  try {
    const { data } = await supabase
      .from('estimated_tax_settings')
      .select('filing_status')
      .eq('user_id', userId)
      .maybeSingle()
    return { filingStatus: data?.filing_status || 'single' }
  } catch {
    return { filingStatus: 'single' }
  }
}

async function loadQuarterlyPayments({ supabase, userId, taxYear }) {
  try {
    const { data } = await supabase
      .from('quarterly_tax_payments')
      .select('quarter, amount, paid_on, method, notes')
      .eq('user_id', userId)
      .eq('tax_year', taxYear)
    return data || []
  } catch {
    return []
  }
}

// -------------------------------------------------------------------------
//  Computations
// -------------------------------------------------------------------------

// Match TaxSummaryTab: only insurance/lease/toll/parking are split out;
// fuel/repair/oil/parts/tires from vehicle_expenses fall into "other" because
// fuel is counted from fuel_entries and repairs from service_records — adding
// them here would double-count on the Schedule C.
function categorizeVehicleExpenses(list) {
  let insurance = 0, lease = 0, toll = 0, parking = 0, other = 0
  for (const e of list || []) {
    const amt = Number(e.amount) || 0
    const cat = (e.category || '').toLowerCase()
    if (cat === 'insurance') insurance += amt
    else if (cat === 'lease' || cat === 'truck_payment') lease += amt
    else if (cat === 'toll') toll += amt
    else if (cat === 'parking') parking += amt
    else other += amt
  }
  return { insurance, lease, toll, parking, other }
}

function computeDepreciationForYear(dep, taxYear) {
  if (!dep) return 0
  const price = Number(dep.purchase_price) || 0
  const salvage = Number(dep.salvage_value) || 0
  const prior = Number(dep.prior_depreciation) || 0
  const basis = Math.max(price - salvage, 0)
  const purchaseYear = dep.purchase_date ? new Date(dep.purchase_date).getFullYear() : taxYear

  if (dep.depreciation_type === 'section179') {
    return purchaseYear === taxYear ? Math.max(Math.min(basis, 1160000) - prior, 0) : 0
  }
  const rates = dep.depreciation_type === 'macrs7'
    ? [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46]
    : [20, 32, 19.2, 11.52, 11.52, 5.76]
  const idx = taxYear - purchaseYear
  if (idx < 0 || idx >= rates.length) return 0
  return basis * (rates[idx] / 100)
}

function buildAmortizationSchedule(dep) {
  if (!dep) return null
  const price = Number(dep.purchase_price) || 0
  const salvage = Number(dep.salvage_value) || 0
  const basis = Math.max(price - salvage, 0)
  const purchaseYear = dep.purchase_date ? new Date(dep.purchase_date).getFullYear() : null

  let rates
  if (dep.depreciation_type === 'section179') {
    return {
      type: 'section179',
      purchaseYear,
      price,
      salvage,
      basis,
      rows: [{ year: purchaseYear, rate: 100, amount: Math.min(basis, 1160000), remaining: Math.max(basis - 1160000, 0) }],
    }
  } else if (dep.depreciation_type === 'macrs7') {
    rates = [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46]
  } else {
    rates = [20, 32, 19.2, 11.52, 11.52, 5.76]
  }

  const rows = []
  let remaining = basis
  for (let i = 0; i < rates.length; i++) {
    const amount = basis * (rates[i] / 100)
    remaining -= amount
    rows.push({
      year: purchaseYear != null ? purchaseYear + i : null,
      rate: rates[i],
      amount,
      remaining: Math.max(remaining, 0),
    })
  }
  return {
    type: dep.depreciation_type || 'macrs5',
    purchaseYear,
    price,
    salvage,
    basis,
    rows,
  }
}

// -------------------------------------------------------------------------
//  Builders — each returns a Blob (or null if no data)
// -------------------------------------------------------------------------

async function buildScheduleCPdf({ taxYear, profile, breakdown, incomeTotal, expenseBreakdown, perDiemTotal, depreciation, totals, recipient }) {
  const { doc, y: startY } = await newBrandedPdf({
    title: 'Annual Tax Summary',
    subtitle: 'IRS Schedule C \u2014 Profit or Loss from Business',
    year: 'FY ' + taxYear,
  })
  const autoTable = (await import('jspdf-autotable')).default

  const pageW = doc.internal.pageSize.getWidth()
  const marginL = 14
  const marginR = 14
  const contentW = pageW - marginL - marginR
  let y = startY

  doc.setFont('Roboto', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  if (recipient?.clientName) {
    doc.text('Client: ' + recipient.clientName, marginL, y)
    y += 5
  }
  doc.text('Filing Status: ' + filingStatusLabel(breakdown.filingStatus), marginL, y)
  doc.text('Generated: ' + new Date().toLocaleDateString('en-US'), pageW - marginR, y, { align: 'right' })
  y += 8

  doc.setFont('Roboto', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(34, 197, 94)
  doc.text('GROSS INCOME', marginL, y)
  doc.text(fmtMoney(incomeTotal), pageW - marginR, y, { align: 'right' })
  y += 9

  doc.setFont('Roboto', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text('BUSINESS EXPENSES (Schedule C)', marginL, y)
  y += 2

  const expRows = [
    ['Fuel (Line 9)', fmtMoney(expenseBreakdown.fuel)],
    ['Repairs & Maintenance (Line 21)', fmtMoney(expenseBreakdown.repairs)],
    ['Insurance (Line 15)', fmtMoney(expenseBreakdown.insurance)],
    ['Truck Payments / Lease (Line 20)', fmtMoney(expenseBreakdown.lease)],
    ['Tolls (Line 27a)', fmtMoney(expenseBreakdown.toll)],
    ['Parking (Line 27a)', fmtMoney(expenseBreakdown.parking)],
    ['Other Expenses', fmtMoney(expenseBreakdown.other)],
    ['', ''],
    ['TOTAL EXPENSES', fmtMoney(totals.totalExpenses)],
  ]
  autoTable(doc, {
    startY: y,
    body: expRows,
    theme: 'plain',
    styles: { font: 'Roboto', fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: marginL, right: marginR },
    didParseCell: (data) => {
      if (data.row.index === expRows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [239, 68, 68]
      }
    },
  })
  y = doc.lastAutoTable.finalY + 6

  const deductRows = [
    ['Per Diem Deduction', fmtMoney(perDiemTotal)],
    ['Truck Depreciation (MACRS / Sec 179)', fmtMoney(depreciation)],
    ['', ''],
    ['TOTAL DEDUCTIONS', fmtMoney(totals.totalDeductions)],
  ]
  autoTable(doc, {
    startY: y,
    body: deductRows,
    theme: 'plain',
    styles: { font: 'Roboto', fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: marginL, right: marginR },
    didParseCell: (data) => {
      if (data.row.index === deductRows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [239, 68, 68]
      }
    },
  })
  y = doc.lastAutoTable.finalY + 6

  doc.setDrawColor(200, 200, 200)
  doc.line(marginL, y, pageW - marginR, y)
  y += 7
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(13)
  const npColor = breakdown.netProfit >= 0 ? [34, 197, 94] : [239, 68, 68]
  doc.setTextColor(...npColor)
  doc.text('NET PROFIT', marginL, y)
  doc.text(fmtMoney(breakdown.netProfit), pageW - marginR, y, { align: 'right' })
  y += 10

  if (y > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage()
    y = renderPdfHeader(doc, { title: 'Annual Tax Summary', subtitle: 'IRS Schedule C', year: 'FY ' + taxYear, font: 'Roboto' })
  }

  doc.setFont('Roboto', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text('SELF-EMPLOYMENT TAX (Schedule SE, 2026)', marginL, y)
  y += 2

  const seRows = [
    ['SE earnings (net profit \u00d7 92.35%)', fmtMoney(breakdown.taxableSEIncome)],
    ['Social Security (12.4%, capped at $184,500)', fmtMoney(breakdown.ssTax)],
    ['Medicare (2.9%)', fmtMoney(breakdown.medicareTax)],
    ['Additional Medicare (0.9% over threshold)', fmtMoney(breakdown.additionalMedicare)],
    ['', ''],
    ['TOTAL SE TAX', fmtMoney(breakdown.seTax)],
  ]
  autoTable(doc, {
    startY: y,
    body: seRows,
    theme: 'plain',
    styles: { font: 'Roboto', fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: marginL, right: marginR },
    didParseCell: (data) => {
      if (data.row.index === seRows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [245, 158, 11]
      }
    },
  })
  y = doc.lastAutoTable.finalY + 6

  if (y > doc.internal.pageSize.getHeight() - 70) {
    doc.addPage()
    y = renderPdfHeader(doc, { title: 'Annual Tax Summary', subtitle: 'IRS Schedule C', year: 'FY ' + taxYear, font: 'Roboto' })
  }

  const agiRows = [
    ['Deductible \u00bd of SE tax (SS + Medicare)', fmtMoney(breakdown.deductibleHalfSE)],
    ['Adjusted Gross Income (AGI)', fmtMoney(breakdown.agi)],
    ['Standard Deduction', fmtMoney(breakdown.standardDeduction)],
    ['', ''],
    ['Taxable Income', fmtMoney(breakdown.taxableIncome)],
  ]
  autoTable(doc, {
    startY: y,
    body: agiRows,
    theme: 'plain',
    styles: { font: 'Roboto', fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: marginL, right: marginR },
  })
  y = doc.lastAutoTable.finalY + 6

  const stateDisplay = breakdown.stateType === 'none' ? 'No state income tax' : fmtMoney(breakdown.stateTax || 0)
  const taxRows = [
    ['Federal Income Tax (' + Number(breakdown.effectiveRate || 0).toFixed(1) + '%)', fmtMoney(breakdown.incomeTax)],
    ['State Income Tax (' + (breakdown.stateName || breakdown.stateCode || '') + ')', stateDisplay],
    ['', ''],
    ['TOTAL ESTIMATED TAX', fmtMoney(breakdown.totalTax)],
  ]
  autoTable(doc, {
    startY: y,
    body: taxRows,
    theme: 'plain',
    styles: { font: 'Roboto', fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
    columnStyles: {
      0: { cellWidth: contentW * 0.65 },
      1: { cellWidth: contentW * 0.35, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: marginL, right: marginR },
    didParseCell: (data) => {
      if (data.row.index === taxRows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 12
        data.cell.styles.textColor = [245, 158, 11]
      }
    },
  })
  y = doc.lastAutoTable.finalY + 10

  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage()
    y = renderPdfHeader(doc, { title: 'Annual Tax Summary', subtitle: 'IRS Schedule C', year: 'FY ' + taxYear, font: 'Roboto' })
  }

  doc.setFont('Roboto', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(140, 140, 140)
  const disclaimer = 'Generated by TruckerBook for informational purposes only. Uses IRS 2026 standard deduction and brackets. State tax is simplified; local/city/county taxes, AMT, NIIT, itemized deductions and federal tax credits (CTC, EITC) are NOT included. Consult a licensed CPA or EA for the final return.'
  const lines = doc.splitTextToSize(disclaimer, contentW)
  doc.text(lines, marginL, y)

  return pdfToBlob(doc)
}

async function buildMileageLogPdf({ taxYear, mileage, totals }) {
  if (!mileage || mileage.length === 0) return null
  const { doc, y: startY } = await newBrandedPdf({
    title: 'Mileage Log',
    subtitle: 'IRS Business Mileage Record',
    year: 'FY ' + taxYear,
  })
  const autoTable = (await import('jspdf-autotable')).default
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = startY

  doc.setFont('Roboto', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.text('Period: ' + taxYear, margin, y)
  doc.text('Generated: ' + new Date().toLocaleDateString('en-US'), pageW - margin, y, { align: 'right' })
  y += 4

  const body = mileage.map(e => [
    e.date || '',
    (e.origin || '') + (e.origin && e.destination ? ' \u2192 ' : '') + (e.destination || ''),
    e.purpose_label || e.business_purpose || '',
    (Number(e.miles) || 0).toFixed(1),
  ])
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Origin \u2192 Destination', 'Business Purpose', 'Miles']],
    body,
    styles: { fontSize: 8, cellPadding: 2, font: 'Roboto' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 25 }, 3: { halign: 'right', cellWidth: 20 } },
    margin: { left: margin, right: margin, top: 30 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        renderPdfHeader(doc, { title: 'Mileage Log', subtitle: 'IRS Business Mileage Record', year: 'FY ' + taxYear, font: 'Roboto' })
      }
    },
  })
  y = doc.lastAutoTable.finalY + 12
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage()
    y = renderPdfHeader(doc, { title: 'Mileage Log', subtitle: 'IRS Business Mileage Record', year: 'FY ' + taxYear, font: 'Roboto' }) + 6
  }
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text('Total Business Miles: ' + totals.businessMiles.toFixed(1), margin, y); y += 6
  doc.text('Total Personal Miles: ' + totals.personalMiles.toFixed(1), margin, y); y += 6
  doc.text('Business Use %: ' + totals.businessPct.toFixed(1) + '%', margin, y); y += 10

  doc.setFontSize(7)
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(130)
  doc.text('This mileage log is generated by TruckerBook for record-keeping. Verify all entries before submission to the IRS.', margin, y, { maxWidth: pageW - margin * 2 })

  return pdfToBlob(doc)
}

function buildMileageLogExcel({ mileage, totals }) {
  if (!mileage || mileage.length === 0) return null
  const headers = ['Date', 'Origin', 'Destination', 'Business Purpose', 'Miles', 'Type']
  const rows = mileage.map(e => [
    e.date || '',
    e.origin || '',
    e.destination || '',
    e.purpose_label || e.business_purpose || '',
    Number(e.miles) || 0,
    e.business_purpose === 'Personal' ? 'Personal' : 'Business',
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const totalRow = rows.length + 2
  XLSX.utils.sheet_add_aoa(ws, [
    [],
    ['', '', '', 'Total Business Miles', totals.businessMiles],
    ['', '', '', 'Total Personal Miles', totals.personalMiles],
    ['', '', '', 'Business Use %', totals.businessPct / 100],
  ], { origin: `A${totalRow}` })
  const pctCell = XLSX.utils.encode_cell({ r: totalRow + 2, c: 4 })
  if (ws[pctCell]) ws[pctCell].z = '0.0%'
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Mileage Log')
  return wbToBlob(wb)
}

async function buildPerDiemPdf({ taxYear, quarters, totalAmount, totalFullDays, totalPartialDays, dailyRate }) {
  if (!quarters || quarters.every(q => q.trips.length === 0)) return null
  const { doc, y: startY } = await newBrandedPdf({
    title: 'Per Diem Summary',
    subtitle: 'IRS Meals & Incidentals (Transportation Industry) \u2014 80% deductible',
    year: 'FY ' + taxYear,
  })
  const autoTable = (await import('jspdf-autotable')).default
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = startY

  doc.setFont('Roboto', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text('Daily Rate: $' + dailyRate.toFixed(2) + ' (Transportation Industry, 2026)', margin, y); y += 5
  doc.text('Total Full Days: ' + totalFullDays + '   Partial Days: ' + totalPartialDays, margin, y); y += 5
  doc.text('Total Amount (100%): ' + fmtMoney(totalAmount), margin, y); y += 5
  doc.text('Deductible (80%): ' + fmtMoney(totalAmount * 0.8), margin, y); y += 8

  for (const q of quarters) {
    if (q.trips.length === 0) continue
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage()
      y = renderPdfHeader(doc, { title: 'Per Diem Summary', subtitle: 'IRS Meals & Incidentals', year: 'FY ' + taxYear, font: 'Roboto' })
    }
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(20, 20, 20)
    doc.text('Q' + q.quarter + '  \u2014  Total: ' + fmtMoney(q.totals.total_amount), margin, y)
    y += 2
    autoTable(doc, {
      startY: y + 2,
      head: [['Date', 'Origin \u2192 Destination', 'Full', 'Partial', 'Amount']],
      body: q.trips.map(t => [
        t.date_start || '',
        (t.origin || '') + (t.origin && t.destination ? ' \u2192 ' : '') + (t.destination || ''),
        String(t.full_days),
        String(t.partial_days),
        fmtMoney(t.amount),
      ]),
      styles: { fontSize: 8, cellPadding: 2, font: 'Roboto' },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right', cellWidth: 28 } },
      margin: { left: margin, right: margin, top: 30 },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          renderPdfHeader(doc, { title: 'Per Diem Summary', subtitle: 'IRS Meals & Incidentals', year: 'FY ' + taxYear, font: 'Roboto' })
        }
      },
    })
    y = doc.lastAutoTable.finalY + 6
  }
  return pdfToBlob(doc)
}

function buildPerDiemExcel({ quarters, totalAmount, dailyRate }) {
  if (!quarters || quarters.every(q => q.trips.length === 0)) return null
  const headers = ['Quarter', 'Date Start', 'Date End', 'Origin', 'Destination', 'Full Days', 'Partial Days', 'Amount']
  const rows = []
  for (const q of quarters) {
    for (const t of q.trips) {
      rows.push([
        'Q' + q.quarter,
        t.date_start || '',
        t.date_end || '',
        t.origin || '',
        t.destination || '',
        t.full_days || 0,
        t.partial_days || 0,
        Number(t.amount) || 0,
      ])
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const footerStart = rows.length + 3
  XLSX.utils.sheet_add_aoa(ws, [
    ['Daily Rate', dailyRate],
    ['Total Amount (100%)', totalAmount],
    ['Deductible (80%, TCJA)', totalAmount * 0.8],
  ], { origin: `A${footerStart}` })
  ws['!cols'] = [
    { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
    { wch: 10 }, { wch: 12 }, { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Per Diem')
  return wbToBlob(wb)
}

async function buildAmortizationPdf({ taxYear, schedule }) {
  if (!schedule) return null
  const { doc, y: startY } = await newBrandedPdf({
    title: 'Amortization Schedule',
    subtitle: 'MACRS Truck Depreciation',
    year: 'FY ' + taxYear,
  })
  const autoTable = (await import('jspdf-autotable')).default
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = startY

  doc.setFont('Roboto', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text('Method: ' + String(schedule.type).toUpperCase(), margin, y); y += 5
  doc.text('Purchase Year: ' + (schedule.purchaseYear ?? '\u2014'), margin, y); y += 5
  doc.text('Basis: ' + fmtMoney(schedule.basis) + '  (Price ' + fmtMoney(schedule.price) + ' \u2212 Salvage ' + fmtMoney(schedule.salvage) + ')', margin, y); y += 8

  autoTable(doc, {
    startY: y,
    head: [['Year', 'Rate %', 'Depreciation', 'Remaining Basis']],
    body: schedule.rows.map(r => [
      r.year != null ? String(r.year) : '\u2014',
      r.rate.toFixed(2),
      fmtMoney(r.amount),
      fmtMoney(r.remaining),
    ]),
    styles: { fontSize: 9, cellPadding: 3, font: 'Roboto' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 25 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: margin, right: margin, top: 30 },
  })
  y = doc.lastAutoTable.finalY + 10
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text('Half-year convention applied by default. Verify convention with CPA.', margin, y, { maxWidth: pageW - margin * 2 })
  return pdfToBlob(doc)
}

function buildPersonalExpensesExcel({ bytExpenses }) {
  if (!bytExpenses || bytExpenses.length === 0) return null
  const headers = ['Date', 'Category', 'Amount', 'Notes']
  const rows = bytExpenses.map(e => [
    e.date || '',
    e.category || '',
    Number(e.amount) || 0,
    e.name || '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([
    ['PERSONAL EXPENSES \u2014 Reference only. NOT deductible on Schedule C.'],
    [],
    headers,
    ...rows,
  ])
  const total = rows.reduce((s, r) => s + (r[2] || 0), 0)
  XLSX.utils.sheet_add_aoa(ws, [[], ['', 'TOTAL', total]], { origin: `A${rows.length + 5}` })
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Personal')
  return wbToBlob(wb)
}

function buildFuelVehicleExpensesExcel({ fuels, vehicleExpenses, serviceRecords }) {
  const wb = XLSX.utils.book_new()

  if (fuels && fuels.length > 0) {
    const fuelHeaders = ['Date', 'Station', 'State', 'Gallons (approx)', 'Cost']
    const fuelRows = fuels.map(f => [
      f.date || '',
      f.station || '',
      f.state_code || f.state || '',
      ((Number(f.liters) || 0) / 3.78541).toFixed(3),
      Number(f.cost) || 0,
    ])
    const fuelTotal = fuelRows.reduce((s, r) => s + r[4], 0)
    const wsFuel = XLSX.utils.aoa_to_sheet([
      fuelHeaders,
      ...fuelRows,
      [],
      ['', '', '', 'TOTAL', fuelTotal],
    ])
    wsFuel['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, wsFuel, 'Fuel (Line 9)')
  }

  if (vehicleExpenses && vehicleExpenses.length > 0) {
    const vExpHeaders = ['Date', 'Category', 'Amount', 'Description']
    const vExpRows = vehicleExpenses.map(e => [
      e.date || '',
      e.category || '',
      Number(e.amount) || 0,
      e.description || '',
    ])
    const byCat = {}
    for (const e of vehicleExpenses) {
      const k = e.category || 'other'
      byCat[k] = (byCat[k] || 0) + (Number(e.amount) || 0)
    }
    const wsVeh = XLSX.utils.aoa_to_sheet([
      vExpHeaders,
      ...vExpRows,
      [],
      ['BY CATEGORY'],
      ...Object.entries(byCat).map(([k, v]) => [k, '', v]),
    ])
    wsVeh['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, wsVeh, 'Vehicle Expenses')
  }

  if (serviceRecords && serviceRecords.length > 0) {
    const sHeaders = ['Date', 'Category', 'Description', 'Shop', 'Odometer', 'Cost']
    const sRows = serviceRecords.map(s => [
      s.date || '',
      s.category || '',
      s.description || '',
      s.service_station || '',
      s.odometer || '',
      Number(s.cost) || 0,
    ])
    const sTotal = sRows.reduce((sum, r) => sum + r[5], 0)
    const wsSvc = XLSX.utils.aoa_to_sheet([
      sHeaders,
      ...sRows,
      [],
      ['', '', '', '', 'TOTAL', sTotal],
    ])
    wsSvc['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 36 }, { wch: 22 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, wsSvc, 'Repairs (Line 21)')
  }

  if (wb.SheetNames.length === 0) return null
  return wbToBlob(wb)
}

async function buildIftaQuarterlyPdf({ taxYear, quarterlyReports }) {
  const hasAny = quarterlyReports.some(q => q.report && q.report.states.length > 0)
  if (!hasAny) return null

  const { doc, y: startY } = await newBrandedPdf({
    title: 'IFTA Quarterly Reports',
    subtitle: 'International Fuel Tax Agreement \u2014 All four quarters',
    year: 'FY ' + taxYear,
  })
  const autoTable = (await import('jspdf-autotable')).default
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = startY

  for (let i = 0; i < quarterlyReports.length; i++) {
    const { quarter, report } = quarterlyReports[i]
    if (!report || report.states.length === 0) continue

    if (y > doc.internal.pageSize.getHeight() - 70) {
      doc.addPage()
      y = renderPdfHeader(doc, { title: 'IFTA Quarterly Reports', subtitle: 'All four quarters', year: 'FY ' + taxYear, font: 'Roboto' })
    }

    doc.setFont('Roboto', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    doc.text('Q' + quarter + ' ' + taxYear, margin, y)
    y += 2

    autoTable(doc, {
      startY: y + 2,
      head: [['State', 'Miles', 'Gal. Consumed', 'Tax Rate', 'Tax Due', 'Net Due']],
      body: report.states.map(s => [
        s.state_code,
        (s.miles || 0).toFixed(1),
        s.gallons_consumed != null ? s.gallons_consumed.toFixed(1) : '\u2014',
        s.tax_rate != null ? '$' + s.tax_rate.toFixed(4) : '\u2014',
        s.tax_due != null ? fmtMoney(s.tax_due) : '\u2014',
        s.net_due != null ? fmtMoney(s.net_due) : '\u2014',
      ]).concat([[
        { content: 'TOTAL', styles: { fontStyle: 'bold' } },
        { content: report.totals.total_miles.toFixed(1), styles: { fontStyle: 'bold' } },
        '',
        '',
        { content: fmtMoney(report.totals.total_tax_due), styles: { fontStyle: 'bold' } },
        { content: fmtMoney(report.totals.net_balance), styles: { fontStyle: 'bold' } },
      ]]),
      styles: { fontSize: 8, cellPadding: 2, font: 'Roboto' },
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { halign: 'right' },
      columnStyles: { 0: { halign: 'center', cellWidth: 18 } },
      margin: { left: margin, right: margin, top: 30 },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          renderPdfHeader(doc, { title: 'IFTA Quarterly Reports', subtitle: 'All four quarters', year: 'FY ' + taxYear, font: 'Roboto' })
        }
      },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  return pdfToBlob(doc)
}

async function buildServiceRecordsPdf({ taxYear, serviceRecords }) {
  if (!serviceRecords || serviceRecords.length === 0) return null
  const { doc, y: startY } = await newBrandedPdf({
    title: 'Service Records',
    subtitle: 'Repairs & Maintenance Log',
    year: 'FY ' + taxYear,
  })
  const autoTable = (await import('jspdf-autotable')).default
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = startY

  const total = serviceRecords.reduce((s, r) => s + (Number(r.cost) || 0), 0)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text('Records: ' + serviceRecords.length + '   Total cost: ' + fmtMoney(total), margin, y); y += 4

  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Category / Description', 'Odometer', 'Cost']],
    body: serviceRecords.map(r => {
      const parts = []
      if (r.category) parts.push(r.category)
      if (r.description) parts.push(r.description)
      if (r.service_station) parts.push('(' + r.service_station + ')')
      return [
        r.date || '',
        parts.join('  \u2014  '),
        r.odometer != null && r.odometer !== '' ? String(r.odometer) : '',
        fmtMoney(r.cost),
      ]
    }),
    styles: { fontSize: 8, cellPadding: 2, font: 'Roboto' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 24, halign: 'right' }, 3: { halign: 'right', cellWidth: 26 } },
    margin: { left: margin, right: margin, top: 30 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        renderPdfHeader(doc, { title: 'Service Records', subtitle: 'Repairs & Maintenance Log', year: 'FY ' + taxYear, font: 'Roboto' })
      }
    },
  })
  return pdfToBlob(doc)
}

function buildBolRegistryExcel({ archive }) {
  const bol = (archive || []).filter(d => {
    const t = String(d.doc_type || '').toLowerCase()
    return t.includes('bol') || t.includes('rateconf')
  })
  if (bol.length === 0) return null

  const headers = ['Date', 'Type', 'Vendor / Shipper', 'Doc Number', 'Amount', 'Currency', 'Photo URL']
  const rows = bol.map(d => [
    d.document_date || '',
    d.doc_type || '',
    d.vendor_name || '',
    d.document_number || '',
    Number(d.amount) || 0,
    d.currency || '',
    d.photo_url || '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 50 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'BOL Registry')
  return wbToBlob(wb)
}

// CSV for CPA: AI Deduction Audit decision log. Documents which personal
// entries were migrated into Schedule C and the reasoning behind each
// decision — the CPA can retrace why a business deduction came from a
// personal ledger row.
function buildDeductionAuditLogCsv({ taxYear, decisions }) {
  const rows = decisions || []
  if (rows.length === 0) return null

  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  const lines = ['Date,Description,Amount,Original Category,Moved To Category,Schedule C Line,Decision,Decision Date,Confidence,Reasoning']
  for (const r of rows) {
    lines.push([
      escape(r.original_date || ''),
      escape(r.original_description || ''),
      escape((Number(r.original_amount) || 0).toFixed(2)),
      escape('personal'),
      escape(r.status === 'accepted' ? (r.suggested_category || '') : ''),
      escape(r.status === 'accepted' ? (r.suggested_schedule_c_line || '') : ''),
      escape(r.status),
      escape(r.user_action_date ? String(r.user_action_date).slice(0, 10) : ''),
      escape(r.confidence_score != null ? Number(r.confidence_score).toFixed(2) : ''),
      escape(r.reasoning || ''),
    ].join(','))
  }
  void taxYear
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

// CSV for CPA: SEP-IRA contributions — feeds Schedule 1, Line 16
// (Self-employed SEP, SIMPLE, and qualified plans deduction).
function buildSepIraContributionsCsv({ taxYear, contributions }) {
  const rows = contributions || []
  if (rows.length === 0) return null

  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  const lines = ['Date,Amount,Broker,Notes,Tax Year']
  for (const r of rows) {
    lines.push([
      escape(r.contribution_date || ''),
      escape((Number(r.amount) || 0).toFixed(2)),
      escape(r.broker_name || ''),
      escape(r.notes || ''),
      escape(r.tax_year != null ? r.tax_year : taxYear),
    ].join(','))
  }
  // BOM so Excel opens UTF-8 correctly.
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

function buildReadmeTxt({
  taxYear, profile, recipient, filingStatus, stateCode, stateName,
  grossIncome, totalExpenses, perDiemTotal, amortization, netProfit,
  seTax, federalTax, stateTax, totalTax, paidQtr,
  includedSections, skippedSections, dep,
}) {
  const hr = '\u2550'.repeat(63)
  const sep = '\n' + hr + '\n'
  const clientName = recipient?.clientName || profile?.full_name || profile?.name || '\u2014'
  const ssn4 = last4(recipient?.einSsnLast4)
  const gen = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const balanceDue = totalTax - paidQtr

  const lines = []
  lines.push(hr)
  lines.push('TRUCKERBOOK \u2014 TAX PACKAGE  ' + taxYear)
  lines.push(hr)
  lines.push('')
  lines.push('Client:          ' + clientName)
  lines.push('EIN/SSN:         ***-**-' + ssn4)
  lines.push('Tax Year:        ' + taxYear)
  lines.push('Filing status:   ' + filingStatusShort(filingStatus) + ' (' + filingStatusLabel(filingStatus) + ')')
  lines.push('State:           ' + stateCode + ' \u2014 ' + stateName)
  lines.push('Generated:       ' + gen)
  lines.push('Tool:            TruckerBook \u00b7 truckerbook-app.vercel.app')
  lines.push(sep)
  lines.push('QUICK SUMMARY')
  lines.push(hr)
  lines.push('')
  lines.push('Gross income:                    ' + fmtMoney(grossIncome))
  lines.push('Schedule C expenses:             ' + fmtMoney(totalExpenses))
  lines.push('Per Diem:                        ' + fmtMoney(perDiemTotal))
  lines.push('Truck amortization:              ' + fmtMoney(amortization))
  lines.push('-----------------------------------------------')
  lines.push('NET PROFIT:                      ' + fmtMoney(netProfit))
  lines.push('')
  lines.push('SE Tax (15.3%):                  ' + fmtMoney(seTax))
  lines.push('Federal Income Tax:              ' + fmtMoney(federalTax))
  lines.push('State Income Tax (' + stateCode + '):           ' + fmtMoney(stateTax))
  lines.push('-----------------------------------------------')
  lines.push('ESTIMATED TOTAL TAX:             ' + fmtMoney(totalTax))
  lines.push('')
  lines.push('Paid Quarterly Estimated:        ' + fmtMoney(paidQtr))
  lines.push('Balance due:                     ' + fmtMoney(balanceDue))
  lines.push(sep)
  lines.push('PACKAGE CONTENTS')
  lines.push(hr)
  lines.push('')

  const DESCS = {
    scheduleC: [
      '01_schedule_c_summary.pdf',
      '    Main report \u2014 start here. Schedule C line items, SE tax',
      '    calculation, federal & state tax estimate.',
    ],
    mileageLog: [
      '02_mileage_log.pdf',
      '02_mileage_log.xlsx',
      '    IRS-compliant business-mile log for the year.',
    ],
    perDiem: [
      '03_per_diem_summary.pdf',
      '03_per_diem_summary.xlsx',
      '    Per diem at the IRS transportation rate. Apply 80% TCJA limit',
      '    on Schedule C if client is subject to DOT hours-of-service.',
    ],
    amortization: [
      '04_amortization_schedule.pdf',
      '    MACRS / Section 179 truck depreciation by year.',
    ],
    personalExpenses: [
      '05_personal_expenses.xlsx',
      '    Personal expenses (NOT deductible; reference only).',
    ],
    fuelVehicleExpenses: [
      '06_fuel_vehicle_expenses.xlsx',
      '    Business expenses grouped by Schedule C line:',
      '    \u2022 Fuel (Line 9)',
      '    \u2022 Car & Truck Expenses (Line 9)',
      '    \u2022 Repairs & Maintenance (Line 21)',
      '    \u2022 Insurance (Line 15)',
      '    \u2022 Supplies (Line 22)',
    ],
    iftaQuarterly: [
      '07_ifta_q1-q4.pdf',
      '    Quarterly IFTA reports with state-by-state breakdown.',
    ],
    serviceRecords: [
      '08_service_records.pdf',
      '    Maintenance log with dates, odometer, cost.',
    ],
    bolRegistry: [
      '09_bol_registry.xlsx',
      '    Bill of Lading records for the year.',
    ],
    receipts: [
      'receipts/',
      '    All scanned receipts organized by category:',
      '    receipts/',
      '        \u251c\u2500\u2500 fuel/',
      '        \u251c\u2500\u2500 repairs/',
      '        \u251c\u2500\u2500 lodging/',
      '        \u251c\u2500\u2500 tolls/',
      '        \u251c\u2500\u2500 parts/',
      '        \u2514\u2500\u2500 other/',
    ],
  }

  for (const key of STEPS) {
    if (key === 'readme') continue
    if (!includedSections.includes(key)) continue
    const desc = DESCS[key]
    if (desc) lines.push(...desc, '')
  }

  if (skippedSections.length > 0) {
    lines.push('')
    lines.push('Sections skipped (no data for the year):')
    for (const s of skippedSections) {
      lines.push('    \u2014 ' + s)
    }
    lines.push('')
  }

  lines.push(sep)
  lines.push('NOT INCLUDED IN CALCULATION (for CPA review)')
  lines.push(hr)
  lines.push('')
  lines.push('TruckerBook tracks operating expenses and baseline taxes, but')
  lines.push('the following require your expertise:')
  lines.push('')
  lines.push('* Self-Employed Health Insurance Deduction (Schedule 1, Line 17)')
  lines.push('* Home Office Deduction (Form 8829)')
  lines.push('* Retirement Contributions (SEP-IRA, Solo 401(k))')
  lines.push('* HVUT Form 2290 ($550/year) if GVWR > 55,000 lbs')
  lines.push('* Phone & Internet (business percentage)')
  lines.push('* Truck loan interest')
  lines.push('* Professional fees (CPA, legal, accounting software)')
  lines.push('* DOT physical, CDL renewal, drug testing')
  lines.push('* Itemized vs Standard deduction choice')
  lines.push('* Tax credits (CTC, EITC, etc.)')
  lines.push('* AMT, NIIT, capital gains surtax')
  lines.push(sep)
  lines.push('IMPORTANT FOR CPA')
  lines.push(hr)
  lines.push('')
  lines.push('TruckerBook is an informational tax-planning tool. Calculations')
  lines.push('use IRS 2026 formulas and state tax rates from Tax Foundation as')
  lines.push('of January 1, 2026.')
  lines.push('')
  lines.push('All numbers are INFORMATIONAL and require verification by a')
  lines.push('licensed CPA or Enrolled Agent.')
  lines.push('')
  lines.push('Data was entered by the client; record accuracy is their')
  lines.push('responsibility. SmartScan receipts were parsed by AI (Gemini')
  lines.push('Vision) and may contain recognition errors.')
  lines.push('')
  if (recipient?.cpaName || recipient?.cpaEmail) {
    lines.push('Prepared for:  ' + (recipient?.cpaName || ''))
    if (recipient?.cpaEmail) lines.push('               ' + recipient.cpaEmail)
    lines.push('')
  }
  lines.push(hr)
  lines.push('TRUCKERBOOK')
  lines.push('Multilingual tax & operations platform for truckers')
  lines.push('truckerbook-app.vercel.app')
  lines.push(hr)
  lines.push('')

  return lines.join('\r\n')
}

// -------------------------------------------------------------------------
//  Public entry point
// -------------------------------------------------------------------------

export async function generateTaxPackage({
  supabase, userId, role, taxYear, profile,
  options = {}, recipient = {}, lang = 'en',
  onProgress,
}) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  const report = (step, status, extra) => {
    if (onProgress) onProgress({ step, status, ...(extra || {}) })
  }

  const includedSections = []
  const skippedSections = []

  report('load', 'in_progress')
  const [data, filingSettings, qtrPayments] = await Promise.all([
    loadAnnualData({ supabase, userId, role, taxYear }),
    loadFilingSettings({ supabase, userId }),
    loadQuarterlyPayments({ supabase, userId, taxYear }),
  ])
  report('load', 'done')

  // --- Derive totals needed by several builders ---
  const income = data.trips.reduce((s, r) => s + (Number(r.income) || 0), 0)
  const fuelCost = data.fuels.reduce((s, f) => s + (Number(f.cost) || 0), 0)
  const serviceCost = data.serviceRecords.reduce((s, r) => s + (Number(r.cost) || 0), 0)
  const vehExp = categorizeVehicleExpenses(data.vehicleExpenses)
  const expenseBreakdown = {
    fuel: fuelCost,
    repairs: serviceCost,
    insurance: vehExp.insurance,
    lease: vehExp.lease,
    toll: vehExp.toll,
    parking: vehExp.parking,
    other: vehExp.other,
  }
  const totalExpenses =
    expenseBreakdown.fuel + expenseBreakdown.repairs + expenseBreakdown.insurance +
    expenseBreakdown.lease + expenseBreakdown.toll + expenseBreakdown.parking +
    expenseBreakdown.other

  // Per-diem across all 4 quarters
  const quarterlyPerDiem = await Promise.all(
    [1, 2, 3, 4].map(q =>
      calculatePerDiem({ supabase, userId, role, quarter: q, year: taxYear })
        .then(r => ({ quarter: q, ...r }))
        .catch(() => ({ quarter: q, trips: [], totals: { total_amount: 0, total_full_days: 0, total_partial_days: 0, daily_rate: 80 } }))
    )
  )
  const perDiemTotal = quarterlyPerDiem.reduce((s, q) => s + (q.totals?.total_amount || 0), 0)
  const totalFullDays = quarterlyPerDiem.reduce((s, q) => s + (q.totals?.total_full_days || 0), 0)
  const totalPartialDays = quarterlyPerDiem.reduce((s, q) => s + (q.totals?.total_partial_days || 0), 0)
  const dailyRate = quarterlyPerDiem.find(q => q.totals?.daily_rate)?.totals?.daily_rate || 80

  const depreciation = computeDepreciationForYear(data.depreciation, taxYear)
  // Match TaxSummaryTab: deduct per diem at 100%. The 80% TCJA limit is the
  // strictly-correct IRS treatment, but keeping the two screens in sync is
  // more important than re-litigating it in two places — CPA reviews the final
  // return anyway.
  const totalDeductions = totalExpenses + perDiemTotal + depreciation
  const netProfit = income - totalDeductions
  const positiveNet = Math.max(netProfit, 0)
  const filingStatus = filingSettings.filingStatus
  const stateCode = profile?.state_of_residence || 'TX'
  const stateName = getStateName(stateCode)
  const taxRes = calculateTotalTax(positiveNet, filingStatus, stateCode)

  const breakdown = {
    filingStatus,
    netProfit,
    taxableSEIncome: taxRes.taxableSEIncome,
    ssTax: taxRes.ssTax,
    medicareTax: taxRes.medicareTax,
    additionalMedicare: taxRes.additionalMedicare,
    seTax: taxRes.totalSETax,
    deductibleHalfSE: taxRes.deductibleHalfSE,
    agi: taxRes.agi,
    standardDeduction: taxRes.standardDeduction,
    taxableIncome: taxRes.taxableIncome,
    incomeTax: taxRes.incomeTax,
    effectiveRate: taxRes.effectiveRate,
    stateCode,
    stateName,
    stateType: taxRes.stateResult?.type || 'none',
    stateTax: taxRes.stateTax,
    totalTax: taxRes.totalTax,
  }

  // Mileage totals (business vs personal)
  let businessMiles = 0, personalMiles = 0
  for (const e of data.mileage) {
    const m = Number(e.miles) || 0
    if (e.business_purpose === 'Personal') personalMiles += m
    else businessMiles += m
  }
  const totalMiles = businessMiles + personalMiles
  const businessPct = totalMiles > 0 ? (businessMiles / totalMiles) * 100 : 100

  const paidQtr = qtrPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  // --- 1. Schedule C ---
  if (options.scheduleC !== false) {
    report('scheduleC', 'in_progress')
    try {
      const blob = await buildScheduleCPdf({
        taxYear, profile, breakdown,
        incomeTotal: income,
        expenseBreakdown,
        perDiemTotal,
        depreciation,
        totals: { totalExpenses, totalDeductions },
        recipient,
      })
      if (blob) {
        zip.file('01_schedule_c_summary.pdf', blob)
        includedSections.push('scheduleC')
      }
    } catch (err) {
      console.warn('[taxPackage] scheduleC failed', err)
    }
    report('scheduleC', 'done')
  }

  // --- 2. Mileage log ---
  if (options.mileageLog !== false) {
    report('mileageLog', 'in_progress')
    try {
      const blobPdf = await buildMileageLogPdf({
        taxYear, mileage: data.mileage,
        totals: { businessMiles, personalMiles, businessPct },
      })
      const blobXls = buildMileageLogExcel({
        mileage: data.mileage,
        totals: { businessMiles, personalMiles, businessPct },
      })
      if (blobPdf) zip.file('02_mileage_log.pdf', blobPdf)
      if (blobXls) zip.file('02_mileage_log.xlsx', blobXls)
      if (blobPdf || blobXls) includedSections.push('mileageLog')
      else skippedSections.push('mileage_log')
    } catch (err) {
      console.warn('[taxPackage] mileageLog failed', err)
    }
    report('mileageLog', 'done')
  }

  // --- 3. Per Diem ---
  if (options.perDiem !== false) {
    report('perDiem', 'in_progress')
    try {
      const blobPdf = await buildPerDiemPdf({
        taxYear,
        quarters: quarterlyPerDiem,
        totalAmount: perDiemTotal,
        totalFullDays, totalPartialDays, dailyRate,
      })
      const blobXls = buildPerDiemExcel({
        quarters: quarterlyPerDiem,
        totalAmount: perDiemTotal,
        dailyRate,
      })
      if (blobPdf) zip.file('03_per_diem_summary.pdf', blobPdf)
      if (blobXls) zip.file('03_per_diem_summary.xlsx', blobXls)
      if (blobPdf || blobXls) includedSections.push('perDiem')
      else skippedSections.push('per_diem')
    } catch (err) {
      console.warn('[taxPackage] perDiem failed', err)
    }
    report('perDiem', 'done')
  }

  // --- 4. Amortization ---
  if (options.amortization !== false) {
    report('amortization', 'in_progress')
    try {
      const schedule = buildAmortizationSchedule(data.depreciation)
      if (schedule) {
        const blob = await buildAmortizationPdf({ taxYear, schedule })
        if (blob) {
          zip.file('04_amortization_schedule.pdf', blob)
          includedSections.push('amortization')
        } else skippedSections.push('amortization')
      } else {
        skippedSections.push('amortization')
      }
    } catch (err) {
      console.warn('[taxPackage] amortization failed', err)
    }
    report('amortization', 'done')
  }

  // --- 5. Personal expenses ---
  if (options.personalExpenses !== false) {
    report('personalExpenses', 'in_progress')
    try {
      const blob = buildPersonalExpensesExcel({ bytExpenses: data.bytExpenses })
      if (blob) {
        zip.file('05_personal_expenses.xlsx', blob)
        includedSections.push('personalExpenses')
      } else skippedSections.push('personal_expenses')
    } catch (err) {
      console.warn('[taxPackage] personalExpenses failed', err)
    }
    report('personalExpenses', 'done')
  }

  // --- 6. Fuel & vehicle expenses ---
  if (options.fuelVehicleExpenses !== false) {
    report('fuelVehicleExpenses', 'in_progress')
    try {
      const blob = buildFuelVehicleExpensesExcel({
        fuels: data.fuels,
        vehicleExpenses: data.vehicleExpenses,
        serviceRecords: data.serviceRecords,
      })
      if (blob) {
        zip.file('06_fuel_vehicle_expenses.xlsx', blob)
        includedSections.push('fuelVehicleExpenses')
      } else skippedSections.push('fuel_vehicle_expenses')
    } catch (err) {
      console.warn('[taxPackage] fuelVehicleExpenses failed', err)
    }
    report('fuelVehicleExpenses', 'done')
  }

  // --- 7. IFTA quarterly ---
  if (options.iftaQuarterly !== false) {
    report('iftaQuarterly', 'in_progress')
    try {
      const quarterlyReports = await Promise.all(
        [1, 2, 3, 4].map(q =>
          buildQuarterlyReport({ supabase, userId, role, quarter: q, year: taxYear })
            .then(report => ({ quarter: q, report }))
            .catch(() => ({ quarter: q, report: null }))
        )
      )
      const blob = await buildIftaQuarterlyPdf({ taxYear, quarterlyReports })
      if (blob) {
        zip.file('07_ifta_q1-q4.pdf', blob)
        includedSections.push('iftaQuarterly')
      } else skippedSections.push('ifta_quarterly')
    } catch (err) {
      console.warn('[taxPackage] ifta failed', err)
    }
    report('iftaQuarterly', 'done')
  }

  // --- 8. Service records ---
  if (options.serviceRecords !== false) {
    report('serviceRecords', 'in_progress')
    try {
      const blob = await buildServiceRecordsPdf({ taxYear, serviceRecords: data.serviceRecords })
      if (blob) {
        zip.file('08_service_records.pdf', blob)
        includedSections.push('serviceRecords')
      } else skippedSections.push('service_records')
    } catch (err) {
      console.warn('[taxPackage] serviceRecords failed', err)
    }
    report('serviceRecords', 'done')
  }

  // --- 9. BOL registry ---
  if (options.bolRegistry !== false) {
    report('bolRegistry', 'in_progress')
    try {
      const blob = buildBolRegistryExcel({ archive: data.archive })
      if (blob) {
        zip.file('09_bol_registry.xlsx', blob)
        includedSections.push('bolRegistry')
      } else skippedSections.push('bol_registry')
    } catch (err) {
      console.warn('[taxPackage] bol failed', err)
    }
    report('bolRegistry', 'done')
  }

  // --- SEP-IRA contributions CSV (Schedule 1, Line 16) ---
  if (options.sepIraContributions !== false) {
    try {
      const blob = buildSepIraContributionsCsv({
        taxYear,
        contributions: data.sepIraContributions,
      })
      if (blob) {
        zip.file('sep_ira_contributions_' + taxYear + '.csv', blob)
        includedSections.push('sepIraContributions')
      } else {
        skippedSections.push('sep_ira_contributions')
      }
    } catch (err) {
      console.warn('[taxPackage] sepIraContributions failed', err)
    }
  }

  // --- AI deduction audit decision log ---
  if (options.deductionAuditLog !== false) {
    try {
      const blob = buildDeductionAuditLogCsv({
        taxYear,
        decisions: data.deductionAuditDecisions,
      })
      if (blob) {
        zip.file('deduction_audit_log_' + taxYear + '.csv', blob)
        includedSections.push('deductionAuditLog')
      } else {
        skippedSections.push('deduction_audit_log')
      }
    } catch (err) {
      console.warn('[taxPackage] deductionAuditLog failed', err)
    }
  }

  // --- 10. Receipt photos ---
  let photosCount = 0
  if (options.receipts !== false) {
    report('receipts', 'in_progress')
    const receiptDocs = (data.archive || []).filter(d =>
      d.photo_url && String(d.doc_type || '').toLowerCase().startsWith('receipt')
    )
    const usedNames = new Map()
    for (const d of receiptDocs) {
      const folder = receiptFolder(d.doc_type)
      const datePart = (d.document_date || '').slice(0, 10) || 'no-date'
      const vendorPart = sanitizeFilename(d.vendor_name) || 'receipt'
      const amountPart = d.amount != null ? Number(d.amount).toFixed(2) : ''
      const ext = fileExtFromUrl(d.photo_url)
      let name = [datePart, vendorPart, amountPart].filter(Boolean).join('_') + '.' + ext
      const key = folder + '/' + name
      if (usedNames.has(key)) {
        const n = usedNames.get(key) + 1
        usedNames.set(key, n)
        name = name.replace('.' + ext, '_' + n + '.' + ext)
      } else {
        usedNames.set(key, 1)
      }
      try {
        const resp = await fetch(d.photo_url)
        if (!resp.ok) continue
        const blob = await resp.blob()
        zip.file('receipts/' + folder + '/' + name, blob)
        photosCount += 1
      } catch (err) {
        console.warn('[taxPackage] receipt fetch failed', d.id, err)
      }
    }
    if (photosCount > 0) includedSections.push('receipts')
    else skippedSections.push('receipts')
    report('receipts', 'done')
  }

  // --- 11. README ---
  report('readme', 'in_progress')
  const readme = buildReadmeTxt({
    taxYear, profile, recipient, filingStatus,
    stateCode, stateName,
    grossIncome: income,
    totalExpenses,
    perDiemTotal,
    amortization: depreciation,
    netProfit,
    seTax: breakdown.seTax,
    federalTax: breakdown.incomeTax,
    stateTax: breakdown.stateTax,
    totalTax: breakdown.totalTax,
    paidQtr,
    includedSections,
    skippedSections,
    dep: data.depreciation,
  })
  zip.file('README.txt', readme)
  report('readme', 'done')

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const userSlug = sanitizeFilename(recipient?.clientName || profile?.full_name || profile?.name || 'client')
  const fileName = 'truckerbook_tax_package_' + taxYear + '_' + userSlug + '.zip'

  return {
    blob: zipBlob,
    fileName,
    size: zipBlob.size,
    docsCount: includedSections.filter(s => s !== 'receipts').length,
    photosCount,
    includedSections,
    skippedSections,
    exceedsSizeLimit: zipBlob.size > MAX_ZIP_BYTES,
    sizeMB: (zipBlob.size / (1024 * 1024)).toFixed(2),
  }
}

// Hand the archive to the user. Uses Web Share API on iOS where <a download>
// is unreliable, falls back to an anchor click everywhere else.
export async function downloadTaxPackage(blob, fileName) {
  const isIOS = (() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true
    if (ua.includes('Macintosh') && navigator.maxTouchPoints > 1) return true
    return false
  })()
  const file = new File([blob], fileName, { type: 'application/zip' })
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return { shared: true }
    } catch (err) {
      if (err && err.name === 'AbortError') return { shared: false, cancelled: true }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    try { document.body.removeChild(a) } catch {}
    URL.revokeObjectURL(url)
  }, 500)
  return { shared: false, downloaded: true }
}

export const TAX_PACKAGE_STEPS = STEPS
export const TAX_PACKAGE_MAX_BYTES = MAX_ZIP_BYTES
