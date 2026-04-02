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
 * Export driver monthly report with 4 sheets: Summary, Trips, Expenses, Pay Sheet
 * Uses ExcelJS for cell styling (orange headers, alternating rows, etc.)
 */
export async function exportDriverReportExcel(opts) {
  const ExcelJS = (await import('exceljs')).default
  const { saveAs } = await import('file-saver')

  const {
    driverName, driverPhone, vehicleInfo, period,
    tripsCount, totalMileage, totalHours,
    payType, // 'per_mile' | 'percent' | 'none'
    payRate,
    earned, personalExpenses, netClean,
    vehicleExpenseCategories, // [{label, amount}]
    vehicleExpenseTotal,
    tripIncome, netProfit, // for owner (payType === 'none')
    trips, // [{date, origin, destination, miles, income, driverPay}]
    expenses, // [{date, description, category, gallons, amount, odometer}]
    payRows, // [{date, route, miles, rate, earned}]
    payTotal,
    advances, // [{date, amount, note}]
    advancesTotal,
    payDue,
    distLabel, cs,
    filename,
  } = opts

  const wb = new ExcelJS.Workbook()

  const ORANGE = 'F59E0B'
  const LIGHT_YELLOW = 'FFF8E1'

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ORANGE } }
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  const altFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LIGHT_YELLOW } }

  const styleHeaders = (ws, colCount) => {
    const row = ws.getRow(1)
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c)
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
    row.height = 24
  }

  const styleAltRows = (ws, startRow, endRow, colCount) => {
    for (let r = startRow; r <= endRow; r++) {
      if ((r - startRow) % 2 === 1) {
        const row = ws.getRow(r)
        for (let c = 1; c <= colCount; c++) {
          row.getCell(c).fill = altFill
        }
      }
    }
  }

  const autoWidth = (ws) => {
    ws.columns.forEach(col => {
      let maxLen = 10
      col.eachCell({ includeEmpty: true }, cell => {
        const len = cell.value ? String(cell.value).length : 0
        if (len > maxLen) maxLen = len
      })
      col.width = Math.min(maxLen + 3, 40)
    })
  }

  const fmtNum = (n) => {
    if (n == null || isNaN(n)) return ''
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  // ---- SHEET 1: Summary ----
  const ws1 = wb.addWorksheet('\u0421\u0432\u043e\u0434\u043a\u0430')

  const addInfoRow = (label, value) => {
    const r = ws1.addRow([label, value])
    r.getCell(1).font = { bold: true, size: 11 }
    r.getCell(2).font = { size: 11 }
  }

  addInfoRow('\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c', driverName || '')
  addInfoRow('\u0422\u0435\u043b\u0435\u0444\u043e\u043d', driverPhone || '')
  addInfoRow('\u041c\u0430\u0448\u0438\u043d\u0430', vehicleInfo || '')
  addInfoRow('\u041f\u0435\u0440\u0438\u043e\u0434', period || '')
  ws1.addRow([])

  addInfoRow('\u0420\u0435\u0439\u0441\u043e\u0432', tripsCount ?? 0)
  addInfoRow('\u041f\u0440\u043e\u0431\u0435\u0433 (' + (distLabel || 'mi') + ')', fmtNum(totalMileage))
  addInfoRow('\u0427\u0430\u0441\u043e\u0432 \u0437\u0430 \u0440\u0443\u043b\u0451\u043c', fmtNum(totalHours))
  ws1.addRow([])

  if (payType && payType !== 'none') {
    addInfoRow('\u0417\u0430\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u043e (' + cs + ')', fmtNum(earned))
    addInfoRow('\u041b\u0438\u0447\u043d\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b (' + cs + ')', fmtNum(personalExpenses))
    addInfoRow('\u0427\u0438\u0441\u0442\u044b\u043c\u0438 (' + cs + ')', fmtNum(netClean))
    ws1.addRow([])
  }

  // Vehicle expenses breakdown
  const catHeaderRow = ws1.addRow(['\u0420\u0430\u0441\u0445\u043e\u0434\u044b \u043d\u0430 \u043c\u0430\u0448\u0438\u043d\u0443', '\u0421\u0443\u043c\u043c\u0430 (' + cs + ')'])
  catHeaderRow.getCell(1).fill = headerFill
  catHeaderRow.getCell(1).font = headerFont
  catHeaderRow.getCell(2).fill = headerFill
  catHeaderRow.getCell(2).font = headerFont

  if (vehicleExpenseCategories) {
    vehicleExpenseCategories.forEach(cat => {
      ws1.addRow([cat.label, fmtNum(cat.amount)])
    })
  }
  const totalRow1 = ws1.addRow(['\u0418\u0422\u041e\u0413\u041e', fmtNum(vehicleExpenseTotal ?? 0)])
  totalRow1.getCell(1).font = { bold: true, size: 11 }
  totalRow1.getCell(2).font = { bold: true, size: 11 }

  ws1.addRow([])
  addInfoRow('\u041f\u0440\u043e\u0431\u0435\u0433 (' + (distLabel || 'mi') + ')', fmtNum(totalMileage))
  if (totalMileage > 0) {
    addInfoRow('\u0421\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c/' + (distLabel || 'mi') + ' (' + cs + ')', fmtNum((vehicleExpenseTotal || 0) / totalMileage))
  }

  if (payType === 'none') {
    ws1.addRow([])
    addInfoRow('\u0414\u043e\u0445\u043e\u0434 \u0440\u0435\u0439\u0441\u043e\u0432 (' + cs + ')', fmtNum(tripIncome))
    addInfoRow('\u0427\u0438\u0441\u0442\u0430\u044f \u043f\u0440\u0438\u0431\u044b\u043b\u044c (' + cs + ')', fmtNum(netProfit))
  }

  ws1.getColumn(1).width = 30
  ws1.getColumn(2).width = 20

  // ---- SHEET 2: Trips ----
  const ws2 = wb.addWorksheet('\u0420\u0435\u0439\u0441\u044b')
  const tripHeaders = ['\u0414\u0430\u0442\u0430', '\u041e\u0442\u043a\u0443\u0434\u0430', '\u041a\u0443\u0434\u0430', '\u041c\u0438\u043b\u0438', '\u0414\u043e\u0445\u043e\u0434 (' + cs + ')']
  if (payType && payType !== 'none') tripHeaders.push('\u041c\u043e\u0439 \u0437\u0430\u0440\u0430\u0431\u043e\u0442\u043e\u043a (' + cs + ')')
  ws2.addRow(tripHeaders)
  styleHeaders(ws2, tripHeaders.length)

  let tripRowIdx = 2
  ;(trips || []).forEach(tr => {
    const row = [tr.date, tr.origin, tr.destination, fmtNum(tr.miles), fmtNum(tr.income)]
    if (payType && payType !== 'none') row.push(fmtNum(tr.driverPay))
    ws2.addRow(row)
    tripRowIdx++
  })

  // TOTAL row
  const tripTotalRow = ['\u0418\u0422\u041e\u0413\u041e', '', '', fmtNum((trips || []).reduce((s, t) => s + (t.miles || 0), 0)), fmtNum((trips || []).reduce((s, t) => s + (t.income || 0), 0))]
  if (payType && payType !== 'none') tripTotalRow.push(fmtNum((trips || []).reduce((s, t) => s + (t.driverPay || 0), 0)))
  const ttr = ws2.addRow(tripTotalRow)
  ttr.eachCell(c => { c.font = { bold: true, size: 11 } })

  styleAltRows(ws2, 2, tripRowIdx - 1, tripHeaders.length)
  autoWidth(ws2)

  // ---- SHEET 3: Expenses ----
  const ws3 = wb.addWorksheet('\u0420\u0430\u0441\u0445\u043e\u0434\u044b')
  const expHeaders = ['\u0414\u0430\u0442\u0430', '\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435', '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f', '\u0413\u0430\u043b\u043b\u043e\u043d\u044b', '\u0421\u0443\u043c\u043c\u0430 (' + cs + ')', '\u041f\u0440\u043e\u0431\u0435\u0433 (' + (distLabel || 'mi') + ')']
  ws3.addRow(expHeaders)
  styleHeaders(ws3, expHeaders.length)

  let expRowIdx = 2
  ;(expenses || []).sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e => {
    ws3.addRow([e.date, e.description, e.category, e.gallons ? fmtNum(e.gallons) : '', fmtNum(e.amount), e.odometer ? fmtNum(e.odometer) : ''])
    expRowIdx++
  })

  const expTotalRow = ws3.addRow(['\u0418\u0422\u041e\u0413\u041e', '', '', '', fmtNum((expenses || []).reduce((s, e) => s + (e.amount || 0), 0)), ''])
  expTotalRow.eachCell(c => { c.font = { bold: true, size: 11 } })

  styleAltRows(ws3, 2, expRowIdx - 1, expHeaders.length)
  autoWidth(ws3)

  // ---- SHEET 4: Pay Sheet (only if payType != 'none') ----
  if (payType && payType !== 'none') {
    const ws4 = wb.addWorksheet('\u0420\u0430\u0441\u0447\u0451\u0442\u043d\u044b\u0439 \u043b\u0438\u0441\u0442')
    const payHeaders = ['\u0414\u0430\u0442\u0430', '\u041c\u0430\u0440\u0448\u0440\u0443\u0442', '\u041c\u0438\u043b\u0438', '\u0421\u0442\u0430\u0432\u043a\u0430', '\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u043e (' + cs + ')']
    ws4.addRow(payHeaders)
    styleHeaders(ws4, payHeaders.length)

    let payRowIdx = 2
    ;(payRows || []).forEach(r => {
      ws4.addRow([r.date, r.route, fmtNum(r.miles), r.rate, fmtNum(r.earned)])
      payRowIdx++
    })

    styleAltRows(ws4, 2, payRowIdx - 1, payHeaders.length)

    // TOTAL
    ws4.addRow([])
    const payTotalR = ws4.addRow(['\u0418\u0422\u041e\u0413\u041e \u043d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u043e', '', '', '', fmtNum(payTotal ?? 0)])
    payTotalR.eachCell(c => { c.font = { bold: true, size: 11 } })

    // Advances
    if (advances && advances.length > 0) {
      ws4.addRow([])
      const advHeader = ws4.addRow(['\u0410\u0432\u0430\u043d\u0441\u044b', '', '', '', ''])
      advHeader.getCell(1).font = { bold: true, size: 11 }
      advances.forEach(a => {
        ws4.addRow([a.date, a.note || '', '', '', fmtNum(a.amount)])
      })
      const advTotalR = ws4.addRow(['\u0418\u0442\u043e\u0433\u043e \u0430\u0432\u0430\u043d\u0441\u044b', '', '', '', fmtNum(advancesTotal ?? 0)])
      advTotalR.eachCell(c => { c.font = { bold: true, size: 11 } })
    }

    ws4.addRow([])
    const dueR = ws4.addRow(['\u041a \u0412\u042b\u041f\u041b\u0410\u0422\u0415', '', '', '', fmtNum(payDue ?? 0)])
    dueR.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF' + ORANGE } }
    dueR.getCell(5).font = { bold: true, size: 12, color: { argb: 'FF' + ORANGE } }

    autoWidth(ws4)
  }

  // Write file
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
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
