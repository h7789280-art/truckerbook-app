// ====== Shared Excel styling constants & helpers (ExcelJS) ======
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }  // gray
const HEADER_FONT = { bold: true, size: 11 }
const HEADER_BORDER_BOTTOM = { bottom: { style: 'thin', color: { argb: 'FF999999' } } }

const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }  // yellow
const TOTAL_FONT = { bold: true, size: 11 }
const TOTAL_BORDER_TOP = { top: { style: 'thin', color: { argb: 'FF999999' } } }

const FUEL_PER_DIST_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }  // light green
const FUEL_PER_DIST_FONT = { bold: true, size: 11 }

/** Apply styled header row (row 1) — gray bg, bold, bottom border */
const styledHeaders = (ws, colCount) => {
  const row = ws.getRow(1)
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.border = HEADER_BORDER_BOTTOM
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  row.height = 24
}

/** Apply TOTAL row styling — yellow bg, bold, top border */
const styleTotalRow = (ws, rowNum, colCount) => {
  const row = ws.getRow(rowNum)
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.fill = TOTAL_FILL
    cell.font = TOTAL_FONT
    cell.border = TOTAL_BORDER_TOP
  }
}

/** Apply fuel-per-distance row styling — green bg, bold */
const styleFuelPerDistRow = (ws, rowNum, colCount) => {
  const row = ws.getRow(rowNum)
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.fill = FUEL_PER_DIST_FILL
    cell.font = FUEL_PER_DIST_FONT
  }
}

/** Auto-fit column widths */
const styledAutoWidth = (ws) => {
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

/** Alternating light-yellow rows */
const LIGHT_YELLOW_ALT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } }
const styledAltRows = (ws, startRow, endRow, colCount) => {
  for (let r = startRow; r <= endRow; r++) {
    if ((r - startRow) % 2 === 1) {
      const row = ws.getRow(r)
      for (let c = 1; c <= colCount; c++) {
        row.getCell(c).fill = LIGHT_YELLOW_ALT
      }
    }
  }
}

/**
 * @param {Array<Object>} data
 * @param {Array<{header: string, key: string}>} columns
 * @param {string} filename
 */
export async function exportToExcel(data, columns, filename) {
  const excelMod = await import('exceljs')
  const ExcelJS = excelMod.default || excelMod
  const fileSaverMod = await import('file-saver')
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default?.saveAs || fileSaverMod.default

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Report')

  // Headers
  const headers = columns.map(c => c.header)
  ws.addRow(headers)
  styledHeaders(ws, headers.length)

  // Data rows
  data.forEach(row => {
    const vals = columns.map(c => {
      const v = row[c.key] ?? ''
      return (v && typeof v === 'object' && v.hyperlink) ? (v.text || v.hyperlink) : v
    })
    ws.addRow(vals)
  })

  // Add hyperlinks for cells with link data
  data.forEach((row, ri) => {
    columns.forEach((c, ci) => {
      const v = row[c.key]
      if (v && typeof v === 'object' && v.hyperlink) {
        const cell = ws.getRow(ri + 2).getCell(ci + 1)
        cell.value = { text: v.text || v.hyperlink, hyperlink: v.hyperlink }
        cell.font = { color: { argb: 'FF0563C1' }, underline: true }
      }
    })
  })

  styledAutoWidth(ws)

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
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
export async function exportToExcelWithSummary(opts) {
  const excelMod = await import('exceljs')
  const ExcelJS = excelMod.default || excelMod
  const fileSaverMod = await import('file-saver')
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default?.saveAs || fileSaverMod.default

  const {
    summary,
    detailsData,
    detailsColumns,
    detailsSheetName,
    labels,
    filename,
    categoryData,
    categorySheetName,
    fuelTotals,
  } = opts

  const cs = summary.currencySymbol || '$'
  const wb = new ExcelJS.Workbook()
  const colCount = detailsColumns.length

  // --- Sheet 1: Details (by date) ---
  const ws1 = wb.addWorksheet(detailsSheetName || 'By date')
  const headers = detailsColumns.map(c => c.header)
  ws1.addRow(headers)
  styledHeaders(ws1, colCount)

  let dataRowCount = 0
  detailsData.forEach(row => {
    ws1.addRow(detailsColumns.map(c => row[c.key] ?? ''))
    dataRowCount++
  })

  styledAltRows(ws1, 2, 1 + dataRowCount, colCount)

  // Add totals row
  const amountIdx = detailsColumns.findIndex(c => c.key === 'amount')
  let totalRowNum = 0
  let fuelRowNum = 0
  if (amountIdx >= 0 && detailsData.length > 0) {
    ws1.addRow([]) // empty separator
    const totalVals = detailsColumns.map(() => '')
    totalVals[0] = labels.total || 'TOTAL'
    totalVals[amountIdx] = Math.round(detailsData.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100

    if (fuelTotals) {
      const volIdx = detailsColumns.findIndex(c => c.key === fuelTotals.volumeKey)
      const priceIdx = detailsColumns.findIndex(c => c.key === fuelTotals.priceKey)
      if (volIdx >= 0) {
        totalVals[volIdx] = Math.round(detailsData.reduce((s, r) => s + (Number(r[fuelTotals.volumeKey]) || 0), 0) * 100) / 100
      }
      if (priceIdx >= 0) {
        const prices = detailsData.map(r => Number(r[fuelTotals.priceKey]) || 0).filter(v => v > 0)
        totalVals[priceIdx] = prices.length > 0
          ? `${Math.round((prices.reduce((s, v) => s + v, 0) / prices.length) * 100) / 100} (${labels.average || 'avg'})`
          : ''
      }
    }

    ws1.addRow(totalVals)
    totalRowNum = ws1.rowCount
    styleTotalRow(ws1, totalRowNum, colCount)

    // Fuel per mile/km row
    if (fuelTotals && fuelTotals.fuelPerDistLabel) {
      const odomIdx = detailsColumns.findIndex(c => c.key === fuelTotals.odometerKey)
      if (odomIdx >= 0) {
        const odomValues = detailsData.map(r => Number(r[fuelTotals.odometerKey]) || 0).filter(v => v > 0)
        if (odomValues.length >= 2) {
          const maxOdom = Math.max(...odomValues)
          const minOdom = Math.min(...odomValues)
          const totalDist = maxOdom - minOdom
          const totalAmount = detailsData.reduce((s, r) => s + (Number(r[fuelTotals.amountKey]) || 0), 0)
          if (totalDist > 0) {
            const fuelPerDistVals = detailsColumns.map(() => '')
            fuelPerDistVals[0] = fuelTotals.fuelPerDistLabel
            fuelPerDistVals[amountIdx] = Math.round((totalAmount / totalDist) * 100) / 100
            ws1.addRow(fuelPerDistVals)
            fuelRowNum = ws1.rowCount
            styleFuelPerDistRow(ws1, fuelRowNum, colCount)
          }
        }
      }
    }
  }

  styledAutoWidth(ws1)

  // --- Sheet 2: By category ---
  const ws2 = wb.addWorksheet(categorySheetName || 'By category')
  const catHeaders = [
    labels.category || 'Category',
    labels.entriesCount || 'Entries',
    `${labels.amount || 'Amount'} (${cs})`,
  ]
  ws2.addRow(catHeaders)
  styledHeaders(ws2, 3)

  let catDataRows = 0
  ;(categoryData || []).forEach(c => {
    ws2.addRow([c.label, c.count, c.amount])
    catDataRows++
  })
  styledAltRows(ws2, 2, 1 + catDataRows, 3)

  const catTotal = (categoryData || []).reduce((s, c) => s + (c.amount || 0), 0)
  const catCountTotal = (categoryData || []).reduce((s, c) => s + (c.count || 0), 0)
  ws2.addRow([]) // separator
  ws2.addRow([labels.total || 'TOTAL', catCountTotal, catTotal])
  styleTotalRow(ws2, ws2.rowCount, 3)

  styledAutoWidth(ws2)

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
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
export async function exportAllVehiclesExcel(opts) {
  const excelMod = await import('exceljs')
  const ExcelJS = excelMod.default || excelMod
  const fileSaverMod = await import('file-saver')
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default?.saveAs || fileSaverMod.default

  const { allRows, columns, categoryData, vehicleSummary, labels, sheetNames, cs, filename, fuelTotals } = opts
  const wb = new ExcelJS.Workbook()
  const colCount = columns.length

  // --- Sheet 1: By date ---
  const ws1 = wb.addWorksheet((sheetNames && sheetNames.byDate) || 'By date')
  const headers = columns.map(c => c.header)
  ws1.addRow(headers)
  styledHeaders(ws1, colCount)

  let dataRowCount = 0
  allRows.forEach(row => {
    ws1.addRow(columns.map(c => row[c.key] ?? ''))
    dataRowCount++
  })
  styledAltRows(ws1, 2, 1 + dataRowCount, colCount)

  const amountIdx = columns.findIndex(c => c.key === 'amount')
  if (amountIdx >= 0 && allRows.length > 0) {
    ws1.addRow([]) // separator
    const totalVals = columns.map(() => '')
    totalVals[0] = labels.total || 'TOTAL'
    totalVals[amountIdx] = Math.round(allRows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100

    if (fuelTotals) {
      const volIdx = columns.findIndex(c => c.key === fuelTotals.volumeKey)
      const priceIdx = columns.findIndex(c => c.key === fuelTotals.priceKey)
      if (volIdx >= 0) {
        totalVals[volIdx] = Math.round(allRows.reduce((s, r) => s + (Number(r[fuelTotals.volumeKey]) || 0), 0) * 100) / 100
      }
      if (priceIdx >= 0) {
        const prices = allRows.map(r => Number(r[fuelTotals.priceKey]) || 0).filter(v => v > 0)
        totalVals[priceIdx] = prices.length > 0
          ? `${Math.round((prices.reduce((s, v) => s + v, 0) / prices.length) * 100) / 100} (${labels.average || 'avg'})`
          : ''
      }
    }

    ws1.addRow(totalVals)
    styleTotalRow(ws1, ws1.rowCount, colCount)

    // Fuel per mile/km row
    if (fuelTotals && fuelTotals.fuelPerDistLabel) {
      const odomValues = allRows.map(r => Number(r[fuelTotals.odometerKey]) || 0).filter(v => v > 0)
      if (odomValues.length >= 2) {
        const totalDist = Math.max(...odomValues) - Math.min(...odomValues)
        const totalAmount = allRows.reduce((s, r) => s + (Number(r[fuelTotals.amountKey]) || 0), 0)
        if (totalDist > 0) {
          const fuelPerDistVals = columns.map(() => '')
          fuelPerDistVals[0] = fuelTotals.fuelPerDistLabel
          fuelPerDistVals[amountIdx] = Math.round((totalAmount / totalDist) * 100) / 100
          ws1.addRow(fuelPerDistVals)
          styleFuelPerDistRow(ws1, ws1.rowCount, colCount)
        }
      }
    }
  }

  styledAutoWidth(ws1)

  // --- Sheet 2: By category ---
  const ws2 = wb.addWorksheet((sheetNames && sheetNames.byCategory) || 'By category')
  const catHeaders = [
    labels.category || 'Category',
    labels.entriesCount || 'Entries',
    `${labels.amount || 'Amount'} (${cs || '$'})`,
  ]
  ws2.addRow(catHeaders)
  styledHeaders(ws2, 3)

  let catDataRows = 0
  ;(categoryData || []).forEach(c => {
    ws2.addRow([c.label, c.count, c.amount])
    catDataRows++
  })
  styledAltRows(ws2, 2, 1 + catDataRows, 3)

  const catTotal = (categoryData || []).reduce((s, c) => s + (c.amount || 0), 0)
  const catCountTotal = (categoryData || []).reduce((s, c) => s + (c.count || 0), 0)
  ws2.addRow([]) // separator
  ws2.addRow([labels.total || 'TOTAL', catCountTotal, catTotal])
  styleTotalRow(ws2, ws2.rowCount, 3)
  styledAutoWidth(ws2)

  // --- Sheet 3: By vehicle ---
  if (vehicleSummary && vehicleSummary.length > 0) {
    const ws3 = wb.addWorksheet((sheetNames && sheetNames.byVehicle) || 'By vehicle')
    const vehHeaders = [
      labels.vehicle || 'Vehicle',
      labels.plate || 'Plate',
      labels.driver || 'Driver',
      `${labels.amount || 'Amount'} (${cs || '$'})`,
      labels.entriesCount || 'Entries',
    ]
    ws3.addRow(vehHeaders)
    styledHeaders(ws3, 5)

    let vehDataRows = 0
    vehicleSummary.forEach(v => {
      ws3.addRow([v.name, v.plate, v.driver, v.amount, v.count])
      vehDataRows++
    })
    styledAltRows(ws3, 2, 1 + vehDataRows, 5)

    const vehTotalAmount = vehicleSummary.reduce((s, v) => s + (v.amount || 0), 0)
    const vehTotalCount = vehicleSummary.reduce((s, v) => s + (v.count || 0), 0)
    ws3.addRow([]) // separator
    ws3.addRow([labels.total || 'TOTAL', '', '', vehTotalAmount, vehTotalCount])
    styleTotalRow(ws3, ws3.rowCount, 5)
    styledAutoWidth(ws3)
  }

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
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
    t: _t,
    role, // user role: 'owner_operator' | 'driver' | 'company'
  } = opts

  // Translation helper with fallback
  const t = typeof _t === 'function' ? _t : (key) => {
    const fb = { 'excel.sheetSummary': 'Summary', 'excel.sheetTrips': 'Trips', 'excel.sheetExpenses': 'Expenses', 'excel.sheetPaySheet': 'Pay Sheet', 'excel.driver': 'Driver', 'excel.phone': 'Phone', 'excel.vehicle': 'Vehicle', 'excel.period': 'Period', 'excel.trips': 'Trips', 'excel.odometer': 'Odometer', 'excel.hoursOnRoad': 'Hours on road', 'excel.earned': 'Earned', 'excel.personalExpenses': 'Personal Expenses (drivers)', 'excel.netClean': 'Net clean', 'excel.vehicleExpLabel': 'Vehicle expenses', 'excel.amount': 'Amount', 'excel.total': 'TOTAL', 'excel.costPer': 'Cost per', 'excel.tripIncomeLabel': 'Trip income', 'excel.netProfit': 'Net Profit', 'excel.grossProfit': 'Gross Profit', 'excel.date': 'Date', 'excel.origin': 'From', 'excel.destination': 'To', 'excel.distMiles': 'miles', 'excel.income': 'Income', 'excel.myEarnings': 'My earnings', 'excel.description': 'Description', 'excel.category': 'Category', 'excel.gallons': 'gal', 'excel.route': 'Route', 'excel.rate': 'Rate', 'excel.totalEarned': 'TOTAL earned', 'excel.advancesLabel': 'Advances', 'excel.totalAdvances': 'Total advances', 'excel.toPay': 'TO PAY', 'byt.personalExpenses': 'Personal expenses' }
    return fb[key] || key
  }

  const wb = new ExcelJS.Workbook()

  const ORANGE = 'F59E0B'

  const fmtNum = (n) => {
    if (n == null || isNaN(n)) return ''
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  // ---- SHEET 1: Summary ----
  const ws1 = wb.addWorksheet(t('excel.sheetSummary'))

  const addInfoRow = (label, value) => {
    const r = ws1.addRow([label, value])
    r.getCell(1).font = { bold: true, size: 11 }
    r.getCell(2).font = { size: 11 }
  }

  addInfoRow(t('excel.driver'), driverName || '')
  addInfoRow(t('excel.phone'), driverPhone || '')
  addInfoRow(t('excel.vehicle'), vehicleInfo || '')
  addInfoRow(t('excel.period'), period || '')
  ws1.addRow([])

  addInfoRow(t('excel.trips'), tripsCount ?? 0)
  addInfoRow(t('excel.odometer') + ' (' + (distLabel || 'mi') + ')', fmtNum(totalMileage))
  addInfoRow(t('excel.hoursOnRoad'), fmtNum(totalHours))
  ws1.addRow([])

  const isOwner = role === 'owner_operator'
  if (isOwner) {
    const grossProfit = (tripIncome || 0) - (vehicleExpenseTotal || 0)
    addInfoRow(t('excel.tripIncomeLabel') + ' (' + cs + ')', fmtNum(tripIncome))
    addInfoRow(t('excel.vehicleExpLabel') + ' (' + cs + ')', fmtNum(vehicleExpenseTotal))
    addInfoRow(t('excel.grossProfit') + ' (' + cs + ')', fmtNum(grossProfit))
    addInfoRow(t('byt.personalExpenses') + ' (' + cs + ')', fmtNum(personalExpenses))
    addInfoRow(t('excel.netClean') + ' (' + cs + ')', fmtNum(grossProfit - (personalExpenses || 0)))
    ws1.addRow([])
  } else if (payType && payType !== 'none') {
    addInfoRow(t('excel.earned') + ' (' + cs + ')', fmtNum(earned))
    addInfoRow(t('excel.personalExpenses') + ' (' + cs + ')', fmtNum(personalExpenses))
    addInfoRow(t('excel.netClean') + ' (' + cs + ')', fmtNum(netClean))
    ws1.addRow([])
  }

  // Vehicle expenses breakdown
  const catHeaderRow = ws1.addRow([t('excel.vehicleExpLabel'), t('excel.amount') + ' (' + cs + ')'])
  catHeaderRow.getCell(1).fill = HEADER_FILL
  catHeaderRow.getCell(1).font = HEADER_FONT
  catHeaderRow.getCell(1).border = HEADER_BORDER_BOTTOM
  catHeaderRow.getCell(2).fill = HEADER_FILL
  catHeaderRow.getCell(2).font = HEADER_FONT
  catHeaderRow.getCell(2).border = HEADER_BORDER_BOTTOM

  if (vehicleExpenseCategories) {
    vehicleExpenseCategories.forEach(cat => {
      ws1.addRow([cat.label, fmtNum(cat.amount)])
    })
  }
  ws1.addRow([t('excel.total'), fmtNum(vehicleExpenseTotal ?? 0)])
  styleTotalRow(ws1, ws1.rowCount, 2)

  ws1.addRow([])
  addInfoRow(t('excel.odometer') + ' (' + (distLabel || 'mi') + ')', fmtNum(totalMileage))
  if (totalMileage > 0) {
    addInfoRow(t('excel.costPer') + ' ' + (distLabel || 'mi') + ' (' + cs + ')', fmtNum((vehicleExpenseTotal || 0) / totalMileage))
  }

  if (!isOwner && payType === 'none') {
    ws1.addRow([])
    const grossProfit = (tripIncome || 0) - (vehicleExpenseTotal || 0)
    addInfoRow(t('excel.tripIncomeLabel') + ' (' + cs + ')', fmtNum(tripIncome))
    addInfoRow(t('excel.vehicleExpLabel') + ' (' + cs + ')', fmtNum(vehicleExpenseTotal))
    addInfoRow(t('excel.grossProfit') + ' (' + cs + ')', fmtNum(grossProfit))
    addInfoRow(t('byt.personalExpenses') + ' (' + cs + ')', fmtNum(personalExpenses))
    addInfoRow(t('excel.netClean') + ' (' + cs + ')', fmtNum(grossProfit - (personalExpenses || 0)))
  }

  ws1.getColumn(1).width = 30
  ws1.getColumn(2).width = 20

  // ---- SHEET 2: Trips ----
  const ws2 = wb.addWorksheet(t('excel.sheetTrips'))
  const tripHeaders = [t('excel.date'), t('excel.origin'), t('excel.destination'), t('excel.distMiles'), t('excel.income') + ' (' + cs + ')']
  if (!isOwner && payType && payType !== 'none') tripHeaders.push(t('excel.myEarnings') + ' (' + cs + ')')
  ws2.addRow(tripHeaders)
  styledHeaders(ws2, tripHeaders.length)

  let tripRowIdx = 2
  ;(trips || []).forEach(tr => {
    const row = [tr.date, tr.origin, tr.destination, fmtNum(tr.miles), fmtNum(tr.income)]
    if (!isOwner && payType && payType !== 'none') row.push(fmtNum(tr.driverPay))
    ws2.addRow(row)
    tripRowIdx++
  })

  styledAltRows(ws2, 2, tripRowIdx - 1, tripHeaders.length)

  // TOTAL row
  const tripTotalRow = [t('excel.total'), '', '', fmtNum((trips || []).reduce((s, tr2) => s + (tr2.miles || 0), 0)), fmtNum((trips || []).reduce((s, tr2) => s + (tr2.income || 0), 0))]
  if (!isOwner && payType && payType !== 'none') tripTotalRow.push(fmtNum((trips || []).reduce((s, tr2) => s + (tr2.driverPay || 0), 0)))
  ws2.addRow(tripTotalRow)
  styleTotalRow(ws2, ws2.rowCount, tripHeaders.length)

  styledAutoWidth(ws2)

  // ---- SHEET 3: Expenses ----
  const ws3 = wb.addWorksheet(t('excel.sheetExpenses'))
  const expHeaders = [t('excel.date'), t('excel.description'), t('excel.category'), t('excel.gallons'), t('excel.amount') + ' (' + cs + ')', t('excel.odometer') + ' (' + (distLabel || 'mi') + ')']
  ws3.addRow(expHeaders)
  styledHeaders(ws3, expHeaders.length)

  let expRowIdx = 2
  ;(expenses || []).sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e => {
    ws3.addRow([e.date, e.description, e.category, e.gallons ? fmtNum(e.gallons) : '', fmtNum(e.amount), e.odometer ? fmtNum(e.odometer) : ''])
    expRowIdx++
  })

  styledAltRows(ws3, 2, expRowIdx - 1, expHeaders.length)

  ws3.addRow([t('excel.total'), '', '', '', fmtNum((expenses || []).reduce((s, e) => s + (e.amount || 0), 0)), ''])
  styleTotalRow(ws3, ws3.rowCount, expHeaders.length)

  styledAutoWidth(ws3)

  // ---- SHEET 4: Pay Sheet (only for hired drivers, not owner_operator) ----
  if (!isOwner && payType && payType !== 'none') {
    const ws4 = wb.addWorksheet(t('excel.sheetPaySheet'))
    const payHeaders = [t('excel.date'), t('excel.route'), t('excel.distMiles'), t('excel.rate'), t('excel.earned') + ' (' + cs + ')']
    ws4.addRow(payHeaders)
    styledHeaders(ws4, payHeaders.length)

    let payRowIdx = 2
    ;(payRows || []).forEach(r => {
      ws4.addRow([r.date, r.route, fmtNum(r.miles), r.rate, fmtNum(r.earned)])
      payRowIdx++
    })

    styledAltRows(ws4, 2, payRowIdx - 1, payHeaders.length)

    // TOTAL
    ws4.addRow([])
    ws4.addRow([t('excel.totalEarned'), '', '', '', fmtNum(payTotal ?? 0)])
    styleTotalRow(ws4, ws4.rowCount, payHeaders.length)

    // Advances
    if (advances && advances.length > 0) {
      ws4.addRow([])
      const advHeader = ws4.addRow([t('excel.advancesLabel'), '', '', '', ''])
      advHeader.getCell(1).font = { bold: true, size: 11 }
      advances.forEach(a => {
        ws4.addRow([a.date, a.note || '', '', '', fmtNum(a.amount)])
      })
      ws4.addRow([t('excel.totalAdvances'), '', '', '', fmtNum(advancesTotal ?? 0)])
      styleTotalRow(ws4, ws4.rowCount, payHeaders.length)
    }

    ws4.addRow([])
    const dueR = ws4.addRow([t('excel.toPay'), '', '', '', fmtNum(payDue ?? 0)])
    dueR.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF' + ORANGE } }
    dueR.getCell(5).font = { bold: true, size: 12, color: { argb: 'FF' + ORANGE } }

    styledAutoWidth(ws4)
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
  const boldFont = { bold: true, size: 11 }

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
  styledHeaders(ws2, drvHeaders.length)

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
  styledAltRows(ws2, 2, drvRowIdx - 1, drvHeaders.length)

  const drvTotProfit = drvTotIncome - drvTotExpense - drvTotSalary
  const drvTotPM = drvTotMiles > 0 ? drvTotProfit / drvTotMiles : 0
  ws2.addRow([t('excel.total'), '', '', drvTotTrips, drvTotMiles, fmtNum(drvTotIncome), fmtNum(drvTotExpense), fmtNum(drvTotSalary), fmtNum(drvTotProfit), fmtNum(drvTotPM)])
  styleTotalRow(ws2, ws2.rowCount, drvHeaders.length)
  styledAutoWidth(ws2)

  // ---- SHEET 3: By Vehicles ----
  const ws3 = wb.addWorksheet(t('excel.sheetVehicles'))
  const vehHeaders = [t('excel.vehicle'), t('excel.plate'), t('excel.driver'), t('excel.income') + ' (' + cs + ')', t('excel.fuel') + ' (' + cs + ')', t('excel.def') + ' (' + cs + ')', t('excel.repair') + ' (' + cs + ')', t('excel.maintenance') + ' (' + cs + ')', t('excel.other') + ' (' + cs + ')', t('excel.totalExpShort') + ' (' + cs + ')', t('excel.profit') + ' (' + cs + ')', distLabel, cs + '/' + distLabel]
  ws3.addRow(vehHeaders)
  styledHeaders(ws3, vehHeaders.length)

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
  styledAltRows(ws3, 2, vRowIdx - 1, vehHeaders.length)

  const vTotPM = vTotMiles > 0 ? vTotProfit / vTotMiles : 0
  ws3.addRow([t('excel.total'), '', '', fmtNum(vTotIncome), fmtNum(vTotFuel), fmtNum(vTotDef), fmtNum(vTotRepair), fmtNum(vTotService), fmtNum(vTotOther), fmtNum(vTotExp), fmtNum(vTotProfit), vTotMiles, fmtNum(vTotPM)])
  styleTotalRow(ws3, ws3.rowCount, vehHeaders.length)
  styledAutoWidth(ws3)

  // ---- SHEET 4: Expenses by Category ----
  const ws4 = wb.addWorksheet(t('excel.sheetCategories'))
  const catHeaders = [t('excel.category'), t('excel.amount') + ' (' + cs + ')', t('excel.entries'), t('excel.pctOfTotal')]
  ws4.addRow(catHeaders)
  styledHeaders(ws4, catHeaders.length)

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
  styledAltRows(ws4, 2, catRowIdx - 1, catHeaders.length)

  ws4.addRow([t('excel.total'), fmtNum(catTotalSum), catTotCount, '100%'])
  styleTotalRow(ws4, ws4.rowCount, catHeaders.length)
  styledAutoWidth(ws4)

  // ---- SHEET 5: Payroll (Salaries) ----
  const ws5 = wb.addWorksheet(t('excel.sheetPayroll'))
  const payHeaders = [t('excel.driver'), t('excel.payType'), t('excel.rate'), t('excel.trips'), distLabelFull, t('excel.earned') + ' (' + cs + ')']
  ws5.addRow(payHeaders)
  styledHeaders(ws5, payHeaders.length)

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

  styledAltRows(ws5, 2, payRowIdx - 1, payHeaders.length)
  ws5.addRow([t('excel.total'), '', '', '', '', fmtNum(payTotEarned)])
  styleTotalRow(ws5, ws5.rowCount, payHeaders.length)
  styledAutoWidth(ws5)

  // ---- SHEET 6: All Expenses (detailed) ----
  const ws6 = wb.addWorksheet(t('excel.sheetAllExpenses'))
  const expHeaders = [t('excel.date'), t('excel.description'), t('excel.category'), isImperial ? t('excel.gallons') : t('excel.liters'), t('excel.amount') + ' (' + cs + ')', t('excel.odometer')]
  ws6.addRow(expHeaders)
  styledHeaders(ws6, expHeaders.length)

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
  styledAltRows(ws6, 2, expRowIdx - 1, expHeaders.length)
  ws6.addRow([t('excel.total'), '', '', '', fmtNum(expTotalAmt), ''])
  styleTotalRow(ws6, ws6.rowCount, expHeaders.length)
  styledAutoWidth(ws6)

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
