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
    if (!ws.columns || ws.columns.length === 0) return
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
 * Export fleet owner monthly report with 8 sheets:
 * P&L, Vehicles, Drivers, Fuel, Expenses, Trips, IFTA, Payroll
 */
export async function exportFleetReportExcel(opts) {
  try {
  const excelMod = await import('exceljs')
  const ExcelJS = excelMod.default || excelMod
  const fileSaverMod = await import('file-saver')
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default?.saveAs || fileSaverMod.default

  if (!ExcelJS || !ExcelJS.Workbook) {
    throw new Error('ExcelJS library failed to load (no Workbook constructor)')
  }
  if (typeof saveAs !== 'function') {
    throw new Error('file-saver library failed to load (saveAs is not a function)')
  }

  const {
    vehicles: _vehicles,
    drivers: _drivers,
    fuels: _fuels,
    trips: _trips,
    serviceRecs: _serviceRecs,
    tireRecs: _tireRecs,
    vehicleExps: _vehicleExps,
    sessions: _sessions,
    advances: _advances,
    bolDocs: _bolDocs,
    period, // string "April 2026"
    distLabel, // 'mi' or 'km'
    cs, // '$'
    isImperial,
    filename,
    ownerProfile, // fleet owner profile
    driverMap: _driverMap,
    vehicleMap: _vehicleMap,
  } = opts

  // Defensive defaults — ensure all arrays are arrays and maps are objects
  const vehicles = Array.isArray(_vehicles) ? _vehicles : []
  const drivers = Array.isArray(_drivers) ? _drivers : []
  const fuels = Array.isArray(_fuels) ? _fuels : []
  const trips = Array.isArray(_trips) ? _trips : []
  const serviceRecs = Array.isArray(_serviceRecs) ? _serviceRecs : []
  const tireRecs = Array.isArray(_tireRecs) ? _tireRecs : []
  const vehicleExps = Array.isArray(_vehicleExps) ? _vehicleExps : []
  const sessions = Array.isArray(_sessions) ? _sessions : []
  const advances = Array.isArray(_advances) ? _advances : []
  const bolDocs = Array.isArray(_bolDocs) ? _bolDocs : []
  const driverMap = _driverMap && typeof _driverMap === 'object' ? _driverMap : {}
  const vehicleMap = _vehicleMap && typeof _vehicleMap === 'object' ? _vehicleMap : {}

  const wb = new ExcelJS.Workbook()

  const ORANGE = 'F59E0B'
  const LIGHT_YELLOW = 'FFF8E1'

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + ORANGE } }
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  const altFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LIGHT_YELLOW } }
  const boldFont = { bold: true, size: 11 }

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
    if (!ws.columns || ws.columns.length === 0) return
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
    return Number(Number(n).toFixed(2))
  }

  const convDist = (km) => isImperial ? Math.round((km || 0) * 0.621371) : Math.round(km || 0)
  const convGal = (liters) => isImperial ? Math.round((liters || 0) * 0.264172 * 100) / 100 : (liters || 0)

  const getDriverName = (userId) => {
    if (driverMap[userId]) return driverMap[userId].name
    if (userId === ownerProfile?.id) return ownerProfile?.full_name || ownerProfile?.name || 'Owner'
    return ''
  }

  const getVehicleLabel = (vehicleId) => {
    if (vehicleMap[vehicleId]) return vehicleMap[vehicleId].label
    return ''
  }

  const getVehiclePlate = (vehicleId) => {
    if (vehicleMap[vehicleId]) return vehicleMap[vehicleId].plate
    return ''
  }

  const getVehicleDriver = (vehicleId) => {
    if (vehicleMap[vehicleId]) return vehicleMap[vehicleId].driver
    return ''
  }

  // ---- SHEET 1: P&L ----
  const ws1 = wb.addWorksheet('P&L')
  const plHeaders = ['\u041c\u0430\u0448\u0438\u043d\u0430', '\u0413\u043e\u0441\u043d\u043e\u043c\u0435\u0440', '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c', '\u0414\u043e\u0445\u043e\u0434 (' + cs + ')', '\u0420\u0430\u0441\u0445\u043e\u0434 (' + cs + ')', '\u0417\u0430\u0440\u043f\u043b\u0430\u0442\u0430 (' + cs + ')', '\u041f\u0440\u0438\u0431\u044b\u043b\u044c (' + cs + ')', distLabel, cs + '/' + distLabel]
  ws1.addRow(plHeaders)
  styleHeaders(ws1, plHeaders.length)

  let plRowIdx = 2
  let totIncome = 0, totExpense = 0, totSalary = 0, totMiles = 0

  vehicles.forEach(v => {
    const vTrips = trips.filter(t => t.vehicle_id === v.id)
    const vFuels = fuels.filter(f => f.vehicle_id === v.id)
    const vService = serviceRecs.filter(s => s.vehicle_id === v.id)
    const vTires = tireRecs.filter(t => t.vehicle_id === v.id)
    const vVehExp = vehicleExps.filter(e => e.vehicle_id === v.id)

    const income = vTrips.reduce((s, t) => s + (t.income || 0), 0)
    const expense = vFuels.reduce((s, f) => s + (f.cost || 0), 0)
      + vService.reduce((s, r) => s + (r.cost || 0), 0)
      + vTires.reduce((s, r) => s + (r.cost || 0), 0)
      + vVehExp.reduce((s, r) => s + (r.amount || 0), 0)
    const salary = vTrips.reduce((s, t) => s + (t.driver_pay || 0), 0)
    const profit = income - expense - salary
    const miles = vTrips.reduce((s, t) => s + convDist(t.distance_km), 0)
    const perMile = miles > 0 ? profit / miles : 0

    totIncome += income; totExpense += expense; totSalary += salary; totMiles += miles

    const label = (v.brand || '') + ' ' + (v.model || '')
    const driver = v.driver_name || getVehicleDriver(v.id)
    ws1.addRow([label.trim(), v.plate_number || '', driver, fmtNum(income), fmtNum(expense), fmtNum(salary), fmtNum(profit), miles, fmtNum(perMile)])
    plRowIdx++
  })

  styleAltRows(ws1, 2, plRowIdx - 1, plHeaders.length)

  const totProfit = totIncome - totExpense - totSalary
  const totPerMile = totMiles > 0 ? totProfit / totMiles : 0
  const plTotal = ws1.addRow(['\u0418\u0422\u041e\u0413\u041e', '', '', fmtNum(totIncome), fmtNum(totExpense), fmtNum(totSalary), fmtNum(totProfit), totMiles, fmtNum(totPerMile)])
  plTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws1)

  // ---- SHEET 2: Vehicles ----
  const ws2 = wb.addWorksheet('\u041c\u0430\u0448\u0438\u043d\u044b')
  let vRowIdx = 0

  vehicles.forEach((v, vi) => {
    const label = (v.brand || '') + ' ' + (v.model || '')
    const driver = v.driver_name || getVehicleDriver(v.id)

    // Vehicle header block
    const hdrRow = ws2.addRow([label.trim(), v.plate_number || '', driver, v.odometer ? (convDist(v.odometer) + ' ' + distLabel) : ''])
    vRowIdx++
    hdrRow.eachCell(c => { c.font = boldFont; c.fill = headerFill; c.font = headerFont })

    const vFuels = fuels.filter(f => f.vehicle_id === v.id)
    const vService = serviceRecs.filter(s => s.vehicle_id === v.id)
    const vTires = tireRecs.filter(t => t.vehicle_id === v.id)
    const vVehExp = vehicleExps.filter(e => e.vehicle_id === v.id)

    const cats = []
    const fuelCost = vFuels.reduce((s, f) => s + (f.cost || 0), 0)
    if (fuelCost > 0) cats.push(['\u0422\u043e\u043f\u043b\u0438\u0432\u043e', fmtNum(fuelCost)])

    const byCat = {}
    vVehExp.forEach(e => { byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + (e.amount || 0) })
    if (byCat.def) cats.push(['DEF', fmtNum(byCat.def)])
    if (byCat.oil) cats.push(['\u041c\u0430\u0441\u043b\u043e', fmtNum(byCat.oil)])

    const serviceCost = vService.reduce((s, r) => s + (r.cost || 0), 0)
    if (serviceCost > 0) cats.push(['\u0417\u0430\u043f\u0447\u0430\u0441\u0442\u0438/\u0420\u0435\u043c\u043e\u043d\u0442', fmtNum(serviceCost)])

    if (byCat.supplies) cats.push(['\u0420\u0430\u0441\u0445\u043e\u0434\u043d\u0438\u043a\u0438', fmtNum(byCat.supplies)])
    if (byCat.hotel) cats.push(['\u041c\u043e\u0442\u0435\u043b\u044c', fmtNum(byCat.hotel)])

    const tireCost = vTires.reduce((s, r) => s + (r.cost || 0), 0)
    if (tireCost > 0) cats.push(['\u0428\u0438\u043d\u044b', fmtNum(tireCost)])

    // Other vehicle expense categories
    const knownCats = ['def', 'oil', 'supplies', 'hotel']
    Object.entries(byCat).filter(([k]) => !knownCats.includes(k)).forEach(([k, v2]) => {
      if (v2 > 0) cats.push([k, fmtNum(v2)])
    })

    cats.forEach(([lbl, amt]) => {
      ws2.addRow([lbl, amt])
      vRowIdx++
    })

    const catTotal = fuelCost + serviceCost + tireCost + Object.values(byCat).reduce((s, v2) => s + v2, 0)
    const tr = ws2.addRow(['\u0418\u0422\u041e\u0413\u041e', fmtNum(catTotal)])
    tr.eachCell(c => { c.font = boldFont })
    vRowIdx++

    if (vi < vehicles.length - 1) { ws2.addRow([]); vRowIdx++ }
  })
  autoWidth(ws2)

  // ---- SHEET 3: Drivers ----
  const ws3 = wb.addWorksheet('\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u0438')
  const drvHeaders = ['\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c', '\u041c\u0430\u0448\u0438\u043d\u0430', '\u0420\u0435\u0439\u0441\u043e\u0432', distLabel, '\u0427\u0430\u0441\u043e\u0432', '\u0414\u043e\u0445\u043e\u0434 (' + cs + ')', cs + '/' + distLabel, '\u0417\u0430\u0440\u043f\u043b\u0430\u0442\u0430 (' + cs + ')']
  ws3.addRow(drvHeaders)
  styleHeaders(ws3, drvHeaders.length)

  let drvRowIdx = 2
  // Group by driver (user_id on trips)
  const driverIds = [...new Set(trips.map(t => t.user_id))]
  driverIds.forEach(dId => {
    const dTrips = trips.filter(t => t.user_id === dId)
    const dSessions = sessions.filter(s => s.user_id === dId)
    const name = getDriverName(dId)
    const vIds = [...new Set(dTrips.map(t => t.vehicle_id).filter(Boolean))]
    const vehicleLabel = vIds.map(vid => getVehicleLabel(vid)).filter(Boolean).join(', ') || ''
    const tripsCount = dTrips.length
    const miles = dTrips.reduce((s, t) => s + convDist(t.distance_km), 0)
    const hours = dSessions.reduce((s, sh) => {
      if (!sh.ended_at) return s
      return s + (new Date(sh.ended_at).getTime() - new Date(sh.started_at).getTime()) / 3600000
    }, 0)
    const income = dTrips.reduce((s, t) => s + (t.income || 0), 0)
    const perMile = miles > 0 ? income / miles : 0
    const salary = dTrips.reduce((s, t) => s + (t.driver_pay || 0), 0)
    ws3.addRow([name, vehicleLabel, tripsCount, miles, fmtNum(Math.round(hours * 10) / 10), fmtNum(income), fmtNum(perMile), fmtNum(salary)])
    drvRowIdx++
  })
  styleAltRows(ws3, 2, drvRowIdx - 1, drvHeaders.length)
  autoWidth(ws3)

  // ---- SHEET 4: Fuel ----
  const ws4 = wb.addWorksheet('\u0422\u043e\u043f\u043b\u0438\u0432\u043e')
  const fuelHeaders = ['\u0414\u0430\u0442\u0430', '\u0410\u0417\u0421', '\u0428\u0442\u0430\u0442', isImperial ? '\u0413\u0430\u043b\u043b\u043e\u043d\u044b' : '\u041b\u0438\u0442\u0440\u044b', '\u0421\u0443\u043c\u043c\u0430 (' + cs + ')', cs + '/' + (isImperial ? 'gal' : 'l'), '\u041c\u0430\u0448\u0438\u043d\u0430', '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c']
  ws4.addRow(fuelHeaders)
  styleHeaders(ws4, fuelHeaders.length)

  let fuelRowIdx = 2
  let fuelTotalGal = 0, fuelTotalCost = 0
  fuels.forEach(f => {
    const gal = convGal(f.liters)
    const ppg = gal > 0 ? (f.cost || 0) / gal : 0
    fuelTotalGal += gal; fuelTotalCost += (f.cost || 0)
    ws4.addRow([f.date || '', f.station || '', f.state || '', fmtNum(gal), fmtNum(f.cost), fmtNum(ppg), getVehicleLabel(f.vehicle_id), getDriverName(f.user_id)])
    fuelRowIdx++
  })
  styleAltRows(ws4, 2, fuelRowIdx - 1, fuelHeaders.length)
  const fuelTotal = ws4.addRow(['\u0418\u0422\u041e\u0413\u041e', '', '', fmtNum(fuelTotalGal), fmtNum(fuelTotalCost), fuelTotalGal > 0 ? fmtNum(fuelTotalCost / fuelTotalGal) : '', '', ''])
  fuelTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws4)

  // ---- SHEET 5: Expenses ----
  const ws5 = wb.addWorksheet('\u0420\u0430\u0441\u0445\u043e\u0434\u044b')
  const expHeaders = ['\u0414\u0430\u0442\u0430', '\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435', '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f', '\u0421\u0443\u043c\u043c\u0430 (' + cs + ')', '\u041c\u0430\u0448\u0438\u043d\u0430', '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c']
  ws5.addRow(expHeaders)
  styleHeaders(ws5, expHeaders.length)

  // Merge all expense types
  const allExpenses = []
  fuels.forEach(f => allExpenses.push({ date: f.date, description: f.station || 'Fuel', category: 'Fuel', amount: f.cost || 0, vehicle_id: f.vehicle_id, user_id: f.user_id }))
  serviceRecs.forEach(r => allExpenses.push({ date: r.date, description: r.description || r.type || 'Service', category: 'Service', amount: r.cost || 0, vehicle_id: r.vehicle_id, user_id: r.user_id }))
  tireRecs.forEach(r => allExpenses.push({ date: r.installed_at, description: (r.brand || '') + ' ' + (r.model || ''), category: 'Tires', amount: r.cost || 0, vehicle_id: r.vehicle_id, user_id: r.user_id }))
  vehicleExps.forEach(e => allExpenses.push({ date: e.date, description: e.description || '', category: e.category || 'Vehicle', amount: e.amount || 0, vehicle_id: e.vehicle_id, user_id: e.user_id }))
  allExpenses.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let expRowIdx = 2
  let expTotal = 0
  allExpenses.forEach(e => {
    expTotal += e.amount
    ws5.addRow([e.date || '', e.description, e.category, fmtNum(e.amount), getVehicleLabel(e.vehicle_id), getDriverName(e.user_id)])
    expRowIdx++
  })
  styleAltRows(ws5, 2, expRowIdx - 1, expHeaders.length)
  const expTotalRow = ws5.addRow(['\u0418\u0422\u041e\u0413\u041e', '', '', fmtNum(expTotal), '', ''])
  expTotalRow.eachCell(c => { c.font = boldFont })
  autoWidth(ws5)

  // ---- SHEET 6: Trips ----
  const ws6 = wb.addWorksheet('\u0420\u0435\u0439\u0441\u044b')
  const tripHeaders = ['\u0414\u0430\u0442\u0430', '\u041e\u0442\u043a\u0443\u0434\u0430', '\u041a\u0443\u0434\u0430', distLabel, '\u0414\u043e\u0445\u043e\u0434 (' + cs + ')', '\u041c\u0430\u0448\u0438\u043d\u0430', '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c']
  ws6.addRow(tripHeaders)
  styleHeaders(ws6, tripHeaders.length)

  let tripRowIdx = 2
  let tripTotMiles = 0, tripTotIncome = 0
  trips.forEach(t => {
    const miles = convDist(t.distance_km)
    tripTotMiles += miles; tripTotIncome += (t.income || 0)
    ws6.addRow([(t.created_at || '').slice(0, 10), t.origin || '', t.destination || '', miles, fmtNum(t.income), getVehicleLabel(t.vehicle_id), getDriverName(t.user_id)])
    tripRowIdx++
  })
  styleAltRows(ws6, 2, tripRowIdx - 1, tripHeaders.length)
  const tripTotal = ws6.addRow(['\u0418\u0422\u041e\u0413\u041e', '', '', tripTotMiles, fmtNum(tripTotIncome), '', ''])
  tripTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws6)

  // ---- SHEET 7: IFTA ----
  const hasStateData = fuels.some(f => f.state)
  if (hasStateData) {
    const ws7 = wb.addWorksheet('IFTA')
    const iftaHeaders = ['\u0428\u0442\u0430\u0442', distLabel, isImperial ? '\u0413\u0430\u043b\u043b\u043e\u043d\u044b \u043a\u0443\u043f\u043b\u0435\u043d\u043e' : '\u041b\u0438\u0442\u0440\u044b \u043a\u0443\u043f\u043b\u0435\u043d\u043e', isImperial ? '\u0413\u0430\u043b\u043b\u043e\u043d\u044b \u0438\u0437\u0440\u0430\u0441\u0445\u043e\u0434.' : '\u041b\u0438\u0442\u0440\u044b \u0438\u0437\u0440\u0430\u0441\u0445\u043e\u0434.', '\u0420\u0430\u0437\u043d\u0438\u0446\u0430']
    ws7.addRow(iftaHeaders)
    styleHeaders(ws7, iftaHeaders.length)

    // Group fuels by state
    const byState = {}
    fuels.forEach(f => {
      if (!f.state) return
      if (!byState[f.state]) byState[f.state] = { bought: 0, miles: 0 }
      byState[f.state].bought += convGal(f.liters)
    })

    // Estimate miles per state from trips (if trip has state info) — approximate: distribute by fuel bought
    const totalFleetMiles = trips.reduce((s, t) => s + convDist(t.distance_km), 0)
    const totalBought = Object.values(byState).reduce((s, v) => s + v.bought, 0)
    const avgMpg = totalBought > 0 ? totalFleetMiles / totalBought : 0

    let iftaRowIdx = 2
    Object.entries(byState).sort(([a], [b]) => a.localeCompare(b)).forEach(([state, data]) => {
      const used = avgMpg > 0 ? data.bought : 0 // approximate: gallons used ~ gallons bought if no better data
      const diff = data.bought - used
      ws7.addRow([state, '', fmtNum(data.bought), fmtNum(used), fmtNum(diff)])
      iftaRowIdx++
    })
    styleAltRows(ws7, 2, iftaRowIdx - 1, iftaHeaders.length)
    autoWidth(ws7)
  }

  // ---- SHEET 8: Payroll ----
  const ws8 = wb.addWorksheet('\u0417\u0430\u0440\u043f\u043b\u0430\u0442\u0430')
  const payHeaders = ['\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c', distLabel, '\u0420\u0435\u0439\u0441\u043e\u0432', '\u0421\u0442\u0430\u0432\u043a\u0430', '\u0422\u0438\u043f', '\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u043e (' + cs + ')', '\u0410\u0432\u0430\u043d\u0441\u044b (' + cs + ')', '\u041a \u0432\u044b\u043f\u043b\u0430\u0442\u0435 (' + cs + ')']
  ws8.addRow(payHeaders)
  styleHeaders(ws8, payHeaders.length)

  let payRowIdx = 2
  let payTotEarned = 0, payTotAdv = 0, payTotDue = 0

  driverIds.forEach(dId => {
    const dTrips = trips.filter(t => t.user_id === dId)
    const name = getDriverName(dId)
    const miles = dTrips.reduce((s, t) => s + convDist(t.distance_km), 0)
    const tripsCount = dTrips.length
    const earned = dTrips.reduce((s, t) => s + (t.driver_pay || 0), 0)
    const dAdvances = advances.filter(a => a.user_id === dId)
    const advTotal = dAdvances.reduce((s, a) => s + (a.amount || 0), 0)
    const due = earned - advTotal

    // Determine pay info
    const dInfo = driverMap[dId]
    let rateStr = ''
    let typeStr = ''
    if (dInfo) {
      if (dInfo.pay_type === 'per_mile') { rateStr = cs + (dInfo.pay_rate || 0) + '/' + distLabel; typeStr = 'Per ' + distLabel }
      else if (dInfo.pay_type === 'percent') { rateStr = (dInfo.pay_rate || 0) + '%'; typeStr = '%' }
      else { rateStr = ''; typeStr = dInfo.pay_type || '' }
    }

    payTotEarned += earned; payTotAdv += advTotal; payTotDue += due
    ws8.addRow([name, miles, tripsCount, rateStr, typeStr, fmtNum(earned), fmtNum(advTotal), fmtNum(due)])
    payRowIdx++
  })

  styleAltRows(ws8, 2, payRowIdx - 1, payHeaders.length)
  const payTotal = ws8.addRow(['\u0418\u0422\u041e\u0413\u041e', '', '', '', '', fmtNum(payTotEarned), fmtNum(payTotAdv), fmtNum(payTotDue)])
  payTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws8)

  // ---- SHEET 9: BOL ----
  if (bolDocs.length > 0) {
    const ws9 = wb.addWorksheet('BOL')
    const bolHeaders = ['\u0414\u0430\u0442\u0430', 'BOL #', '\u041c\u0430\u0440\u0448\u0440\u0443\u0442', '\u041c\u0430\u0448\u0438\u043d\u0430', '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c', '\u0424\u0430\u0439\u043b']
    ws9.addRow(bolHeaders)
    styleHeaders(ws9, bolHeaders.length)

    let bolRowIdx = 2
    bolDocs.forEach(doc => {
      const date = doc.created_at ? doc.created_at.slice(0, 10) : ''
      const bolNum = doc.title || doc.notes || ''
      const vehicle = getVehicleLabel(doc.vehicle_id)
      const driver = getDriverName(doc.user_id)
      const hasFile = doc.file_url ? '\u0414\u0430' : '\u041d\u0435\u0442'
      ws9.addRow([date, bolNum, '', vehicle, driver, hasFile])
      bolRowIdx++
    })
    styleAltRows(ws9, 2, bolRowIdx - 1, bolHeaders.length)
    autoWidth(ws9)
  }

  // Write file
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)

  } catch (err) {
    console.error('exportFleetReportExcel error:', err)
    throw err
  }
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
