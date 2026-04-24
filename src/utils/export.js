import { renderPdfHeader, renderPdfFooter } from './pdfHeader.js'

// ====== Shared Excel styling constants & helpers (ExcelJS) ======
// US-locale money format: Excel renders "1,234.56" in en-US and "1 234,56" in
// ru-RU, but both sides read the cell as a native number (so SUM works and
// QuickBooks / TurboTax parse cleanly). Values must be stored as numbers.
const US_NUMBER_FMT = '#,##0.00'

const applyUsNumberFormatToSheet = (ws) => {
  if (!ws) return
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
        if (!cell.numFmt) cell.numFmt = US_NUMBER_FMT
      }
    })
  })
}

const applyUsNumberFormatToWorkbook = (wb) => {
  if (!wb || typeof wb.eachSheet !== 'function') return
  wb.eachSheet((ws) => applyUsNumberFormatToSheet(ws))
}

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

/** Convert 1-based column index to Excel column letter (1 -> A, 27 -> AA) */
const colIndexToLetter = (idx) => {
  let s = ''
  let n = idx
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
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
 * @param {Object} [options]
 * @param {{label: string, labelColKey?: string, sumKeys?: string[]}} [options.grandTotal]
 *   opt-in TOTAL row: label placed in labelColKey column (or first column),
 *   SUM(colN2:colN{last}) formulas added for each sumKeys column
 */
export async function exportToExcel(data, columns, filename, options) {
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

  // Optional grand-total row (opt-in; e.g. owner_operator reports)
  if (options && options.grandTotal && data.length > 0) {
    const gt = options.grandTotal
    const totalVals = columns.map(() => '')
    const labelIdx = columns.findIndex(c => c.key === gt.labelColKey)
    totalVals[labelIdx >= 0 ? labelIdx : 0] = gt.label || 'TOTAL'
    ws.addRow(totalVals)
    const totalRowNum = ws.rowCount
    const firstDataRow = 2
    const lastDataRow = 1 + data.length
    ;(gt.sumKeys || []).forEach(key => {
      const colIdx = columns.findIndex(c => c.key === key)
      if (colIdx >= 0) {
        const colLetter = colIndexToLetter(colIdx + 1)
        ws.getRow(totalRowNum).getCell(colIdx + 1).value = {
          formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})`,
        }
      }
    })
    styleTotalRow(ws, totalRowNum, headers.length)
  }

  styledAutoWidth(ws)

  applyUsNumberFormatToWorkbook(wb)
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

  applyUsNumberFormatToWorkbook(wb)
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

  applyUsNumberFormatToWorkbook(wb)
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
    return Number(Number(n).toFixed(2))
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
  const hasDriverPay = (!isOwner && payType && payType !== 'none') || (role === 'driver' && (trips || []).some(tr => tr.driverPay > 0))
  const tripHeaders = [t('excel.date'), t('excel.origin'), t('excel.destination'), t('excel.distMiles'), t('excel.income') + ' (' + cs + ')']
  if (hasDriverPay) tripHeaders.push(t('excel.myEarnings') + ' (' + cs + ')')
  ws2.addRow(tripHeaders)
  styledHeaders(ws2, tripHeaders.length)

  let tripRowIdx = 2
  ;(trips || []).forEach(tr => {
    const row = [tr.date, tr.origin, tr.destination, fmtNum(tr.miles), fmtNum(tr.income)]
    if (hasDriverPay) row.push(fmtNum(tr.driverPay))
    ws2.addRow(row)
    tripRowIdx++
  })

  styledAltRows(ws2, 2, tripRowIdx - 1, tripHeaders.length)

  // TOTAL row
  const tripTotalRow = [t('excel.total'), '', '', fmtNum((trips || []).reduce((s, tr2) => s + (tr2.miles || 0), 0)), fmtNum((trips || []).reduce((s, tr2) => s + (tr2.income || 0), 0))]
  if (hasDriverPay) tripTotalRow.push(fmtNum((trips || []).reduce((s, tr2) => s + (tr2.driverPay || 0), 0)))
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
  applyUsNumberFormatToWorkbook(wb)
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
  applyUsNumberFormatToWorkbook(wb)
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
export async function exportToPDF(data, columns, title, filename, locale, subtitle, options) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { robotoRegularBase64, robotoBoldBase64 } = await import('./roboto-font.js')

  const fuelTotals = options && options.fuelTotals
  const tripsTotalRow = options && options.tripsTotalRow
  const grandTotal = options && options.grandTotal
  const totalLabel = (options && options.totalLabel) || 'TOTAL'
  const averageLabel = (options && options.averageLabel) || 'avg'
  const branded = !!(options && options.branded)
  const brandYear = options && options.brandYear
  const brandSubtitle = options && options.brandSubtitle

  const head = [columns.map(c => c.header)]
  const body = data.map(row => columns.map(c => String(row[c.key] ?? '')))

  // Build fuel totals rows for the table
  const footRows = []

  // Optional generic grand-total row (opt-in; e.g. owner_operator reports)
  if (grandTotal && data.length > 0) {
    const totalVals = columns.map(() => '')
    const labelIdx = columns.findIndex(c => c.key === grandTotal.labelColKey)
    totalVals[labelIdx >= 0 ? labelIdx : 0] = grandTotal.label || totalLabel
    const totals = grandTotal.totals || {}
    Object.entries(totals).forEach(([key, val]) => {
      const colIdx = columns.findIndex(c => c.key === key)
      if (colIdx >= 0) totalVals[colIdx] = String(val)
    })
    footRows.push({ cells: totalVals, style: 'total' })
  }
  if (fuelTotals && data.length > 0) {
    const amountIdx = columns.findIndex(c => c.key === 'amount')
    const volIdx = columns.findIndex(c => c.key === fuelTotals.volumeKey)
    const priceIdx = columns.findIndex(c => c.key === fuelTotals.priceKey)
    const odomIdx = columns.findIndex(c => c.key === fuelTotals.odometerKey)

    // "Totals" row
    const totalVals = columns.map(() => '')
    totalVals[0] = totalLabel
    if (amountIdx >= 0) {
      totalVals[amountIdx] = String(Math.round(data.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100)
    }
    if (volIdx >= 0) {
      totalVals[volIdx] = String(Math.round(data.reduce((s, r) => s + (Number(r[fuelTotals.volumeKey]) || 0), 0) * 100) / 100)
    }
    if (priceIdx >= 0) {
      const prices = data.map(r => Number(r[fuelTotals.priceKey]) || 0).filter(v => v > 0)
      totalVals[priceIdx] = prices.length > 0
        ? `${Math.round((prices.reduce((s, v) => s + v, 0) / prices.length) * 100) / 100} (${averageLabel})`
        : ''
    }
    if (odomIdx >= 0) {
      const odomValues = data.map(r => Number(r[fuelTotals.odometerKey]) || 0).filter(v => v > 0)
      if (odomValues.length >= 2) {
        const totalDist = Math.max(...odomValues) - Math.min(...odomValues)
        if (totalDist > 0) totalVals[odomIdx] = String(totalDist)
      }
    }
    footRows.push({ cells: totalVals, style: 'total' })

    // "Fuel per mile/km" row
    if (fuelTotals.fuelPerDistLabel && odomIdx >= 0) {
      const odomValues = data.map(r => Number(r[fuelTotals.odometerKey]) || 0).filter(v => v > 0)
      if (odomValues.length >= 2) {
        const totalDist = Math.max(...odomValues) - Math.min(...odomValues)
        const totalAmount = data.reduce((s, r) => s + (Number(r[fuelTotals.amountKey]) || 0), 0)
        if (totalDist > 0) {
          const fpdVals = columns.map(() => '')
          fpdVals[0] = fuelTotals.fuelPerDistLabel
          fpdVals[amountIdx >= 0 ? amountIdx : 0] = String(Math.round((totalAmount / totalDist) * 100) / 100)
          footRows.push({ cells: fpdVals, style: 'fuelPerDist' })
        }
      }
    }
  }

  // Append styled footer rows to body
  for (const fr of footRows) {
    body.push(fr.cells)
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Embed Roboto font for Cyrillic support
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')

  let nextY
  const drawBrandedHeader = () => renderPdfHeader(doc, {
    title,
    subtitle: brandSubtitle || subtitle,
    year: brandYear,
    font: 'Roboto',
  })
  if (branded) {
    nextY = drawBrandedHeader() - 2
  } else {
    // Title
    doc.setFontSize(16)
    doc.text(title, 14, 15)
    // Subtitle (vehicle name or period details)
    nextY = 22
    if (subtitle) {
      doc.setFontSize(11)
      doc.setTextColor(80)
      doc.text(subtitle, 14, 22)
      doc.setTextColor(0)
      nextY = 28
    }
  }

  // Map footer row indices for custom styling
  const dataRowCount = data.length
  const footerStyleMap = {}
  for (let i = 0; i < footRows.length; i++) {
    footerStyleMap[dataRowCount + i] = footRows[i].style
  }
  // If tripsTotalRow, the last data row is a total row
  if (tripsTotalRow && data.length > 0) {
    footerStyleMap[data.length - 1] = 'total'
  }

  autoTable(doc, {
    startY: nextY + 2,
    head,
    body,
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', font: 'Roboto' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14, right: 14, top: branded ? 30 : 14 },
    didParseCell: function (hookData) {
      if (hookData.section !== 'body') return
      const st = footerStyleMap[hookData.row.index]
      if (st === 'total') {
        hookData.cell.styles.fillColor = [255, 242, 204] // #FFF2CC
        hookData.cell.styles.fontStyle = 'bold'
        hookData.cell.styles.font = 'Roboto'
      } else if (st === 'fuelPerDist') {
        hookData.cell.styles.fillColor = [217, 234, 211] // #D9EAD3
        hookData.cell.styles.fontStyle = 'bold'
        hookData.cell.styles.font = 'Roboto'
      }
    },
    didDrawPage: branded ? (data) => {
      if (data.pageNumber > 1) drawBrandedHeader()
    } : undefined,
  })

  if (branded) renderPdfFooter(doc, { font: 'Roboto' })

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

/* ============================================================
 * Driver Full Report — single multi-sheet Excel / multi-section PDF
 * 7 sheets/sections:
 *   1. Summary
 *   2. My Salary (trips + driverPay)
 *   3. Vehicle P&L (date / income / expense / profit)
 *   4. Trips (date, from, to, dist, income)
 *   5. Fuel (date, station, gallons, price/gal, total, odometer)
 *   6. Vehicle expenses (date, category, description, amount)
 *   7. Personal expenses (date, category, description, amount)
 * ============================================================ */

const ORANGE_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } }
const ORANGE_HEADER_FONT = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }

const orangeHeaders = (ws, colCount) => {
  const row = ws.getRow(1)
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.fill = ORANGE_HEADER_FILL
    cell.font = ORANGE_HEADER_FONT
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = HEADER_BORDER_BOTTOM
  }
  row.height = 24
}

// Maintenance categories — match Service.jsx
const FULL_MAINT_CATS = new Set(['oil_change', 'filters', 'belts_chains', 'coolant', 'diagnostics', 'brake_pads', 'spark_plugs', 'maintenance', 'maintenance_other'])

// Translate raw category key to user language using catLabels map.
// Falls back to original raw key if translation missing.
function translateCategory(raw, catLabels) {
  if (!raw) return ''
  const key = String(raw).toLowerCase().trim()
  if (catLabels && catLabels[key]) return catLabels[key]
  return raw
}

// Translate service record type → maintenance or repair label
function translateServiceType(type, L) {
  const t = (type || '').toLowerCase().trim()
  if (FULL_MAINT_CATS.has(t)) return L.maintenance || 'Maintenance'
  return L.repair || 'Repair'
}

export async function exportDriverFullReportExcel(opts) {
  const excelMod = await import('exceljs')
  const ExcelJS = excelMod.default || excelMod
  const fileSaverMod = await import('file-saver')
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default?.saveAs || fileSaverMod.default

  const {
    period, cs, distLabel, volLabel, isImperial,
    trips, fuels, vehicleExps, bytExps, serviceRecs, tireRecs,
    labels, filename, role, cpm,
  } = opts

  const L = labels || {}
  const catLabels = L.categoryLabels || {}
  const isOwner = role === 'owner_operator'
  const tr = (raw) => translateCategory(raw, catLabels)
  const svcType = (type) => translateServiceType(type, L)

  const fmt = (n) => (n == null || isNaN(n)) ? '' : Math.round(Number(n) * 100) / 100
  const wb = new ExcelJS.Workbook()

  const convDist = (km) => isImperial ? Math.round((km || 0) * 0.621371) : Math.round(km || 0)
  const convVol = (liters) => isImperial ? Math.round((liters || 0) * 0.264172 * 100) / 100 : (Math.round((liters || 0) * 100) / 100)

  // ---- computed totals ----
  const totalIncome = trips.reduce((s, t) => s + (t.income || 0), 0)
  const totalDriverPay = trips.reduce((s, t) => s + (t.driver_pay || 0), 0)
  const totalDist = trips.reduce((s, t) => s + convDist(t.distance_km || 0), 0)
  const tripsCount = trips.length
  const fuelCost = fuels.reduce((s, f) => s + (f.cost || 0), 0)
  const totalVol = fuels.reduce((s, f) => s + convVol(f.liters || 0), 0)
  const serviceCost = serviceRecs.reduce((s, r) => s + (r.cost || 0), 0)
  const tireCost = (tireRecs || []).reduce((s, r) => s + (r.cost || 0), 0)
  const vehicleExpCost = vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const personalCost = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totalVehicleExp = fuelCost + serviceCost + tireCost + vehicleExpCost
  const netProfit = totalIncome - totalVehicleExp
  const businessProfit = netProfit
  const netInHand = businessProfit - personalCost
  const mpg = (totalDist > 0 && totalVol > 0) ? (totalDist / totalVol) : 0
  const avgRatePerDist = totalDist > 0 ? totalIncome / totalDist : 0
  const costPerDist = totalDist > 0 ? totalVehicleExp / totalDist : 0

  if (isOwner) {
    // =========================================================
    // OWNER-OPERATOR REPORT — 7 sheets
    // Totals / Summary / Business P&L / Trips / Fuel / Vehicle exp / Personal exp
    // =========================================================

    // ---- Sheet 1: Totals (visual) ----
    const wsT = wb.addWorksheet(L.totalsSheet || 'Totals')
    wsT.addRow([L.totalsSheet || 'Totals', period || ''])
    wsT.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: 'FFF59E0B' } }
    wsT.getRow(1).getCell(2).font = { italic: true, size: 11, color: { argb: 'FF666666' } }
    wsT.addRow([])

    // Business block
    const bHeader = wsT.addRow([L.businessSection || 'Business'])
    bHeader.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFF59E0B' } }
    const b1 = wsT.addRow([(L.income || 'Income') + ' (' + cs + ')', fmt(totalIncome)])
    b1.getCell(2).font = { size: 11, color: { argb: 'FF22C55E' } }
    const b2 = wsT.addRow(['\u2212 ' + (L.vehicleExpenses || 'Vehicle expenses') + ' (' + cs + ')', fmt(totalVehicleExp)])
    b2.getCell(2).font = { size: 11, color: { argb: 'FFEF4444' } }
    const b3 = wsT.addRow(['= ' + (L.businessProfit || 'Business profit') + ' (' + cs + ')', fmt(businessProfit)])
    const ORANGE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
    b3.getCell(1).fill = ORANGE_FILL
    b3.getCell(2).fill = ORANGE_FILL
    b3.getCell(1).font = { bold: true, size: 12 }
    b3.getCell(2).font = { bold: true, size: 12, color: { argb: businessProfit >= 0 ? 'FF22C55E' : 'FFEF4444' } }
    wsT.addRow([])

    // Personal block
    const pHeader = wsT.addRow([L.personalSection || 'Personal'])
    pHeader.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFF59E0B' } }
    wsT.addRow([(L.businessProfit || 'Business profit') + ' (' + cs + ')', fmt(businessProfit)])
    wsT.addRow(['\u2212 ' + (L.personalExpenses || 'Personal expenses') + ' (' + cs + ')', fmt(personalCost)])
    const n3 = wsT.addRow(['= ' + (L.netInHand || 'Net in hand') + ' (' + cs + ')', fmt(netInHand)])
    n3.getCell(1).fill = ORANGE_FILL
    n3.getCell(2).fill = ORANGE_FILL
    n3.getCell(1).font = { bold: true, size: 14 }
    n3.getCell(2).font = { bold: true, size: 14, color: { argb: netInHand >= 0 ? 'FF22C55E' : 'FFEF4444' } }
    wsT.getColumn(1).width = 44
    wsT.getColumn(2).width = 22

    // ---- Sheet 2: Summary (owner) ----
    const wsS = wb.addWorksheet(L.summarySheet || 'Summary')
    wsS.addRow([L.summarySheet || 'Summary', period || ''])
    wsS.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: 'FFF59E0B' } }
    wsS.getRow(1).getCell(2).font = { italic: true, size: 11, color: { argb: 'FF666666' } }
    wsS.addRow([])
    const addKVS = (label, value) => {
      const r = wsS.addRow([label, value])
      r.getCell(1).font = { bold: true, size: 11 }
      r.getCell(2).font = { size: 11 }
    }
    addKVS(L.period || 'Period', period || '')
    addKVS(L.trips || 'Trips', tripsCount)
    addKVS((L.distance || 'Distance') + ' (' + distLabel + ')', totalDist)
    if (totalDist > 0) {
      addKVS((L.avgRatePerDist || 'Avg rate') + ' (' + cs + '/' + distLabel + ')', Math.round(avgRatePerDist * 100) / 100)
    }
    addKVS((L.income || 'Income') + ' (' + cs + ')', fmt(totalIncome))
    addKVS((L.vehicleExpenses || 'Vehicle expenses') + ' (' + cs + ')', fmt(totalVehicleExp))
    addKVS((L.businessProfit || 'Business profit') + ' (' + cs + ')', fmt(businessProfit))
    addKVS((L.personalExpenses || 'Personal expenses') + ' (' + cs + ')', fmt(personalCost))
    addKVS((L.netInHand || 'Net in hand') + ' (' + cs + ')', fmt(netInHand))
    if (totalDist > 0) {
      const variablePerMile = cpm?.variable?.perMile ?? costPerDist
      const fullyLoadedPerMile = cpm?.fullyLoaded?.perMile ?? costPerDist
      const rVar = wsS.addRow([(L.cpmVariable || 'Variable CPM') + ' (' + cs + '/' + distLabel + ')', variablePerMile])
      rVar.getCell(1).font = { bold: true, size: 11 }
      rVar.getCell(2).font = { size: 11 }
      rVar.getCell(2).numFmt = '#,##0.000'
      const rFull = wsS.addRow([(L.cpmFullyLoaded || 'Fully-loaded CPM') + ' (' + cs + '/' + distLabel + ')', fullyLoadedPerMile])
      rFull.getCell(1).font = { bold: true, size: 11 }
      rFull.getCell(2).font = { size: 11 }
      rFull.getCell(2).numFmt = '#,##0.000'
    }
    if (mpg > 0) {
      addKVS('MPG', Math.round(mpg * 10) / 10)
    }
    wsS.getColumn(1).width = 40
    wsS.getColumn(2).width = 20

    // ---- Sheet 3: Business P&L ----
    const wsP = wb.addWorksheet(L.businessPnl || 'Business P&L')
    const pnlHeaders = [
      L.date || 'Date',
      (L.income || 'Income') + ' (' + cs + ')',
      (L.expense || 'Expense') + ' (' + cs + ')',
      (L.profit || 'Profit') + ' (' + cs + ')',
    ]
    wsP.addRow(pnlHeaders)
    orangeHeaders(wsP, pnlHeaders.length)
    const pnlMapO = {}
    trips.forEach(trip => {
      const d = (trip.created_at || '').slice(0, 10)
      if (!pnlMapO[d]) pnlMapO[d] = { income: 0, expense: 0 }
      pnlMapO[d].income += (trip.income || 0)
    })
    const addExpO = (d, amount) => {
      if (!d || !amount) return
      const k = d.slice(0, 10)
      if (!pnlMapO[k]) pnlMapO[k] = { income: 0, expense: 0 }
      pnlMapO[k].expense += amount
    }
    fuels.forEach(f => addExpO(f.date, f.cost || 0))
    serviceRecs.forEach(r => addExpO(r.date, r.cost || 0))
    ;(tireRecs || []).forEach(r => addExpO(r.installed_at, r.cost || 0))
    vehicleExps.forEach(e => addExpO(e.date, e.amount || 0))
    const pnlKeysO = Object.keys(pnlMapO).sort()
    let pRowsO = 0
    pnlKeysO.forEach(k => {
      const v = pnlMapO[k]
      wsP.addRow([k, fmt(v.income), fmt(v.expense), fmt(v.income - v.expense)])
      pRowsO++
    })
    styledAltRows(wsP, 2, 1 + pRowsO, pnlHeaders.length)
    if (pRowsO > 0) {
      wsP.addRow([])
      wsP.addRow([L.total || 'TOTAL', fmt(totalIncome), fmt(totalVehicleExp), fmt(businessProfit)])
      styleTotalRow(wsP, wsP.rowCount, pnlHeaders.length)
    }
    styledAutoWidth(wsP)

    // ---- Sheet 4: Trips (no driverPay) ----
    const wsTr = wb.addWorksheet(L.trips || 'Trips')
    const tripHeadersO = [
      L.date || 'Date',
      L.route || 'Route',
      distLabel,
      (L.income || 'Income') + ' (' + cs + ')',
    ]
    wsTr.addRow(tripHeadersO)
    orangeHeaders(wsTr, tripHeadersO.length)
    let trRowsO = 0
    trips.forEach(trip => {
      wsTr.addRow([
        (trip.created_at || '').slice(0, 10),
        (trip.origin || '') + ' \u2192 ' + (trip.destination || ''),
        convDist(trip.distance_km || 0),
        fmt(trip.income),
      ])
      trRowsO++
    })
    styledAltRows(wsTr, 2, 1 + trRowsO, tripHeadersO.length)
    if (trRowsO > 0) {
      wsTr.addRow([])
      wsTr.addRow([L.total || 'TOTAL', '', totalDist, fmt(totalIncome)])
      styleTotalRow(wsTr, wsTr.rowCount, tripHeadersO.length)
    }
    styledAutoWidth(wsTr)

    // ---- Sheet 5: Fuel (with empty placeholder) ----
    const wsF = wb.addWorksheet(L.fuel || 'Fuel')
    const fuelHeadersO = [
      L.date || 'Date',
      L.station || 'Station',
      volLabel,
      cs + '/' + volLabel,
      (L.total || 'Total') + ' (' + cs + ')',
      (L.odometer || 'Odometer') + ' (' + distLabel + ')',
    ]
    wsF.addRow(fuelHeadersO)
    orangeHeaders(wsF, fuelHeadersO.length)
    if (fuels.length === 0) {
      wsF.mergeCells(2, 1, 2, fuelHeadersO.length)
      const emptyCell = wsF.getCell(2, 1)
      emptyCell.value = L.noFuelRecords || 'No fuel records for this period'
      emptyCell.font = { italic: true, size: 11, color: { argb: 'FF666666' } }
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else {
      let fRowsO = 0
      const sortedFuelsO = [...fuels].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      sortedFuelsO.forEach(f => {
        const vol = convVol(f.liters || 0)
        const price = vol > 0 ? Math.round(((f.cost || 0) / vol) * 1000) / 1000 : 0
        wsF.addRow([
          (f.date || '').slice(0, 10),
          f.station || '',
          vol,
          price,
          fmt(f.cost),
          f.odometer ? convDist(f.odometer) : '',
        ])
        fRowsO++
      })
      styledAltRows(wsF, 2, 1 + fRowsO, fuelHeadersO.length)
      wsF.addRow([])
      const avgPriceO = totalVol > 0 ? Math.round((fuelCost / totalVol) * 1000) / 1000 : ''
      wsF.addRow([L.total || 'TOTAL', '', totalVol, avgPriceO, fmt(fuelCost), ''])
      styleTotalRow(wsF, wsF.rowCount, fuelHeadersO.length)
      if (totalDist > 0 && totalVol > 0) {
        const fuelPerDistO = Math.round((fuelCost / totalDist) * 100) / 100
        const fpdLabelO = isImperial ? (L.fuelPerMile || 'Fuel cost/mi') : (L.fuelPerKm || 'Fuel cost/km')
        wsF.addRow([fpdLabelO, '', '', '', fuelPerDistO, ''])
        styleFuelPerDistRow(wsF, wsF.rowCount, fuelHeadersO.length)
      }
    }
    styledAutoWidth(wsF)

    // ---- Sheet 6: Vehicle expenses (translated categories) ----
    const wsV = wb.addWorksheet(L.vehicleExpenses || 'Vehicle Expenses')
    const vHeadersO = [
      L.date || 'Date',
      L.category || 'Category',
      L.description || 'Description',
      (L.amount || 'Amount') + ' (' + cs + ')',
    ]
    wsV.addRow(vHeadersO)
    orangeHeaders(wsV, vHeadersO.length)
    const combinedVExpO = []
    fuels.forEach(f => combinedVExpO.push({ date: f.date || '', category: L.fuel || (catLabels.fuel) || 'Fuel', description: f.station || '', amount: f.cost || 0 }))
    vehicleExps.forEach(e => combinedVExpO.push({ date: e.date || '', category: tr(e.category), description: e.description || '', amount: e.amount || 0 }))
    serviceRecs.forEach(r => combinedVExpO.push({ date: r.date || '', category: svcType(r.type), description: r.description || '', amount: r.cost || 0 }))
    ;(tireRecs || []).forEach(r => combinedVExpO.push({ date: r.installed_at || '', category: L.tires || 'Tires', description: ((r.brand || '') + ' ' + (r.model || '')).trim(), amount: r.cost || 0 }))
    combinedVExpO.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    let vRowsO = 0
    combinedVExpO.forEach(e => {
      wsV.addRow([(e.date || '').slice(0, 10), e.category, e.description, fmt(e.amount)])
      vRowsO++
    })
    styledAltRows(wsV, 2, 1 + vRowsO, vHeadersO.length)
    if (vRowsO > 0) {
      const vSumO = combinedVExpO.reduce((s, r) => s + (r.amount || 0), 0)
      wsV.addRow([])
      wsV.addRow([L.total || 'TOTAL', '', '', fmt(vSumO)])
      styleTotalRow(wsV, wsV.rowCount, vHeadersO.length)
    }
    styledAutoWidth(wsV)

    // ---- Sheet 7: Personal expenses (translated categories) ----
    const wsPers = wb.addWorksheet(L.personalExpenses || 'Personal Expenses')
    const pHeadersO = [
      L.date || 'Date',
      L.category || 'Category',
      L.description || 'Description',
      (L.amount || 'Amount') + ' (' + cs + ')',
    ]
    wsPers.addRow(pHeadersO)
    orangeHeaders(wsPers, pHeadersO.length)
    let prO = 0
    const sortedBytO = [...bytExps].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    sortedBytO.forEach(e => {
      wsPers.addRow([(e.date || '').slice(0, 10), tr(e.category), e.description || '', fmt(e.amount)])
      prO++
    })
    styledAltRows(wsPers, 2, 1 + prO, pHeadersO.length)
    if (prO > 0) {
      wsPers.addRow([])
      wsPers.addRow([L.total || 'TOTAL', '', '', fmt(personalCost)])
      styleTotalRow(wsPers, wsPers.rowCount, pHeadersO.length)
    }
    styledAutoWidth(wsPers)

    applyUsNumberFormatToWorkbook(wb)
    const bufferO = await wb.xlsx.writeBuffer()
    saveAs(new Blob([bufferO], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename || 'full_report.xlsx')
    return
  }

  // =========================================================
  // DRIVER REPORT (hired driver) — original flow
  // =========================================================

  // ---- Sheet 1: Summary ----
  const ws1 = wb.addWorksheet(L.summarySheet || 'Summary')
  ws1.addRow([L.summarySheet || 'Summary', period || ''])
  ws1.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: 'FFF59E0B' } }
  ws1.getRow(1).getCell(2).font = { italic: true, size: 11, color: { argb: 'FF666666' } }
  ws1.addRow([])

  const addKV = (label, value) => {
    const r = ws1.addRow([label, value])
    r.getCell(1).font = { bold: true, size: 11 }
    r.getCell(2).font = { size: 11 }
  }
  addKV(L.period || 'Period', period || '')
  addKV(L.trips || 'Trips', tripsCount)
  addKV((L.distance || 'Distance') + ' (' + distLabel + ')', totalDist)
  addKV((L.income || 'Income') + ' (' + cs + ')', fmt(totalIncome))
  addKV((L.driverPay || 'Driver pay') + ' (' + cs + ')', fmt(totalDriverPay))
  addKV((L.fuelCost || 'Fuel cost') + ' (' + cs + ')', fmt(fuelCost))
  addKV((L.vehicleExpenses || 'Vehicle expenses') + ' (' + cs + ')', fmt(totalVehicleExp))
  addKV((L.personalExpenses || 'Personal expenses') + ' (' + cs + ')', fmt(personalCost))
  addKV((L.netProfit || 'Net profit') + ' (' + cs + ')', fmt(netProfit))
  ws1.addRow([])
  addKV('MPG', mpg > 0 ? Math.round(mpg * 10) / 10 : '')
  addKV((L.avgRatePerDist || 'Avg rate') + ' (' + cs + '/' + distLabel + ')', avgRatePerDist > 0 ? Math.round(avgRatePerDist * 100) / 100 : '')
  if (totalDist > 0) {
    const variablePerMile = cpm?.variable?.perMile ?? costPerDist
    const fullyLoadedPerMile = cpm?.fullyLoaded?.perMile ?? costPerDist
    const rVar = ws1.addRow([(L.cpmVariable || 'Variable CPM') + ' (' + cs + '/' + distLabel + ')', variablePerMile])
    rVar.getCell(1).font = { bold: true, size: 11 }
    rVar.getCell(2).font = { size: 11 }
    rVar.getCell(2).numFmt = '#,##0.000'
    const rFull = ws1.addRow([(L.cpmFullyLoaded || 'Fully-loaded CPM') + ' (' + cs + '/' + distLabel + ')', fullyLoadedPerMile])
    rFull.getCell(1).font = { bold: true, size: 11 }
    rFull.getCell(2).font = { size: 11 }
    rFull.getCell(2).numFmt = '#,##0.000'
  }
  ws1.getColumn(1).width = 36
  ws1.getColumn(2).width = 20

  // ---- Sheet 2: My Salary ----
  const ws2 = wb.addWorksheet(L.mySalary || 'My Salary')
  const salaryHeaders = [
    L.date || 'Date',
    L.route || 'Route',
    distLabel,
    (L.income || 'Income') + ' (' + cs + ')',
    (L.driverPay || 'My pay') + ' (' + cs + ')',
  ]
  ws2.addRow(salaryHeaders)
  orangeHeaders(ws2, salaryHeaders.length)
  let sRows = 0
  trips.forEach(tr => {
    ws2.addRow([
      (tr.created_at || '').slice(0, 10),
      (tr.origin || '') + ' \u2192 ' + (tr.destination || ''),
      convDist(tr.distance_km || 0),
      fmt(tr.income),
      fmt(tr.driver_pay),
    ])
    sRows++
  })
  styledAltRows(ws2, 2, 1 + sRows, salaryHeaders.length)
  if (sRows > 0) {
    ws2.addRow([])
    ws2.addRow([L.total || 'TOTAL', '', totalDist, fmt(totalIncome), fmt(totalDriverPay)])
    styleTotalRow(ws2, ws2.rowCount, salaryHeaders.length)
  }
  styledAutoWidth(ws2)

  // ---- Sheet 3: Vehicle P&L ----
  const ws3 = wb.addWorksheet(L.pnlReport || 'Vehicle P&L')
  const pnlHeaders = [
    L.date || 'Date',
    (L.income || 'Income') + ' (' + cs + ')',
    (L.expense || 'Expense') + ' (' + cs + ')',
    (L.profit || 'Profit') + ' (' + cs + ')',
  ]
  ws3.addRow(pnlHeaders)
  orangeHeaders(ws3, pnlHeaders.length)

  const pnlMap = {}
  trips.forEach(tr => {
    const d = (tr.created_at || '').slice(0, 10)
    if (!pnlMap[d]) pnlMap[d] = { income: 0, expense: 0 }
    pnlMap[d].income += (tr.income || 0)
  })
  const addExp = (d, amount) => {
    if (!d || !amount) return
    const k = d.slice(0, 10)
    if (!pnlMap[k]) pnlMap[k] = { income: 0, expense: 0 }
    pnlMap[k].expense += amount
  }
  fuels.forEach(f => addExp(f.date, f.cost || 0))
  serviceRecs.forEach(r => addExp(r.date, r.cost || 0))
  ;(tireRecs || []).forEach(r => addExp(r.installed_at, r.cost || 0))
  vehicleExps.forEach(e => addExp(e.date, e.amount || 0))

  const pnlKeys = Object.keys(pnlMap).sort()
  let pRows = 0
  pnlKeys.forEach(k => {
    const v = pnlMap[k]
    ws3.addRow([k, fmt(v.income), fmt(v.expense), fmt(v.income - v.expense)])
    pRows++
  })
  styledAltRows(ws3, 2, 1 + pRows, pnlHeaders.length)
  if (pRows > 0) {
    ws3.addRow([])
    ws3.addRow([L.total || 'TOTAL', fmt(totalIncome), fmt(totalVehicleExp), fmt(totalIncome - totalVehicleExp)])
    styleTotalRow(ws3, ws3.rowCount, pnlHeaders.length)
  }
  styledAutoWidth(ws3)

  // ---- Sheet 4: Trips ----
  const ws4 = wb.addWorksheet(L.trips || 'Trips')
  const tripHeaders = [
    L.date || 'Date',
    L.from || 'From',
    L.to || 'To',
    distLabel,
    (L.income || 'Income') + ' (' + cs + ')',
  ]
  ws4.addRow(tripHeaders)
  orangeHeaders(ws4, tripHeaders.length)
  let tRows = 0
  trips.forEach(tr => {
    ws4.addRow([
      (tr.created_at || '').slice(0, 10),
      tr.origin || '',
      tr.destination || '',
      convDist(tr.distance_km || 0),
      fmt(tr.income),
    ])
    tRows++
  })
  styledAltRows(ws4, 2, 1 + tRows, tripHeaders.length)
  if (tRows > 0) {
    ws4.addRow([])
    ws4.addRow([L.total || 'TOTAL', '', '', totalDist, fmt(totalIncome)])
    styleTotalRow(ws4, ws4.rowCount, tripHeaders.length)
  }
  styledAutoWidth(ws4)

  // ---- Sheet 5: Fuel ----
  const ws5 = wb.addWorksheet(L.fuel || 'Fuel')
  const fuelHeaders = [
    L.date || 'Date',
    L.station || 'Station',
    volLabel,
    cs + '/' + volLabel,
    (L.total || 'Total') + ' (' + cs + ')',
    (L.odometer || 'Odometer') + ' (' + distLabel + ')',
  ]
  ws5.addRow(fuelHeaders)
  orangeHeaders(ws5, fuelHeaders.length)
  let fRows = 0
  const sortedFuels = [...fuels].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  sortedFuels.forEach(f => {
    const vol = convVol(f.liters || 0)
    const price = vol > 0 ? Math.round(((f.cost || 0) / vol) * 1000) / 1000 : 0
    ws5.addRow([
      (f.date || '').slice(0, 10),
      f.station || '',
      vol,
      price,
      fmt(f.cost),
      f.odometer ? convDist(f.odometer) : '',
    ])
    fRows++
  })
  styledAltRows(ws5, 2, 1 + fRows, fuelHeaders.length)
  if (fRows > 0) {
    ws5.addRow([])
    const avgPrice = totalVol > 0 ? Math.round((fuelCost / totalVol) * 1000) / 1000 : ''
    ws5.addRow([L.total || 'TOTAL', '', totalVol, avgPrice, fmt(fuelCost), ''])
    styleTotalRow(ws5, ws5.rowCount, fuelHeaders.length)
    if (totalDist > 0 && totalVol > 0) {
      const fuelPerDist = Math.round((fuelCost / totalDist) * 100) / 100
      const fpdLabel = isImperial ? (L.fuelPerMile || 'Fuel cost/mi') : (L.fuelPerKm || 'Fuel cost/km')
      ws5.addRow([fpdLabel, '', '', '', fuelPerDist, ''])
      styleFuelPerDistRow(ws5, ws5.rowCount, fuelHeaders.length)
    }
  }
  styledAutoWidth(ws5)

  // ---- Sheet 6: Vehicle expenses ----
  const ws6 = wb.addWorksheet(L.vehicleExpenses || 'Vehicle Expenses')
  const vHeaders = [
    L.date || 'Date',
    L.category || 'Category',
    L.description || 'Description',
    (L.amount || 'Amount') + ' (' + cs + ')',
  ]
  ws6.addRow(vHeaders)
  orangeHeaders(ws6, vHeaders.length)
  let vRows = 0
  const combinedVExp = []
  vehicleExps.forEach(e => combinedVExp.push({ date: e.date || '', category: e.category || '', description: e.description || '', amount: e.amount || 0 }))
  serviceRecs.forEach(r => combinedVExp.push({ date: r.date || '', category: r.type || (L.repair || 'Service'), description: r.description || '', amount: r.cost || 0 }))
  ;(tireRecs || []).forEach(r => combinedVExp.push({ date: r.installed_at || '', category: L.tires || 'Tires', description: ((r.brand || '') + ' ' + (r.model || '')).trim(), amount: r.cost || 0 }))
  combinedVExp.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  combinedVExp.forEach(e => {
    ws6.addRow([e.date.slice(0, 10), e.category, e.description, fmt(e.amount)])
    vRows++
  })
  styledAltRows(ws6, 2, 1 + vRows, vHeaders.length)
  if (vRows > 0) {
    const vSum = combinedVExp.reduce((s, r) => s + (r.amount || 0), 0)
    ws6.addRow([])
    ws6.addRow([L.total || 'TOTAL', '', '', fmt(vSum)])
    styleTotalRow(ws6, ws6.rowCount, vHeaders.length)
  }
  styledAutoWidth(ws6)

  // ---- Sheet 7: Personal expenses ----
  const ws7 = wb.addWorksheet(L.personalExpenses || 'Personal Expenses')
  const pHeaders = [
    L.date || 'Date',
    L.category || 'Category',
    L.description || 'Description',
    (L.amount || 'Amount') + ' (' + cs + ')',
  ]
  ws7.addRow(pHeaders)
  orangeHeaders(ws7, pHeaders.length)
  let pr = 0
  const sortedByt = [...bytExps].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  sortedByt.forEach(e => {
    ws7.addRow([(e.date || '').slice(0, 10), e.category || '', e.description || '', fmt(e.amount)])
    pr++
  })
  styledAltRows(ws7, 2, 1 + pr, pHeaders.length)
  if (pr > 0) {
    ws7.addRow([])
    ws7.addRow([L.total || 'TOTAL', '', '', fmt(personalCost)])
    styleTotalRow(ws7, ws7.rowCount, pHeaders.length)
  }
  styledAutoWidth(ws7)

  applyUsNumberFormatToWorkbook(wb)
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename || 'full_report.xlsx')
}

export async function exportDriverFullReportPDF(opts) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { robotoRegularBase64, robotoBoldBase64 } = await import('./roboto-font.js')

  const {
    period, cs, distLabel, volLabel, isImperial,
    trips, fuels, vehicleExps, bytExps, serviceRecs, tireRecs,
    labels, filename, role,
  } = opts

  const L = labels || {}
  const catLabels = L.categoryLabels || {}
  const isOwner = role === 'owner_operator'
  const tr = (raw) => translateCategory(raw, catLabels)
  const svcType = (type) => translateServiceType(type, L)

  const fmt = (n) => (n == null || isNaN(n)) ? '' : String(Math.round(Number(n) * 100) / 100)
  const convDist = (km) => isImperial ? Math.round((km || 0) * 0.621371) : Math.round(km || 0)
  const convVol = (liters) => isImperial ? Math.round((liters || 0) * 0.264172 * 100) / 100 : (Math.round((liters || 0) * 100) / 100)

  const totalIncome = trips.reduce((s, t) => s + (t.income || 0), 0)
  const totalDriverPay = trips.reduce((s, t) => s + (t.driver_pay || 0), 0)
  const totalDist = trips.reduce((s, t) => s + convDist(t.distance_km || 0), 0)
  const tripsCount = trips.length
  const fuelCost = fuels.reduce((s, f) => s + (f.cost || 0), 0)
  const totalVol = fuels.reduce((s, f) => s + convVol(f.liters || 0), 0)
  const serviceCost = serviceRecs.reduce((s, r) => s + (r.cost || 0), 0)
  const tireCost = (tireRecs || []).reduce((s, r) => s + (r.cost || 0), 0)
  const vehicleExpCost = vehicleExps.reduce((s, e) => s + (e.amount || 0), 0)
  const personalCost = bytExps.reduce((s, e) => s + (e.amount || 0), 0)
  const totalVehicleExp = fuelCost + serviceCost + tireCost + vehicleExpCost
  const netProfit = totalIncome - totalVehicleExp
  const businessProfit = netProfit
  const netInHand = businessProfit - personalCost
  const mpg = (totalDist > 0 && totalVol > 0) ? totalDist / totalVol : 0
  const avgRatePerDist = totalDist > 0 ? totalIncome / totalDist : 0
  const costPerDist = totalDist > 0 ? totalVehicleExp / totalDist : 0

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')

  const baseOpts = {
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', font: 'Roboto' },
    headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', font: 'Roboto' },
    bodyStyles: { font: 'Roboto' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14, right: 14 },
    showHead: 'everyPage',
  }

  const sectionTitle = (title) => {
    doc.setFontSize(14)
    doc.setTextColor(245, 158, 11)
    doc.text(title, 14, 15)
    doc.setFontSize(10)
    doc.setTextColor(100)
    if (period) doc.text(String(period), 14, 21)
    doc.setTextColor(0)
  }

  const markTotalRow = (lastIdx) => ({
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === lastIdx) {
        d.cell.styles.fillColor = [255, 242, 204]
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })

  if (isOwner) {
    // =========================================================
    // OWNER-OPERATOR PDF — 7 pages
    // Totals / Summary / Business P&L / Trips / Fuel / Vehicle exp / Personal exp
    // =========================================================

    // ---- Page 1: Totals (visual card) ----
    sectionTitle(L.totalsSheet || 'Totals')

    // Business block card
    doc.setFontSize(12)
    doc.setFont('Roboto', 'bold')
    doc.setTextColor(245, 158, 11)
    doc.text(L.businessSection || 'Business', 14, 32)
    doc.setFont('Roboto', 'normal')
    doc.setTextColor(0)

    const businessRows = [
      [L.income || 'Income', cs + fmt(totalIncome)],
      ['\u2212 ' + (L.vehicleExpenses || 'Vehicle expenses'), cs + fmt(totalVehicleExp)],
      ['= ' + (L.businessProfit || 'Business profit'), cs + fmt(businessProfit)],
    ]
    autoTable(doc, {
      startY: 36,
      body: businessRows,
      ...baseOpts,
      styles: { ...baseOpts.styles, fontSize: 11, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 180 }, 1: { halign: 'right', cellWidth: 60 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index === businessRows.length - 1) {
          d.cell.styles.fillColor = [255, 242, 204]
          d.cell.styles.fontStyle = 'bold'
          if (d.column.index === 1) {
            d.cell.styles.textColor = businessProfit >= 0 ? [34, 197, 94] : [239, 68, 68]
          }
        } else if (d.section === 'body' && d.row.index === 0 && d.column.index === 1) {
          d.cell.styles.textColor = [34, 197, 94]
        } else if (d.section === 'body' && d.row.index === 1 && d.column.index === 1) {
          d.cell.styles.textColor = [239, 68, 68]
        }
      },
    })

    let afterBusinessY = doc.lastAutoTable?.finalY || 70

    doc.setFontSize(12)
    doc.setFont('Roboto', 'bold')
    doc.setTextColor(245, 158, 11)
    doc.text(L.personalSection || 'Personal', 14, afterBusinessY + 14)
    doc.setFont('Roboto', 'normal')
    doc.setTextColor(0)

    const personalRows = [
      [L.businessProfit || 'Business profit', cs + fmt(businessProfit)],
      ['\u2212 ' + (L.personalExpenses || 'Personal expenses'), cs + fmt(personalCost)],
      ['= ' + (L.netInHand || 'Net in hand'), cs + fmt(netInHand)],
    ]
    autoTable(doc, {
      startY: afterBusinessY + 18,
      body: personalRows,
      ...baseOpts,
      styles: { ...baseOpts.styles, fontSize: 11, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 180 }, 1: { halign: 'right', cellWidth: 60 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index === personalRows.length - 1) {
          d.cell.styles.fillColor = [255, 242, 204]
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.fontSize = 13
          if (d.column.index === 1) {
            d.cell.styles.textColor = netInHand >= 0 ? [34, 197, 94] : [239, 68, 68]
          }
        } else if (d.section === 'body' && d.row.index === 0 && d.column.index === 1) {
          d.cell.styles.textColor = businessProfit >= 0 ? [34, 197, 94] : [239, 68, 68]
        } else if (d.section === 'body' && d.row.index === 1 && d.column.index === 1) {
          d.cell.styles.textColor = [239, 68, 68]
        }
      },
    })

    // ---- Page 2: Summary ----
    doc.addPage()
    sectionTitle(L.summarySheet || 'Summary')
    const sumRowsO = [
      [L.period || 'Period', String(period || '')],
      [L.trips || 'Trips', String(tripsCount)],
      [(L.distance || 'Distance') + ' (' + distLabel + ')', String(totalDist)],
    ]
    if (totalDist > 0) {
      sumRowsO.push([(L.avgRatePerDist || 'Avg rate') + ' (' + cs + '/' + distLabel + ')', String(Math.round(avgRatePerDist * 100) / 100)])
    }
    sumRowsO.push([(L.income || 'Income') + ' (' + cs + ')', fmt(totalIncome)])
    sumRowsO.push([(L.vehicleExpenses || 'Vehicle expenses') + ' (' + cs + ')', fmt(totalVehicleExp)])
    sumRowsO.push([(L.businessProfit || 'Business profit') + ' (' + cs + ')', fmt(businessProfit)])
    sumRowsO.push([(L.personalExpenses || 'Personal expenses') + ' (' + cs + ')', fmt(personalCost)])
    sumRowsO.push([(L.netInHand || 'Net in hand') + ' (' + cs + ')', fmt(netInHand)])
    if (totalDist > 0) {
      sumRowsO.push([(L.costPerDist || 'Cost per mile') + ' (' + cs + '/' + distLabel + ')', String(Math.round(costPerDist * 100) / 100)])
    }
    if (mpg > 0) {
      sumRowsO.push(['MPG', String(Math.round(mpg * 10) / 10)])
    }
    autoTable(doc, {
      startY: 28,
      head: [[L.metric || 'Metric', L.value || 'Value']],
      body: sumRowsO,
      ...baseOpts,
    })

    // ---- Page 3: Business P&L ----
    doc.addPage()
    sectionTitle(L.businessPnl || 'Business P&L')
    const pnlMapO = {}
    trips.forEach(trip => {
      const d = (trip.created_at || '').slice(0, 10)
      if (!pnlMapO[d]) pnlMapO[d] = { income: 0, expense: 0 }
      pnlMapO[d].income += (trip.income || 0)
    })
    const addExpPDF = (d, a) => {
      if (!d || !a) return
      const k = d.slice(0, 10)
      if (!pnlMapO[k]) pnlMapO[k] = { income: 0, expense: 0 }
      pnlMapO[k].expense += a
    }
    fuels.forEach(f => addExpPDF(f.date, f.cost || 0))
    serviceRecs.forEach(r => addExpPDF(r.date, r.cost || 0))
    ;(tireRecs || []).forEach(r => addExpPDF(r.installed_at, r.cost || 0))
    vehicleExps.forEach(e => addExpPDF(e.date, e.amount || 0))
    const pnlKeysO = Object.keys(pnlMapO).sort()
    const pnlBodyO = pnlKeysO.map(k => [k, fmt(pnlMapO[k].income), fmt(pnlMapO[k].expense), fmt(pnlMapO[k].income - pnlMapO[k].expense)])
    pnlBodyO.push([L.total || 'TOTAL', fmt(totalIncome), fmt(totalVehicleExp), fmt(businessProfit)])
    autoTable(doc, {
      startY: 28,
      head: [[L.date || 'Date', (L.income || 'Income') + ' (' + cs + ')', (L.expense || 'Expense') + ' (' + cs + ')', (L.profit || 'Profit') + ' (' + cs + ')']],
      body: pnlBodyO,
      ...baseOpts,
      ...markTotalRow(pnlBodyO.length - 1),
    })

    // ---- Page 4: Trips (no driverPay) ----
    doc.addPage()
    sectionTitle(L.trips || 'Trips')
    const tripBodyO = trips.map(trip => [
      (trip.created_at || '').slice(0, 10),
      trip.origin || '',
      trip.destination || '',
      String(convDist(trip.distance_km || 0)),
      fmt(trip.income),
    ])
    tripBodyO.push([L.total || 'TOTAL', '', '', String(totalDist), fmt(totalIncome)])
    autoTable(doc, {
      startY: 28,
      head: [[L.date || 'Date', L.from || 'From', L.to || 'To', distLabel, (L.income || 'Income') + ' (' + cs + ')']],
      body: tripBodyO,
      ...baseOpts,
      ...markTotalRow(tripBodyO.length - 1),
    })

    // ---- Page 5: Fuel ----
    doc.addPage()
    sectionTitle(L.fuel || 'Fuel')
    if (fuels.length === 0) {
      autoTable(doc, {
        startY: 28,
        head: [[L.date || 'Date', L.station || 'Station', volLabel, cs + '/' + volLabel, (L.total || 'Total') + ' (' + cs + ')', (L.odometer || 'Odo') + ' (' + distLabel + ')']],
        body: [[{ content: L.noFuelRecords || 'No fuel records for this period', colSpan: 6, styles: { halign: 'center', fontStyle: 'normal', font: 'Roboto', textColor: 100 } }]],
        ...baseOpts,
      })
    } else {
      const sortedFuelsO = [...fuels].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      const fuelBodyO = sortedFuelsO.map(f => {
        const vol = convVol(f.liters || 0)
        const price = vol > 0 ? Math.round(((f.cost || 0) / vol) * 1000) / 1000 : 0
        return [
          (f.date || '').slice(0, 10),
          f.station || '',
          String(vol),
          String(price),
          fmt(f.cost),
          f.odometer ? String(convDist(f.odometer)) : '',
        ]
      })
      const avgPriceO = totalVol > 0 ? (fuelCost / totalVol).toFixed(3) : ''
      fuelBodyO.push([L.total || 'TOTAL', '', String(totalVol), avgPriceO, fmt(fuelCost), ''])
      autoTable(doc, {
        startY: 28,
        head: [[L.date || 'Date', L.station || 'Station', volLabel, cs + '/' + volLabel, (L.total || 'Total') + ' (' + cs + ')', (L.odometer || 'Odo') + ' (' + distLabel + ')']],
        body: fuelBodyO,
        ...baseOpts,
        ...markTotalRow(fuelBodyO.length - 1),
      })
    }

    // ---- Page 6: Vehicle expenses (translated categories) ----
    doc.addPage()
    sectionTitle(L.vehicleExpenses || 'Vehicle Expenses')
    const vCombinedO = []
    fuels.forEach(f => vCombinedO.push({ date: f.date || '', category: L.fuel || (catLabels.fuel) || 'Fuel', description: f.station || '', amount: f.cost || 0 }))
    vehicleExps.forEach(e => vCombinedO.push({ date: e.date || '', category: tr(e.category), description: e.description || '', amount: e.amount || 0 }))
    serviceRecs.forEach(r => vCombinedO.push({ date: r.date || '', category: svcType(r.type), description: r.description || '', amount: r.cost || 0 }))
    ;(tireRecs || []).forEach(r => vCombinedO.push({ date: r.installed_at || '', category: L.tires || 'Tires', description: ((r.brand || '') + ' ' + (r.model || '')).trim(), amount: r.cost || 0 }))
    vCombinedO.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    const vBodyO = vCombinedO.map(e => [(e.date || '').slice(0, 10), e.category, e.description, fmt(e.amount)])
    const vSumO = vCombinedO.reduce((s, r) => s + (r.amount || 0), 0)
    vBodyO.push([L.total || 'TOTAL', '', '', fmt(vSumO)])
    autoTable(doc, {
      startY: 28,
      head: [[L.date || 'Date', L.category || 'Category', L.description || 'Description', (L.amount || 'Amount') + ' (' + cs + ')']],
      body: vBodyO,
      ...baseOpts,
      ...markTotalRow(vBodyO.length - 1),
    })

    // ---- Page 7: Personal expenses (translated categories) ----
    doc.addPage()
    sectionTitle(L.personalExpenses || 'Personal Expenses')
    const sortedBytO = [...bytExps].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    const pBodyO = sortedBytO.map(e => [(e.date || '').slice(0, 10), tr(e.category), e.description || '', fmt(e.amount)])
    pBodyO.push([L.total || 'TOTAL', '', '', fmt(personalCost)])
    autoTable(doc, {
      startY: 28,
      head: [[L.date || 'Date', L.category || 'Category', L.description || 'Description', (L.amount || 'Amount') + ' (' + cs + ')']],
      body: pBodyO,
      ...baseOpts,
      ...markTotalRow(pBodyO.length - 1),
    })

    doc.save(filename || 'full_report.pdf')
    return
  }

  // =========================================================
  // DRIVER PDF (hired driver) — original flow
  // =========================================================

  // ---- Section 1: Summary ----
  sectionTitle(L.summarySheet || 'Summary')
  const sumRows = [
    [L.trips || 'Trips', String(trips.length)],
    [(L.distance || 'Distance') + ' (' + distLabel + ')', String(totalDist)],
    [(L.income || 'Income') + ' (' + cs + ')', fmt(totalIncome)],
    [(L.driverPay || 'Driver pay') + ' (' + cs + ')', fmt(totalDriverPay)],
    [(L.fuelCost || 'Fuel cost') + ' (' + cs + ')', fmt(fuelCost)],
    [(L.vehicleExpenses || 'Vehicle exp.') + ' (' + cs + ')', fmt(totalVehicleExp)],
    [(L.personalExpenses || 'Personal exp.') + ' (' + cs + ')', fmt(personalCost)],
    [(L.netProfit || 'Net profit') + ' (' + cs + ')', fmt(netProfit)],
    ['MPG', mpg > 0 ? String(Math.round(mpg * 10) / 10) : '-'],
  ]
  autoTable(doc, { startY: 28, head: [[L.metric || 'Metric', L.value || 'Value']], body: sumRows, ...baseOpts })

  // ---- Section 2: My Salary ----
  doc.addPage()
  sectionTitle(L.mySalary || 'My Salary')
  const salBody = trips.map(tr => [
    (tr.created_at || '').slice(0, 10),
    (tr.origin || '') + ' \u2192 ' + (tr.destination || ''),
    String(convDist(tr.distance_km || 0)),
    fmt(tr.income),
    fmt(tr.driver_pay),
  ])
  salBody.push([L.total || 'TOTAL', '', String(totalDist), fmt(totalIncome), fmt(totalDriverPay)])
  autoTable(doc, {
    startY: 28,
    head: [[L.date || 'Date', L.route || 'Route', distLabel, (L.income || 'Income') + ' (' + cs + ')', (L.driverPay || 'My pay') + ' (' + cs + ')']],
    body: salBody,
    ...baseOpts,
    ...markTotalRow(salBody.length - 1),
  })

  // ---- Section 3: Vehicle P&L ----
  doc.addPage()
  sectionTitle(L.pnlReport || 'Vehicle P&L')
  const pnlMap = {}
  trips.forEach(tr => {
    const d = (tr.created_at || '').slice(0, 10)
    if (!pnlMap[d]) pnlMap[d] = { income: 0, expense: 0 }
    pnlMap[d].income += (tr.income || 0)
  })
  const addExp = (d, a) => {
    if (!d || !a) return
    const k = d.slice(0, 10)
    if (!pnlMap[k]) pnlMap[k] = { income: 0, expense: 0 }
    pnlMap[k].expense += a
  }
  fuels.forEach(f => addExp(f.date, f.cost || 0))
  serviceRecs.forEach(r => addExp(r.date, r.cost || 0))
  ;(tireRecs || []).forEach(r => addExp(r.installed_at, r.cost || 0))
  vehicleExps.forEach(e => addExp(e.date, e.amount || 0))
  const pnlKeys = Object.keys(pnlMap).sort()
  const pnlBody = pnlKeys.map(k => [k, fmt(pnlMap[k].income), fmt(pnlMap[k].expense), fmt(pnlMap[k].income - pnlMap[k].expense)])
  pnlBody.push([L.total || 'TOTAL', fmt(totalIncome), fmt(totalVehicleExp), fmt(totalIncome - totalVehicleExp)])
  autoTable(doc, {
    startY: 28,
    head: [[L.date || 'Date', (L.income || 'Income') + ' (' + cs + ')', (L.expense || 'Expense') + ' (' + cs + ')', (L.profit || 'Profit') + ' (' + cs + ')']],
    body: pnlBody,
    ...baseOpts,
    ...markTotalRow(pnlBody.length - 1),
  })

  // ---- Section 4: Trips ----
  doc.addPage()
  sectionTitle(L.trips || 'Trips')
  const tripBody = trips.map(tr => [
    (tr.created_at || '').slice(0, 10),
    tr.origin || '',
    tr.destination || '',
    String(convDist(tr.distance_km || 0)),
    fmt(tr.income),
  ])
  tripBody.push([L.total || 'TOTAL', '', '', String(totalDist), fmt(totalIncome)])
  autoTable(doc, {
    startY: 28,
    head: [[L.date || 'Date', L.from || 'From', L.to || 'To', distLabel, (L.income || 'Income') + ' (' + cs + ')']],
    body: tripBody,
    ...baseOpts,
    ...markTotalRow(tripBody.length - 1),
  })

  // ---- Section 5: Fuel ----
  doc.addPage()
  sectionTitle(L.fuel || 'Fuel')
  const sortedFuels = [...fuels].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const fuelBody = sortedFuels.map(f => {
    const vol = convVol(f.liters || 0)
    const price = vol > 0 ? Math.round(((f.cost || 0) / vol) * 1000) / 1000 : 0
    return [
      (f.date || '').slice(0, 10),
      f.station || '',
      String(vol),
      String(price),
      fmt(f.cost),
      f.odometer ? String(convDist(f.odometer)) : '',
    ]
  })
  const avgPrice = totalVol > 0 ? (fuelCost / totalVol).toFixed(3) : ''
  fuelBody.push([L.total || 'TOTAL', '', String(totalVol), avgPrice, fmt(fuelCost), ''])
  autoTable(doc, {
    startY: 28,
    head: [[L.date || 'Date', L.station || 'Station', volLabel, cs + '/' + volLabel, (L.total || 'Total') + ' (' + cs + ')', (L.odometer || 'Odo') + ' (' + distLabel + ')']],
    body: fuelBody,
    ...baseOpts,
    ...markTotalRow(fuelBody.length - 1),
  })

  // ---- Section 6: Vehicle expenses ----
  doc.addPage()
  sectionTitle(L.vehicleExpenses || 'Vehicle Expenses')
  const vCombined = []
  vehicleExps.forEach(e => vCombined.push({ date: e.date || '', category: e.category || '', description: e.description || '', amount: e.amount || 0 }))
  serviceRecs.forEach(r => vCombined.push({ date: r.date || '', category: r.type || (L.repair || 'Service'), description: r.description || '', amount: r.cost || 0 }))
  ;(tireRecs || []).forEach(r => vCombined.push({ date: r.installed_at || '', category: L.tires || 'Tires', description: ((r.brand || '') + ' ' + (r.model || '')).trim(), amount: r.cost || 0 }))
  vCombined.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const vBody = vCombined.map(e => [e.date.slice(0, 10), e.category, e.description, fmt(e.amount)])
  const vSum = vCombined.reduce((s, r) => s + (r.amount || 0), 0)
  vBody.push([L.total || 'TOTAL', '', '', fmt(vSum)])
  autoTable(doc, {
    startY: 28,
    head: [[L.date || 'Date', L.category || 'Category', L.description || 'Description', (L.amount || 'Amount') + ' (' + cs + ')']],
    body: vBody,
    ...baseOpts,
    ...markTotalRow(vBody.length - 1),
  })

  // ---- Section 7: Personal expenses ----
  doc.addPage()
  sectionTitle(L.personalExpenses || 'Personal Expenses')
  const sortedByt = [...bytExps].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const pBody = sortedByt.map(e => [(e.date || '').slice(0, 10), e.category || '', e.description || '', fmt(e.amount)])
  pBody.push([L.total || 'TOTAL', '', '', fmt(personalCost)])
  autoTable(doc, {
    startY: 28,
    head: [[L.date || 'Date', L.category || 'Category', L.description || 'Description', (L.amount || 'Amount') + ' (' + cs + ')']],
    body: pBody,
    ...baseOpts,
    ...markTotalRow(pBody.length - 1),
  })

  doc.save(filename || 'full_report.pdf')
}
