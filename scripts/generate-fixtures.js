/* Generate real binary fixture files for the local S3 bucket. */
'use strict'

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const BUCKET_FILES = path.join(__dirname, '../data/bucket/files')

function createMinimalPDF(pageText) {
  const escapedText = pageText.replace(/[()\\]/g, '\\$&')
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`
  const streamLen = Buffer.byteLength(stream)

  const parts = []
  const offsets = new Array(6).fill(0)
  let pos = 0
  const w = (s) => { parts.push(s); pos += Buffer.byteLength(s) }

  w('%PDF-1.4\n')
  offsets[1] = pos; w('1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n')
  offsets[2] = pos; w('2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n')
  offsets[3] = pos; w(
    '3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]' +
    ' /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n'
  )
  offsets[4] = pos; w(
    `4 0 obj\n<</Length ${streamLen}>>\nstream\n${stream}\nendstream\nendobj\n`
  )
  offsets[5] = pos; w(
    '5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n'
  )
  const xrefOffset = pos
  const fmt = (n) => n.toString().padStart(10, '0') + ' 00000 n \n'
  w('xref\n0 6\n0000000000 65535 f \n')
  w(fmt(offsets[1]) + fmt(offsets[2]) + fmt(offsets[3]) + fmt(offsets[4]) + fmt(offsets[5]))
  w(`trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`)
  return Buffer.from(parts.join(''))
}

function createMinimalXLSX(sheetName, rows) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

fs.mkdirSync(BUCKET_FILES, { recursive: true })

const pdfBuf = createMinimalPDF('Seneca Ingestor Sample Document')
fs.writeFileSync(path.join(BUCKET_FILES, 'sample.pdf'), pdfBuf)
console.log(`Created sample.pdf  (${pdfBuf.length} bytes)`)

const xlsxBuf = createMinimalXLSX('Employees', [
  ['Name', 'Age', 'Role'],
  ['Alice', 30, 'Engineer'],
  ['Bob', 25, 'Designer'],
])
fs.writeFileSync(path.join(BUCKET_FILES, 'sample.xlsx'), xlsxBuf)
console.log(`Created sample.xlsx (${xlsxBuf.length} bytes)`)
