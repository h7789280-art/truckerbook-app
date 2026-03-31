import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

/**
 * @param {Array<Object>} data
 * @param {Array<{header: string, key: string}>} columns
 * @param {string} filename
 */
export function exportToExcel(data, columns, filename) {
  const headers = columns.map(c => c.header)
  const rows = data.map(row => columns.map(c => row[c.key] ?? ''))

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Auto-width columns
  ws['!cols'] = columns.map((_, i) => {
    const maxLen = Math.max(
      headers[i].length,
      ...rows.map(r => String(r[i]).length)
    )
    return { wch: Math.min(maxLen + 2, 40) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, filename)
}

/**
 * Export vehicle expenses with Summary + Details sheets
 * @param {Object} opts
 * @param {Object} opts.summary - { driverName, driverPhone, vehicleInfo, period, categories: [{label, amount}], grandTotal, mileage, costPerUnit, distLabel, currencySymbol }
 * @param {Array<Object>} opts.detailsData - row data for details sheet
 * @param {Array<{header: string, key: string}>} opts.detailsColumns - column definitions for details sheet
 * @param {string} opts.summarySheetName - sheet 1 name
 * @param {string} opts.detailsSheetName - sheet 2 name
 * @param {Object} opts.labels - { driver, phone, vehicle, period, category, amount, total, mileage, costPerUnit }
 * @param {string} opts.filename
 */
export function exportToExcelWithSummary(opts) {
  const {
    summary,
    detailsData,
    detailsColumns,
    summarySheetName,
    detailsSheetName,
    labels,
    filename,
  } = opts

  const cs = summary.currencySymbol || '$'

  // --- Sheet 1: Summary ---
  const summaryRows = []
  summaryRows.push([labels.driver || 'Driver', summary.driverName || ''])
  summaryRows.push([labels.phone || 'Phone', summary.driverPhone || ''])
  summaryRows.push([labels.vehicle || 'Vehicle', summary.vehicleInfo || ''])
  summaryRows.push([labels.period || 'Period', summary.period || ''])
  summaryRows.push([]) // empty row

  // Category table header
  summaryRows.push([labels.category || 'Category', `${labels.amount || 'Amount'} (${cs})`])
  for (const cat of summary.categories) {
    summaryRows.push([cat.label, cat.amount])
  }
  summaryRows.push([]) // empty row
  summaryRows.push([labels.total || 'TOTAL', summary.grandTotal])

  summaryRows.push([]) // empty row
  summaryRows.push([labels.mileage || 'Mileage', summary.mileage || 0])
  summaryRows.push([labels.costPerUnit || 'Cost/unit', summary.costPerUnit || 0])

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)

  // Bold the TOTAL row and header rows via basic column widths
  ws1['!cols'] = [{ wch: 25 }, { wch: 20 }]

  // --- Sheet 2: Details ---
  const headers = detailsColumns.map(c => c.header)
  const rows = detailsData.map(row => detailsColumns.map(c => row[c.key] ?? ''))

  // Add totals row at the bottom
  const amountIdx = detailsColumns.findIndex(c => c.key === 'amount')
  if (amountIdx >= 0 && rows.length > 0) {
    const totalRow = detailsColumns.map(() => '')
    totalRow[0] = labels.total || 'TOTAL'
    totalRow[amountIdx] = detailsData.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    rows.push([]) // empty separator
    rows.push(totalRow)
  }

  const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws2['!cols'] = detailsColumns.map((_, i) => {
    const maxLen = Math.max(
      headers[i].length,
      ...rows.map(r => String(r[i]).length)
    )
    return { wch: Math.min(maxLen + 2, 40) }
  })

  // --- Build workbook ---
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, summarySheetName || 'Summary')
  XLSX.utils.book_append_sheet(wb, ws2, detailsSheetName || 'Details')
  XLSX.writeFile(wb, filename)
}

/**
 * @param {Array<Object>} data
 * @param {Array<{header: string, key: string}>} columns
 * @param {string} title
 * @param {string} filename
 */
export function exportToPDF(data, columns, title, filename) {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text(title, 14, 20)

  doc.setFontSize(10)
  doc.text(new Date().toLocaleDateString(), 14, 28)

  const head = [columns.map(c => c.header)]
  const body = data.map(row => columns.map(c => row[c.key] ?? ''))

  doc.autoTable({
    startY: 34,
    head,
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [245, 158, 11] },
  })

  doc.save(filename)
}
