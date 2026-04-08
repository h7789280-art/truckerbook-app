import * as XLSX from 'xlsx'

/**
 * @param {Array<Object>} data
 * @param {Array<{header: string, key: string}>} columns
 * @param {string} filename
 */
export function exportToExcel(data, columns, filename) {
  const headers = columns.map(c => c.header)
  const rows = data.map(row => columns.map(c => {
    const v = row[c.key] ?? ''
    return (v && typeof v === 'object' && v.hyperlink) ? (v.text || v.hyperlink) : v
  }))

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Add hyperlinks for cells with link data
  data.forEach((row, ri) => {
    columns.forEach((c, ci) => {
      const v = row[c.key]
      if (v && typeof v === 'object' && v.hyperlink) {
        const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci })
        if (ws[cellRef]) {
          ws[cellRef].l = { Target: v.hyperlink, Tooltip: v.text || '' }
        }
      }
    })
  })

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
    detailsSheetName,
    labels,
    filename,
    categoryData, // [{label, count, amount}]
    categorySheetName,
  } = opts

  const cs = summary.currencySymbol || '$'

  // --- Sheet 1: Details (by date) ---
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

  const ws1 = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws1['!cols'] = detailsColumns.map((_, i) => {
    const maxLen = Math.max(
      headers[i].length,
      ...rows.map(r => String(r[i]).length)
    )
    return { wch: Math.min(maxLen + 2, 40) }
  })

  // --- Sheet 2: By category ---
  const catHeaders = [
    labels.category || 'Category',
    labels.entriesCount || 'Entries',
    `${labels.amount || 'Amount'} (${cs})`,
  ]
  const catRows = (categoryData || []).map(c => [c.label, c.count, c.amount])
  const catTotal = (categoryData || []).reduce((s, c) => s + (c.amount || 0), 0)
  const catCountTotal = (categoryData || []).reduce((s, c) => s + (c.count || 0), 0)
  catRows.push([])
  catRows.push([labels.total || 'TOTAL', catCountTotal, catTotal])

  const ws2 = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows])
  ws2['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }]

  // --- Build workbook ---
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, detailsSheetName || 'By date')
  XLSX.utils.book_append_sheet(wb, ws2, categorySheetName || 'By category')
  XLSX.writeFile(wb, filename)
}

/**
 * Export expenses for ALL vehicles — 3 sheets: by date, by category, by vehicle
 * @param {Object} opts
 * @param {Array<Object>} opts.allRows - all entries for "by date" sheet [{date, description, category, volume, amount, odometer}]
 * @param {Array<{header: string, key: string}>} opts.columns
 * @param {Array<{label: string, count: number, amount: number}>} opts.categoryData - aggregated by category
 * @param {Array<{name: string, plate: string, driver: string, amount: number, count: number}>} opts.vehicleSummary - per vehicle
 * @param {Object} opts.labels - { total, category, entriesCount, amount, vehicle, plate, driver }
 * @param {Object} opts.sheetNames - { byDate, byCategory, byVehicle }
 * @param {string} opts.cs - currency symbol
 * @param {string} opts.filename
 */
export function exportAllVehiclesExcel(opts) {
  const { allRows, columns, categoryData, vehicleSummary, labels, sheetNames, cs, filename } = opts
  const wb = XLSX.utils.book_new()

  // --- Sheet 1: By date ---
  const headers = columns.map(c => c.header)
  const rows = allRows.map(row => columns.map(c => row[c.key] ?? ''))

  const amountIdx = columns.findIndex(c => c.key === 'amount')
  if (amountIdx >= 0 && rows.length > 0) {
    const totalRow = columns.map(() => '')
    totalRow[0] = labels.total || 'TOTAL'
    totalRow[amountIdx] = allRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    rows.push([])
    rows.push(totalRow)
  }

  const ws1 = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws1['!cols'] = columns.map((_, i) => {
    const maxLen = Math.max(
      headers[i].length,
      ...rows.map(r => String(r[i]).length)
    )
    return { wch: Math.min(maxLen + 2, 40) }
  })
  XLSX.utils.book_append_sheet(wb, ws1, (sheetNames && sheetNames.byDate) || 'By date')

  // --- Sheet 2: By category ---
  const catHeaders = [
    labels.category || 'Category',
    labels.entriesCount || 'Entries',
    `${labels.amount || 'Amount'} (${cs || '$'})`,
  ]
  const catRows = (categoryData || []).map(c => [c.label, c.count, c.amount])
  const catTotal = (categoryData || []).reduce((s, c) => s + (c.amount || 0), 0)
  const catCountTotal = (categoryData || []).reduce((s, c) => s + (c.count || 0), 0)
  catRows.push([])
  catRows.push([labels.total || 'TOTAL', catCountTotal, catTotal])

  const ws2 = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows])
  ws2['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws2, (sheetNames && sheetNames.byCategory) || 'By category')

  // --- Sheet 3: By vehicle ---
  if (vehicleSummary && vehicleSummary.length > 0) {
    const vehHeaders = [
      labels.vehicle || 'Vehicle',
      labels.plate || 'Plate',
      labels.driver || 'Driver',
      `${labels.amount || 'Amount'} (${cs || '$'})`,
      labels.entriesCount || 'Entries',
    ]
    const vehRows = vehicleSummary.map(v => [v.name, v.plate, v.driver, v.amount, v.count])
    const vehTotalAmount = vehicleSummary.reduce((s, v) => s + (v.amount || 0), 0)
    const vehTotalCount = vehicleSummary.reduce((s, v) => s + (v.count || 0), 0)
    vehRows.push([])
    vehRows.push([labels.total || 'TOTAL', '', '', vehTotalAmount, vehTotalCount])

    const ws3 = XLSX.utils.aoa_to_sheet([vehHeaders, ...vehRows])
    ws3['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws3, (sheetNames && sheetNames.byVehicle) || 'By vehicle')
  }

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
    bytExps: _bytExps,
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
    t: _t, // i18n translate function (optional)
  } = opts

  // Translation helper with fallback to key
  const t = typeof _t === 'function' ? _t : (key) => {
    const fallback = { 'excel.sheetPL': 'P&L Summary', 'excel.sheetDrivers': 'By Drivers', 'excel.sheetVehicles': 'By Vehicles', 'excel.sheetCategories': 'Expenses by Category', 'excel.sheetPayroll': 'Payroll', 'excel.sheetAllExpenses': 'All Expenses', 'excel.plReport': 'P&L Report', 'excel.period': 'Period', 'excel.totalIncome': 'Total Income', 'excel.totalExpense': 'Total Expense', 'excel.driverSalaries': 'Driver Salaries', 'excel.personalExpenses': 'Personal Expenses (drivers)', 'excel.grossProfit': 'Gross Profit', 'excel.netProfit': 'Net Profit', 'excel.totalDist': 'Total', 'excel.totalTrips': 'Total Trips', 'excel.costPer': 'Cost per', 'excel.revPer': 'Revenue per', 'excel.driver': 'Driver', 'excel.vehicle': 'Vehicle', 'excel.plate': 'Plate', 'excel.trips': 'Trips', 'excel.income': 'Income', 'excel.expense': 'Expense', 'excel.salary': 'Salary', 'excel.profit': 'Profit', 'excel.total': 'TOTAL', 'excel.fuel': 'Fuel', 'excel.def': 'DEF', 'excel.repair': 'Repair', 'excel.maintenance': 'Maintenance', 'excel.other': 'Other', 'excel.totalExpShort': 'Total Exp.', 'excel.category': 'Category', 'excel.amount': 'Amount', 'excel.entries': 'Entries', 'excel.pctOfTotal': '% of Total', 'excel.payType': 'Pay Type', 'excel.rate': 'Rate', 'excel.earned': 'Earned', 'excel.perDist': 'Per', 'excel.date': 'Date', 'excel.description': 'Description', 'excel.liters': 'liters', 'excel.gallons': 'gal', 'excel.odometer': 'Odometer', 'excel.oil': 'Oil', 'excel.parts': 'Parts', 'excel.supplies': 'Supplies', 'excel.motel': 'Motel', 'excel.equipment': 'Equipment', 'excel.toll': 'Toll', 'excel.tires': 'Tires', 'excel.service': 'Service', 'excel.distMiles': 'miles', 'excel.distKm': 'km' }
    return fallback[key] || key
  }

  // Defensive defaults — ensure all arrays are arrays and maps are objects
  const vehicles = Array.isArray(_vehicles) ? _vehicles : []
  Array.isArray(_drivers) // drivers used via driverMap
  const fuels = Array.isArray(_fuels) ? _fuels : []
  const trips = Array.isArray(_trips) ? _trips : []
  const serviceRecs = Array.isArray(_serviceRecs) ? _serviceRecs : []
  const tireRecs = Array.isArray(_tireRecs) ? _tireRecs : []
  const vehicleExps = Array.isArray(_vehicleExps) ? _vehicleExps : []
  const bytExps = Array.isArray(_bytExps) ? _bytExps : []
  // sessions, advances, bolDocs — available via opts but not used in P&L sheets
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
  const distLabelFull = isImperial ? t('excel.distMiles') : t('excel.distKm')

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

  // === Pre-compute aggregates for all sheets ===
  const driverIds = [...new Set(trips.map(t => t.user_id))]

  // Maintenance categories — must match Service.jsx
  const MAINT_CATS = ['oil_change', 'filters', 'belts_chains', 'coolant', 'diagnostics', 'brake_pads', 'spark_plugs', 'maintenance', 'maintenance_other']
  const isMaintenance = (r) => MAINT_CATS.includes((r.category || '').toLowerCase())

  // Per-vehicle aggregates (used by Sheet 3 By Vehicle)
  // Track assigned entry IDs to avoid double-counting orphaned entries (vehicle_id = null)
  const assignedFuelIds = new Set()
  const assignedServiceIds = new Set()
  const assignedTireIds = new Set()
  const assignedVehExpIds = new Set()

  const vehicleAgg = vehicles.map((v, vIdx) => {
    // Include entries matching vehicle_id OR orphaned (null vehicle_id) assigned to first vehicle
    const matchOrOrphan = (e, field) => e[field || 'vehicle_id'] === v.id || (vIdx === 0 && !e[field || 'vehicle_id'])
    const vTrips = trips.filter(t => t.vehicle_id === v.id)
    const vFuels = fuels.filter(f => matchOrOrphan(f, 'vehicle_id'))
    const vService = serviceRecs.filter(s => matchOrOrphan(s, 'vehicle_id'))
    const vTires = tireRecs.filter(t => matchOrOrphan(t, 'vehicle_id'))
    const vVehExp = vehicleExps.filter(e => matchOrOrphan(e, 'vehicle_id'))

    vFuels.forEach(f => assignedFuelIds.add(f.id))
    vService.forEach(s => assignedServiceIds.add(s.id))
    vTires.forEach(t => assignedTireIds.add(t.id))
    vVehExp.forEach(e => assignedVehExpIds.add(e.id))

    const income = vTrips.reduce((s, t) => s + (t.income || 0), 0)
    const fuelCost = vFuels.reduce((s, f) => s + (f.cost || 0), 0)
    const serviceCost = vService.reduce((s, r) => s + (r.cost || 0), 0)
    const tireCost = vTires.reduce((s, r) => s + (r.cost || 0), 0)

    const byCat = {}
    vVehExp.forEach(e => { byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + (e.amount || 0) })
    const defCost = byCat.def || 0
    const oilCost = byCat.oil || 0
    const suppliesCost = byCat.supplies || 0
    const hotelCost = byCat.hotel || 0
    const otherVehExp = Object.entries(byCat)
      .filter(([k]) => !['def', 'oil', 'supplies', 'hotel'].includes(k))
      .reduce((s, [, v2]) => s + v2, 0)
    const totalVehExp = Object.values(byCat).reduce((s, v2) => s + v2, 0)

    const expense = fuelCost + serviceCost + tireCost + totalVehExp
    const salary = vTrips.reduce((s, t) => s + (t.driver_pay || 0), 0)
    const miles = vTrips.reduce((s, t) => s + convDist(t.distance_km), 0)

    return {
      vehicle: v,
      label: ((v.brand || '') + ' ' + (v.model || '')).trim(),
      plate: v.plate_number || '',
      driver: v.driver_name || getVehicleDriver(v.id),
      income, expense, salary, miles,
      fuelCost, defCost, serviceCost, tireCost, oilCost, suppliesCost, hotelCost, otherVehExp, totalVehExp,
      tripsCount: vTrips.length,
    }
  })

  // Total fleet aggregates — compute directly from ALL data arrays (not just vehicleAgg)
  const totTrips = trips.length
  const totIncome = trips.reduce((s, t) => s + (t.income || 0), 0)
  const totMiles = trips.reduce((s, t) => s + convDist(t.distance_km), 0)
  const totSalary = trips.reduce((s, t) => s + (t.driver_pay || 0), 0)
  const totBytExpense = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totExpense = fuels.reduce((s, f) => s + (f.cost || 0), 0)
    + serviceRecs.reduce((s, r) => s + (r.cost || 0), 0)
    + tireRecs.reduce((s, r) => s + (r.cost || 0), 0)
    + vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
    + totBytExpense

  const totGrossProfit = totIncome - totExpense
  const totNetProfit = totIncome - totExpense - totSalary
  const totCostPerMile = totMiles > 0 ? totExpense / totMiles : 0
  const totRevPerMile = totMiles > 0 ? totIncome / totMiles : 0

  // ---- SHEET 1: P&L Summary ----
  const ws1 = wb.addWorksheet(t('excel.sheetPL'))

  // Title row
  const titleRow = ws1.addRow([t('excel.plReport') + ' \u2014 ' + (period || '')])
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF' + ORANGE } }
  ws1.mergeCells('A1:B1')
  ws1.addRow([])

  // Key metrics as label-value pairs
  const summaryData = [
    [t('excel.period'), period || ''],
    [t('excel.totalIncome'), cs + ' ' + fmtNum(totIncome)],
    [t('excel.totalExpense'), cs + ' ' + fmtNum(totExpense)],
    ...(totBytExpense > 0 ? [[t('excel.personalExpenses'), cs + ' ' + fmtNum(totBytExpense)]] : []),
    [t('excel.driverSalaries'), cs + ' ' + fmtNum(totSalary)],
    [],
    [t('excel.grossProfit'), cs + ' ' + fmtNum(totGrossProfit)],
    [t('excel.netProfit'), cs + ' ' + fmtNum(totNetProfit)],
    [],
    [t('excel.totalDist') + ' ' + distLabelFull, totMiles],
    [t('excel.totalTrips'), totTrips],
    [t('excel.costPer') + ' ' + distLabelFull, cs + ' ' + fmtNum(totCostPerMile)],
    [t('excel.revPer') + ' ' + distLabelFull, cs + ' ' + fmtNum(totRevPerMile)],
  ]

  summaryData.forEach(row => {
    if (row.length === 0) { ws1.addRow([]); return }
    const r = ws1.addRow(row)
    r.getCell(1).font = boldFont
  })

  // Highlight profit rows — offset depends on whether personal expenses row was added
  const profitRowOffset = totBytExpense > 0 ? 9 : 8
  ws1.getRow(profitRowOffset).eachCell(c => { c.font = { bold: true, size: 12, color: { argb: totGrossProfit >= 0 ? 'FF22C55E' : 'FFEF4444' } } })
  ws1.getRow(profitRowOffset + 1).eachCell(c => { c.font = { bold: true, size: 12, color: { argb: totNetProfit >= 0 ? 'FF22C55E' : 'FFEF4444' } } })

  ws1.getColumn(1).width = 45
  ws1.getColumn(2).width = 20

  // ---- SHEET 2: By Drivers ----
  const ws2 = wb.addWorksheet(t('excel.sheetDrivers'))
  const drvHeaders = [t('excel.driver'), t('excel.vehicle'), t('excel.plate'), t('excel.trips'), distLabel, t('excel.income') + ' (' + cs + ')', t('excel.expense') + ' (' + cs + ')', t('excel.salary') + ' (' + cs + ')', t('excel.profit') + ' (' + cs + ')', cs + '/' + distLabel]
  ws2.addRow(drvHeaders)
  styleHeaders(ws2, drvHeaders.length)

  let drvRowIdx = 2
  let drvTotIncome = 0, drvTotExpense = 0, drvTotSalary = 0, drvTotMiles = 0, drvTotTrips = 0

  driverIds.forEach(dId => {
    const dTrips = trips.filter(t => t.user_id === dId)
    const dFuels = fuels.filter(f => f.user_id === dId)
    const dService = serviceRecs.filter(s => s.user_id === dId)
    const dTires = tireRecs.filter(t => t.user_id === dId)
    const dVehExp = vehicleExps.filter(e => e.user_id === dId)

    const name = getDriverName(dId)
    const vIds = [...new Set(dTrips.map(t => t.vehicle_id).filter(Boolean))]
    const vehicleLabel = vIds.map(vid => getVehicleLabel(vid)).filter(Boolean).join(', ') || ''
    const plateLabel = vIds.map(vid => getVehiclePlate(vid)).filter(Boolean).join(', ') || ''
    const tripsCount = dTrips.length
    const miles = dTrips.reduce((s, t) => s + convDist(t.distance_km), 0)
    const income = dTrips.reduce((s, t) => s + (t.income || 0), 0)
    const expense = dFuels.reduce((s, f) => s + (f.cost || 0), 0)
      + dService.reduce((s, r) => s + (r.cost || 0), 0)
      + dTires.reduce((s, r) => s + (r.cost || 0), 0)
      + dVehExp.reduce((s, e) => s + (e.amount || 0), 0)
    const salary = dTrips.reduce((s, t) => s + (t.driver_pay || 0), 0)
    const profit = income - expense - salary
    const perMile = miles > 0 ? profit / miles : 0

    drvTotIncome += income; drvTotExpense += expense; drvTotSalary += salary; drvTotMiles += miles; drvTotTrips += tripsCount

    ws2.addRow([name, vehicleLabel, plateLabel, tripsCount, miles, fmtNum(income), fmtNum(expense), fmtNum(salary), fmtNum(profit), fmtNum(perMile)])
    drvRowIdx++
  })
  styleAltRows(ws2, 2, drvRowIdx - 1, drvHeaders.length)

  const drvTotProfit = drvTotIncome - drvTotExpense - drvTotSalary
  const drvTotPM = drvTotMiles > 0 ? drvTotProfit / drvTotMiles : 0
  const drvTotal = ws2.addRow([t('excel.total'), '', '', drvTotTrips, drvTotMiles, fmtNum(drvTotIncome), fmtNum(drvTotExpense), fmtNum(drvTotSalary), fmtNum(drvTotProfit), fmtNum(drvTotPM)])
  drvTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws2)

  // ---- SHEET 3: By Vehicles ----
  const ws3 = wb.addWorksheet(t('excel.sheetVehicles'))
  const vehHeaders = [t('excel.vehicle'), t('excel.plate'), t('excel.driver'), t('excel.income') + ' (' + cs + ')', t('excel.fuel') + ' (' + cs + ')', t('excel.def') + ' (' + cs + ')', t('excel.repair') + ' (' + cs + ')', t('excel.maintenance') + ' (' + cs + ')', t('excel.other') + ' (' + cs + ')', t('excel.totalExpShort') + ' (' + cs + ')', t('excel.profit') + ' (' + cs + ')', distLabel, cs + '/' + distLabel]
  ws3.addRow(vehHeaders)
  styleHeaders(ws3, vehHeaders.length)

  let vRowIdx = 2
  let vTotIncome = 0, vTotFuel = 0, vTotDef = 0, vTotRepair = 0, vTotService = 0, vTotOther = 0, vTotExp = 0, vTotProfit = 0, vTotMiles = 0

  vehicleAgg.forEach(va => {
    // Split service_records into repair vs maintenance (ТО) by category field
    const vService = serviceRecs.filter(s => s.vehicle_id === va.vehicle.id)
    const repairCost = vService.filter(s => !isMaintenance(s)).reduce((s, r) => s + (r.cost || 0), 0)
    const maintenanceCost = vService.filter(s => isMaintenance(s)).reduce((s, r) => s + (r.cost || 0), 0)
    const otherExp = va.oilCost + va.suppliesCost + va.hotelCost + va.tireCost + va.otherVehExp
    const totalExp = va.fuelCost + va.defCost + repairCost + maintenanceCost + otherExp
    const profit = va.income - totalExp
    const perMile = va.miles > 0 ? profit / va.miles : 0

    vTotIncome += va.income; vTotFuel += va.fuelCost; vTotDef += va.defCost; vTotRepair += repairCost; vTotService += maintenanceCost; vTotOther += otherExp; vTotExp += totalExp; vTotProfit += profit; vTotMiles += va.miles

    ws3.addRow([va.label, va.plate, va.driver, fmtNum(va.income), fmtNum(va.fuelCost), fmtNum(va.defCost), fmtNum(repairCost), fmtNum(maintenanceCost), fmtNum(otherExp), fmtNum(totalExp), fmtNum(profit), va.miles, fmtNum(perMile)])
    vRowIdx++
  })
  styleAltRows(ws3, 2, vRowIdx - 1, vehHeaders.length)

  const vTotPM = vTotMiles > 0 ? vTotProfit / vTotMiles : 0
  const vTotal = ws3.addRow([t('excel.total'), '', '', fmtNum(vTotIncome), fmtNum(vTotFuel), fmtNum(vTotDef), fmtNum(vTotRepair), fmtNum(vTotService), fmtNum(vTotOther), fmtNum(vTotExp), fmtNum(vTotProfit), vTotMiles, fmtNum(vTotPM)])
  vTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws3)

  // ---- SHEET 4: Expenses by Category ----
  const ws4 = wb.addWorksheet(t('excel.sheetCategories'))
  const catHeaders = [t('excel.category'), t('excel.amount') + ' (' + cs + ')', t('excel.entries'), t('excel.pctOfTotal')]
  ws4.addRow(catHeaders)
  styleHeaders(ws4, catHeaders.length)

  // Build category breakdown
  const catMap = {}
  const addCat = (key, amount) => {
    if (!amount) return
    if (!catMap[key]) catMap[key] = { sum: 0, count: 0 }
    catMap[key].sum += amount
    catMap[key].count += 1
  }
  fuels.forEach(f => addCat(t('excel.fuel'), f.cost))
  vehicleExps.forEach(e => {
    const cat = e.category || 'other'
    const catLabels = { def: t('excel.def'), oil: t('excel.oil'), parts: t('excel.parts') || 'Parts', supplies: t('excel.supplies'), hotel: t('excel.motel'), equipment: t('excel.equipment'), toll: t('excel.toll') || 'Toll' }
    addCat(catLabels[cat] || cat, e.amount)
  })
  serviceRecs.forEach(r => {
    addCat(isMaintenance(r) ? t('excel.maintenance') : t('excel.repair'), r.cost)
  })
  tireRecs.forEach(r => addCat(t('excel.tires'), r.cost))
  bytExps.forEach(e => addCat(t('excel.personalExpenses'), e.amount))

  const catTotalSum = Object.values(catMap).reduce((s, v) => s + v.sum, 0)
  let catRowIdx = 2
  let catTotCount = 0

  // Sort by sum descending
  Object.entries(catMap).sort(([, a], [, b]) => b.sum - a.sum).forEach(([key, data]) => {
    const pct = catTotalSum > 0 ? (data.sum / catTotalSum * 100) : 0
    catTotCount += data.count
    ws4.addRow([key, fmtNum(data.sum), data.count, fmtNum(pct) + '%'])
    catRowIdx++
  })
  styleAltRows(ws4, 2, catRowIdx - 1, catHeaders.length)

  const catTotal = ws4.addRow([t('excel.total'), fmtNum(catTotalSum), catTotCount, '100%'])
  catTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws4)

  // ---- SHEET 5: Payroll (Salaries) ----
  const ws5 = wb.addWorksheet(t('excel.sheetPayroll'))
  const payHeaders = [t('excel.driver'), t('excel.payType'), t('excel.rate'), t('excel.trips'), distLabelFull, t('excel.earned') + ' (' + cs + ')']
  ws5.addRow(payHeaders)
  styleHeaders(ws5, payHeaders.length)

  let payRowIdx = 2
  let payTotEarned = 0

  driverIds.forEach(dId => {
    const dTrips = trips.filter(t => t.user_id === dId)
    const name = getDriverName(dId)
    const miles = dTrips.reduce((s, t) => s + convDist(t.distance_km), 0)
    const tripsCount = dTrips.length
    const earned = dTrips.reduce((s, t) => s + (t.driver_pay || 0), 0)

    const dInfo = driverMap[dId]
    let rateStr = ''
    let typeStr = ''
    if (dInfo) {
      if (dInfo.pay_type === 'per_mile') { rateStr = cs + (dInfo.pay_rate || 0) + '/' + distLabel; typeStr = t('excel.perDist') + ' ' + distLabel }
      else if (dInfo.pay_type === 'percent') { rateStr = (dInfo.pay_rate || 0) + '%'; typeStr = '%' }
      else { rateStr = ''; typeStr = dInfo.pay_type || '' }
    }

    payTotEarned += earned
    ws5.addRow([name, typeStr, rateStr, tripsCount, miles, fmtNum(earned)])
    payRowIdx++
  })

  styleAltRows(ws5, 2, payRowIdx - 1, payHeaders.length)
  const payTotal = ws5.addRow([t('excel.total'), '', '', '', '', fmtNum(payTotEarned)])
  payTotal.eachCell(c => { c.font = boldFont })
  autoWidth(ws5)

  // ---- SHEET 6: All Expenses (detailed) ----
  const ws6 = wb.addWorksheet(t('excel.sheetAllExpenses'))
  const expHeaders = [t('excel.date'), t('excel.description'), t('excel.category'), isImperial ? t('excel.gallons') : t('excel.liters'), t('excel.amount') + ' (' + cs + ')', t('excel.odometer')]
  ws6.addRow(expHeaders)
  styleHeaders(ws6, expHeaders.length)

  const allExpenses = []
  fuels.forEach(f => allExpenses.push({ date: f.date, description: f.station || t('excel.fuel'), category: t('excel.fuel'), gal: convGal(f.liters), amount: f.cost || 0, odometer: f.odometer ? convDist(f.odometer) : '' }))
  serviceRecs.forEach(r => allExpenses.push({ date: r.date, description: r.description || r.type || t('excel.service'), category: isMaintenance(r) ? t('excel.maintenance') : t('excel.repair'), gal: '', amount: r.cost || 0, odometer: r.odometer ? convDist(r.odometer) : '' }))
  tireRecs.forEach(r => allExpenses.push({ date: r.installed_at, description: (r.brand || '') + ' ' + (r.model || ''), category: t('excel.tires'), gal: '', amount: r.cost || 0, odometer: '' }))
  vehicleExps.forEach(e => allExpenses.push({ date: e.date, description: e.description || '', category: e.category || 'Vehicle', gal: '', amount: e.amount || 0, odometer: '' }))
  bytExps.forEach(e => allExpenses.push({ date: e.date, description: e.description || e.category || '', category: t('excel.personalExpenses'), gal: '', amount: e.amount || 0, odometer: '' }))
  allExpenses.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let expRowIdx = 2
  let expTotalAmt = 0
  allExpenses.forEach(e => {
    expTotalAmt += e.amount
    ws6.addRow([e.date || '', e.description, e.category, e.gal !== '' ? fmtNum(e.gal) : '', fmtNum(e.amount), e.odometer])
    expRowIdx++
  })
  styleAltRows(ws6, 2, expRowIdx - 1, expHeaders.length)
  const expTotalRow = ws6.addRow([t('excel.total'), '', '', '', fmtNum(expTotalAmt), ''])
  expTotalRow.eachCell(c => { c.font = boldFont })
  autoWidth(ws6)

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
export async function exportToPDF(data, columns, title, filename, locale, subtitle) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { robotoRegularBase64, robotoBoldBase64 } = await import('./roboto-font.js')

  const head = [columns.map(c => c.header)]
  const body = data.map(row => columns.map(c => String(row[c.key] ?? '')))

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Embed Roboto font for Cyrillic support
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')

  // Title
  doc.setFontSize(16)
  doc.text(title, 14, 15)
  // Subtitle (vehicle name or period details)
  let nextY = 22
  if (subtitle) {
    doc.setFontSize(11)
    doc.setTextColor(80)
    doc.text(subtitle, 14, 22)
    doc.setTextColor(0)
    nextY = 28
  }

  autoTable(doc, {
    startY: nextY + 2,
    head,
    body,
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', font: 'Roboto' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14, right: 14 },
  })

  doc.save(filename || 'report.pdf')
}

/**
 * Export fleet P&L report as multi-page PDF
 * Page 1: P&L Summary
 * Page 2: By Vehicles
 * Page 3: Expenses by Category
 * Page 4: Payroll
 */
export async function exportFleetReportPDF(opts) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { robotoRegularBase64, robotoBoldBase64 } = await import('./roboto-font.js')

  const {
    vehicles: _vehicles,
    drivers: _drivers,
    fuels: _fuels,
    trips: _trips,
    serviceRecs: _serviceRecs,
    tireRecs: _tireRecs,
    vehicleExps: _vehicleExps,
    bytExps: _bytExps,
    period,
    cs,
    isImperial,
    filename,
    ownerProfile,
    driverMap: _driverMap,
    vehicleMap: _vehicleMap,
    t: _t,
  } = opts

  const t = typeof _t === 'function' ? _t : (key) => {
    const fallback = { 'excel.plReport': 'P&L Report', 'excel.period': 'Period', 'excel.totalIncome': 'Total Income', 'excel.totalExpense': 'Total Expense', 'excel.driverSalaries': 'Driver Salaries', 'excel.grossProfit': 'Gross Profit', 'excel.netProfit': 'Net Profit', 'excel.totalDist': 'Total', 'excel.totalTrips': 'Total Trips', 'excel.costPer': 'Cost per', 'excel.revPer': 'Revenue per', 'excel.vehicle': 'Vehicle', 'excel.plate': 'Plate', 'excel.driver': 'Driver', 'excel.fuel': 'Fuel', 'excel.def': 'DEF', 'excel.repair': 'Repair', 'excel.maintenance': 'Maintenance', 'excel.totalExpShort': 'Total Exp.', 'excel.profit': 'Profit', 'excel.total': 'TOTAL', 'excel.category': 'Category', 'excel.amount': 'Amount', 'excel.entries': 'Entries', 'excel.pctOfTotal': '% of Total', 'excel.trips': 'Trips', 'excel.earned': 'Earned', 'excel.sheetDrivers': 'By Drivers', 'excel.sheetVehicles': 'By Vehicles', 'excel.sheetCategories': 'Expenses by Category', 'excel.sheetPayroll': 'Payroll', 'excel.sheetAllExpenses': 'All Expenses', 'excel.oil': 'Oil', 'excel.parts': 'Parts', 'excel.supplies': 'Supplies', 'excel.motel': 'Motel', 'excel.equipment': 'Equipment', 'excel.toll': 'Toll', 'excel.tires': 'Tires', 'excel.personalExpenses': 'Personal Expenses (drivers)', 'excel.income': 'Income', 'excel.expense': 'Expense', 'excel.salary': 'Salary', 'excel.date': 'Date', 'excel.description': 'Description', 'excel.gallons': 'gal', 'excel.liters': 'liters', 'excel.odometer': 'Odometer', 'excel.service': 'Service', 'excel.distMiles': 'miles', 'excel.distKm': 'km' }
    return fallback[key] || key
  }

  const vehicles = Array.isArray(_vehicles) ? _vehicles : []
  const fuels = Array.isArray(_fuels) ? _fuels : []
  const trips = Array.isArray(_trips) ? _trips : []
  const serviceRecs = Array.isArray(_serviceRecs) ? _serviceRecs : []
  const tireRecs = Array.isArray(_tireRecs) ? _tireRecs : []
  const vehicleExps = Array.isArray(_vehicleExps) ? _vehicleExps : []
  const bytExps = Array.isArray(_bytExps) ? _bytExps : []
  const driverMap = _driverMap && typeof _driverMap === 'object' ? _driverMap : {}

  const convDist = (km) => isImperial ? Math.round((km || 0) * 0.621371) : Math.round(km || 0)
  const distLabelFull = isImperial ? t('excel.distMiles') : t('excel.distKm')
  const fmtNum = (n) => (n == null || isNaN(n)) ? '' : Number(Number(n).toFixed(2))

  const getDriverName = (userId) => {
    if (driverMap[userId]) return driverMap[userId].name
    if (userId === ownerProfile?.id) return ownerProfile?.full_name || ownerProfile?.name || 'Owner'
    return ''
  }

  const getVehicleDriver = (vehicleId) => {
    if (_vehicleMap && _vehicleMap[vehicleId]) return _vehicleMap[vehicleId].driver
    return ''
  }

  const MAINT_CATS = ['oil_change', 'filters', 'belts_chains', 'coolant', 'diagnostics', 'brake_pads', 'spark_plugs', 'maintenance', 'maintenance_other']
  const isMaintenance = (r) => MAINT_CATS.includes((r.category || '').toLowerCase())

  // --- Aggregates ---
  const driverIds = [...new Set(trips.map(tr => tr.user_id))]
  const totTrips = trips.length
  const totIncome = trips.reduce((s, tr) => s + (tr.income || 0), 0)
  const totMiles = trips.reduce((s, tr) => s + convDist(tr.distance_km), 0)
  const totSalary = trips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
  const totBytExpense = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totExpense = fuels.reduce((s, f) => s + (f.cost || 0), 0)
    + serviceRecs.reduce((s, r) => s + (r.cost || 0), 0)
    + tireRecs.reduce((s, r) => s + (r.cost || 0), 0)
    + vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
    + totBytExpense
  const totGrossProfit = totIncome - totExpense
  const totNetProfit = totIncome - totExpense - totSalary
  const totCostPerMile = totMiles > 0 ? totExpense / totMiles : 0
  const totRevPerMile = totMiles > 0 ? totIncome / totMiles : 0

  // --- Create PDF ---
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')

  const pageTitle = t('excel.plReport') + ' \u2014 ' + (period || '')
  const tableOpts = {
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', font: 'Roboto' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', font: 'Roboto' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14, right: 14 },
  }

  const drawPageHeader = () => {
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(245, 158, 11)
    doc.text(pageTitle, 14, 15)
    doc.setTextColor(0)
    doc.setFont('Roboto', 'normal')
  }

  // ======= PAGE 1: P&L Summary =======
  drawPageHeader()
  doc.setFontSize(12)
  doc.setFont('Roboto', 'bold')
  doc.text('P&L', 14, 25)
  doc.setFont('Roboto', 'normal')

  const summaryRows = [
    [t('excel.period'), period || ''],
    [t('excel.totalIncome'), cs + ' ' + fmtNum(totIncome)],
    [t('excel.totalExpense'), cs + ' ' + fmtNum(totExpense)],
    [t('excel.driverSalaries'), cs + ' ' + fmtNum(totSalary)],
    [t('excel.grossProfit'), cs + ' ' + fmtNum(totGrossProfit)],
    [t('excel.netProfit'), cs + ' ' + fmtNum(totNetProfit)],
    [t('excel.totalDist') + ' ' + distLabelFull, String(totMiles)],
    [t('excel.totalTrips'), String(totTrips)],
    [t('excel.costPer') + ' ' + distLabelFull, cs + ' ' + fmtNum(totCostPerMile)],
    [t('excel.revPer') + ' ' + distLabelFull, cs + ' ' + fmtNum(totRevPerMile)],
  ]

  autoTable(doc, {
    startY: 30,
    body: summaryRows,
    ...tableOpts,
    headStyles: undefined,
    showHead: false,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const label = data.row.raw[0]
        if (label === t('excel.grossProfit') || label === t('excel.netProfit')) {
          const val = label === t('excel.grossProfit') ? totGrossProfit : totNetProfit
          data.cell.styles.textColor = val >= 0 ? [34, 197, 94] : [239, 68, 68]
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
    margin: { left: 14, right: 14 },
    tableWidth: 160,
  })

  // ======= PAGE 2: By Drivers =======
  doc.addPage()
  drawPageHeader()
  doc.setFontSize(12)
  doc.setFont('Roboto', 'bold')
  doc.text(t('excel.sheetDrivers'), 14, 25)
  doc.setFont('Roboto', 'normal')

  const drvHeaders = [
    t('excel.driver'), t('excel.vehicle'), t('excel.plate'),
    t('excel.trips'), distLabelFull,
    t('excel.income') + ' (' + cs + ')', t('excel.expense') + ' (' + cs + ')',
    t('excel.salary') + ' (' + cs + ')', t('excel.profit') + ' (' + cs + ')',
    cs + '/' + distLabelFull,
  ]

  let drvTotIncome = 0, drvTotExpense = 0, drvTotSalary = 0, drvTotMiles = 0, drvTotTrips = 0

  const getVehicleLabel = (vehicleId) => {
    if (_vehicleMap && _vehicleMap[vehicleId]) return _vehicleMap[vehicleId].label
    return ''
  }
  const getVehiclePlate = (vehicleId) => {
    if (_vehicleMap && _vehicleMap[vehicleId]) return _vehicleMap[vehicleId].plate
    return ''
  }

  const drvBody = driverIds.map(dId => {
    const dTrips = trips.filter(tr => tr.user_id === dId)
    const dFuels = fuels.filter(f => f.user_id === dId)
    const dService = serviceRecs.filter(s => s.user_id === dId)
    const dTires = tireRecs.filter(tr => tr.user_id === dId)
    const dVehExp = vehicleExps.filter(e => e.user_id === dId)

    const name = getDriverName(dId)
    const vIds = [...new Set(dTrips.map(tr => tr.vehicle_id).filter(Boolean))]
    const vehicleLabel = vIds.map(vid => getVehicleLabel(vid)).filter(Boolean).join(', ')
    const plateLabel = vIds.map(vid => getVehiclePlate(vid)).filter(Boolean).join(', ')
    const tripsCount = dTrips.length
    const miles = dTrips.reduce((s, tr) => s + convDist(tr.distance_km), 0)
    const income = dTrips.reduce((s, tr) => s + (tr.income || 0), 0)
    const expense = dFuels.reduce((s, f) => s + (f.cost || 0), 0)
      + dService.reduce((s, r) => s + (r.cost || 0), 0)
      + dTires.reduce((s, r) => s + (r.cost || 0), 0)
      + dVehExp.reduce((s, e) => s + (e.amount || 0), 0)
    const salary = dTrips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
    const profit = income - expense - salary
    const perMile = miles > 0 ? profit / miles : 0

    drvTotIncome += income; drvTotExpense += expense; drvTotSalary += salary; drvTotMiles += miles; drvTotTrips += tripsCount

    return [name, vehicleLabel, plateLabel, tripsCount, miles, fmtNum(income), fmtNum(expense), fmtNum(salary), fmtNum(profit), fmtNum(perMile)]
  })

  const drvTotProfit = drvTotIncome - drvTotExpense - drvTotSalary
  const drvTotPM = drvTotMiles > 0 ? drvTotProfit / drvTotMiles : 0
  drvBody.push([t('excel.total'), '', '', drvTotTrips, drvTotMiles, fmtNum(drvTotIncome), fmtNum(drvTotExpense), fmtNum(drvTotSalary), fmtNum(drvTotProfit), fmtNum(drvTotPM)])

  autoTable(doc, {
    startY: 30,
    head: [drvHeaders],
    body: drvBody,
    ...tableOpts,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === drvBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ======= PAGE 3: By Vehicles =======
  doc.addPage()
  drawPageHeader()
  doc.setFontSize(12)
  doc.setFont('Roboto', 'bold')
  doc.text(t('excel.sheetVehicles'), 14, 25)
  doc.setFont('Roboto', 'normal')

  const vehHeaders = [
    t('excel.vehicle'), t('excel.plate'), t('excel.driver'),
    t('excel.fuel') + ' (' + cs + ')', t('excel.def') + ' (' + cs + ')',
    t('excel.repair') + ' (' + cs + ')', t('excel.maintenance') + ' (' + cs + ')',
    t('excel.totalExpShort') + ' (' + cs + ')', t('excel.profit') + ' (' + cs + ')',
  ]

  let vTotFuel = 0, vTotDef = 0, vTotRepair = 0, vTotMaint = 0, vTotExp = 0, vTotProfit = 0

  const vehBody = vehicles.map(v => {
    const vTrips = trips.filter(tr => tr.vehicle_id === v.id)
    const vFuels = fuels.filter(f => f.vehicle_id === v.id)
    const vService = serviceRecs.filter(s => s.vehicle_id === v.id)
    const vTires = tireRecs.filter(tr => tr.vehicle_id === v.id)
    const vVehExp = vehicleExps.filter(e => e.vehicle_id === v.id)

    const income = vTrips.reduce((s, tr) => s + (tr.income || 0), 0)
    const fuelCost = vFuels.reduce((s, f) => s + (f.cost || 0), 0)
    const defCost = vVehExp.filter(e => e.category === 'def').reduce((s, e) => s + (e.amount || 0), 0)
    const repairCost = vService.filter(s => !isMaintenance(s)).reduce((s, r) => s + (r.cost || 0), 0)
    const maintenanceCost = vService.filter(s => isMaintenance(s)).reduce((s, r) => s + (r.cost || 0), 0)
    const tireCost = vTires.reduce((s, r) => s + (r.cost || 0), 0)
    const otherVehExp = vVehExp.filter(e => e.category !== 'def').reduce((s, e) => s + (e.amount || 0), 0)
    const totalExp = fuelCost + defCost + repairCost + maintenanceCost + tireCost + otherVehExp
    const profit = income - totalExp

    vTotFuel += fuelCost; vTotDef += defCost; vTotRepair += repairCost
    vTotMaint += maintenanceCost; vTotExp += totalExp; vTotProfit += profit

    const label = ((v.brand || '') + ' ' + (v.model || '')).trim()
    const driver = v.driver_name || getVehicleDriver(v.id)
    return [label, v.plate_number || '', driver, fmtNum(fuelCost), fmtNum(defCost), fmtNum(repairCost), fmtNum(maintenanceCost), fmtNum(totalExp), fmtNum(profit)]
  })

  vehBody.push([
    t('excel.total'), '', '', fmtNum(vTotFuel), fmtNum(vTotDef), fmtNum(vTotRepair), fmtNum(vTotMaint), fmtNum(vTotExp), fmtNum(vTotProfit),
  ])

  autoTable(doc, {
    startY: 30,
    head: [vehHeaders],
    body: vehBody,
    ...tableOpts,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === vehBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ======= PAGE 4: Expenses by Category =======
  doc.addPage()
  drawPageHeader()
  doc.setFontSize(12)
  doc.setFont('Roboto', 'bold')
  doc.text(t('excel.sheetCategories'), 14, 25)
  doc.setFont('Roboto', 'normal')

  const catMap = {}
  const addCat = (key, amount) => {
    if (!amount) return
    if (!catMap[key]) catMap[key] = { sum: 0, count: 0 }
    catMap[key].sum += amount
    catMap[key].count += 1
  }
  fuels.forEach(f => addCat(t('excel.fuel'), f.cost))
  vehicleExps.forEach(e => {
    const cat = e.category || 'other'
    const catLabels = { def: t('excel.def'), oil: t('excel.oil'), parts: t('excel.parts'), supplies: t('excel.supplies'), hotel: t('excel.motel'), equipment: t('excel.equipment'), toll: t('excel.toll') }
    addCat(catLabels[cat] || cat, e.amount)
  })
  serviceRecs.forEach(r => addCat(isMaintenance(r) ? t('excel.maintenance') : t('excel.repair'), r.cost))
  tireRecs.forEach(r => addCat(t('excel.tires'), r.cost))
  bytExps.forEach(e => addCat(t('excel.personalExpenses'), e.amount))

  const catTotalSum = Object.values(catMap).reduce((s, v) => s + v.sum, 0)
  let catTotCount = 0

  const catHeaders = [t('excel.category'), t('excel.amount') + ' (' + cs + ')', t('excel.entries'), t('excel.pctOfTotal')]
  const catBody = Object.entries(catMap)
    .sort(([, a], [, b]) => b.sum - a.sum)
    .map(([key, data]) => {
      const pct = catTotalSum > 0 ? (data.sum / catTotalSum * 100) : 0
      catTotCount += data.count
      return [key, fmtNum(data.sum), data.count, fmtNum(pct) + '%']
    })

  catBody.push([t('excel.total'), fmtNum(catTotalSum), catTotCount, '100%'])

  autoTable(doc, {
    startY: 30,
    head: [catHeaders],
    body: catBody,
    ...tableOpts,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === catBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ======= PAGE 5: Payroll =======
  doc.addPage()
  drawPageHeader()
  doc.setFontSize(12)
  doc.setFont('Roboto', 'bold')
  doc.text(t('excel.sheetPayroll'), 14, 25)
  doc.setFont('Roboto', 'normal')

  const payHeaders = [t('excel.driver'), t('excel.trips'), distLabelFull, t('excel.earned') + ' (' + cs + ')']
  let payTotEarned = 0

  const payBody = driverIds.map(dId => {
    const dTrips = trips.filter(tr => tr.user_id === dId)
    const name = getDriverName(dId)
    const miles = dTrips.reduce((s, tr) => s + convDist(tr.distance_km), 0)
    const tripsCount = dTrips.length
    const earned = dTrips.reduce((s, tr) => s + (tr.driver_pay || 0), 0)
    payTotEarned += earned
    return [name, tripsCount, miles, fmtNum(earned)]
  })

  payBody.push([t('excel.total'), '', '', fmtNum(payTotEarned)])

  autoTable(doc, {
    startY: 30,
    head: [payHeaders],
    body: payBody,
    ...tableOpts,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === payBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ======= PAGE 6: All Expenses =======
  doc.addPage()
  drawPageHeader()
  doc.setFontSize(12)
  doc.setFont('Roboto', 'bold')
  doc.text(t('excel.sheetAllExpenses'), 14, 25)
  doc.setFont('Roboto', 'normal')

  const convGal = (liters) => isImperial ? Math.round((liters || 0) * 0.264172 * 100) / 100 : (liters || 0)

  const expHeaders = [
    t('excel.date'), t('excel.description'), t('excel.category'),
    isImperial ? t('excel.gallons') : t('excel.liters'),
    t('excel.amount') + ' (' + cs + ')', t('excel.odometer'),
  ]

  const allExpenses = []
  fuels.forEach(f => allExpenses.push({ date: f.date, description: f.station || t('excel.fuel'), category: t('excel.fuel'), gal: convGal(f.liters), amount: f.cost || 0, odometer: f.odometer ? convDist(f.odometer) : '' }))
  serviceRecs.forEach(r => allExpenses.push({ date: r.date, description: r.description || r.type || t('excel.service'), category: isMaintenance(r) ? t('excel.maintenance') : t('excel.repair'), gal: '', amount: r.cost || 0, odometer: r.odometer ? convDist(r.odometer) : '' }))
  tireRecs.forEach(r => allExpenses.push({ date: r.installed_at, description: ((r.brand || '') + ' ' + (r.model || '')).trim(), category: t('excel.tires'), gal: '', amount: r.cost || 0, odometer: '' }))
  vehicleExps.forEach(e => allExpenses.push({ date: e.date, description: e.description || '', category: e.category || 'Vehicle', gal: '', amount: e.amount || 0, odometer: '' }))
  bytExps.forEach(e => allExpenses.push({ date: e.date, description: e.description || e.category || '', category: t('excel.personalExpenses'), gal: '', amount: e.amount || 0, odometer: '' }))
  allExpenses.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let expTotalAmt = 0
  const expBody = allExpenses.map(e => {
    expTotalAmt += e.amount
    return [e.date || '', e.description, e.category, e.gal !== '' ? fmtNum(e.gal) : '', fmtNum(e.amount), e.odometer]
  })
  expBody.push([t('excel.total'), '', '', '', fmtNum(expTotalAmt), ''])

  autoTable(doc, {
    startY: 30,
    head: [expHeaders],
    body: expBody,
    ...tableOpts,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === expBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  doc.save(filename || 'fleet_pl_report.pdf')
}
