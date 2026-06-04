/* Copyright (c) 2024 Seneca contributors, MIT License */

import Path from 'path'
import Fsp from 'fs/promises'

import { hashContent, findOrCreateDoc, saveIfNotExists } from './IngestorUtils'

type Options = {
  debug: boolean
  bucket: {
    folder: string
    prefix: string
  }
}

export type IngestorOptions = Partial<Options>

function Ingestor(this: any, options: Options) {
  const seneca: any = this

  // List files from the S3 bucket folder and process each one.
  // In local mode the s3-store list$() returns [] so we use Fsp.readdir
  // directly on the bucket folder.
  seneca.message('role:ingest,cmd:run', async function (this: any, msg: any) {
    const seneca = this
    const bucketFolder: string = msg.bucket_folder || options.bucket.folder
    const listFolder: string = Path.join(bucketFolder, options.bucket.prefix)

    let filenames: string[]
    try {
      const entries = await Fsp.readdir(listFolder, { withFileTypes: true })
      filenames = entries
        .filter((e) => e.isFile() && !e.name.startsWith('.'))
        .map((e) => e.name)
    } catch (err: any) {
      return {
        ok: false,
        why: 'bucket-read-error',
        folder: listFolder,
        err: err.message,
      }
    }

    console.log(`Found ${filenames.length} file(s) in ${listFolder}`)

    const results: any[] = []
    for (const filename of filenames) {
      const result = await seneca.post('role:ingest,process:file', { filename })
      results.push({ filename, ...result })
    }

    return { ok: true, count: results.length, results }
  })

  // General process:file handler — read binary content via the s3-store entity
  // API, detect kind with file-type (magic bytes, not extension), then
  // re-dispatch to a more-specific pattern (e.g. kind:pdf).
  // If msg.kind is already set and no specific handler matched, the message has
  // fallen back here — return unsupported-kind instead of looping infinitely.
  seneca.message('role:ingest,process:file', async function (this: any, msg: any) {
    const seneca = this

    if (msg.kind) {
      return { ok: false, why: 'unsupported-kind', kind: msg.kind }
    }

    const filename: string = msg.filename
    const source: string | undefined = msg.source

    const fileEnt = await seneca.entity('ingest/file').load$(filename)
    if (!fileEnt) {
      return { ok: false, why: 'file-not-found', filename }
    }

    const content: Buffer = fileEnt.content
    const bytes: number = content.length

    const FileType = require('file-type')
    const detected = await FileType.fromBuffer(content)
    const kind: string =
      detected?.ext ||
      Path.extname(filename).slice(1).toLowerCase() ||
      'unknown'

    console.log(`File: ${filename}, Size: ${bytes} bytes, Kind: ${kind}`)

    return seneca.post(
      { role: 'ingest', process: 'file', kind, ...(source ? { source } : {}) },
      { filename, content, kind, bytes, source },
    )
  })

  // PDF handler — parses the PDF and writes one ingest/doc entity plus one
  // ingest/page entity per page.
  seneca.message(
    'role:ingest,process:file,kind:pdf',
    async function (this: any, msg: any) {
      const seneca = this
      const { filename, content } = msg

      const { doc, alreadyDone } = await findOrCreateDoc(seneca, filename, content, 'pdf')
      if (alreadyDone) {
        return { ok: true, why: 'already-processed', doc_id: doc.id }
      }

      let pages: string[] = []
      try {
        const { PDFParse } = require('pdf-parse')
        const parser = new PDFParse({ data: content })
        const data = await parser.getText()
        await parser.destroy()
        pages = data.text
          .split(/\f/)
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0)
        if (pages.length === 0) {
          pages = [data.text.trim()]
        }
      } catch (err: any) {
        return { ok: false, why: 'pdf-parse-error', err: err.message }
      }

      for (let i = 0; i < pages.length; i++) {
        const page_num = i + 1
        await saveIfNotExists(seneca, 'ingest/page', { doc_id: doc.id, page_num }, {
          doc_id: doc.id,
          page_num,
          text: pages[i],
        })
      }

      doc.status = 'done'
      doc.page_count = pages.length
      await doc.save$()

      return { ok: true, doc_id: doc.id, page_count: pages.length }
    },
  )

  // DOCX handler — extracts text with mammoth and writes one ingest/doc entity
  // plus one ingest/paragraph entity per paragraph.
  seneca.message(
    'role:ingest,process:file,kind:docx',
    async function (this: any, msg: any) {
      const seneca = this
      const { filename, content } = msg

      const { doc, alreadyDone } = await findOrCreateDoc(seneca, filename, content, 'docx')
      if (alreadyDone) {
        return { ok: true, why: 'already-processed', doc_id: doc.id }
      }

      let paragraphs: string[] = []
      try {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer: content })
        paragraphs = result.value
          .split('\n')
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0)
      } catch (err: any) {
        return { ok: false, why: 'docx-parse-error', err: err.message }
      }

      for (let i = 0; i < paragraphs.length; i++) {
        const para_num = i + 1
        await saveIfNotExists(seneca, 'ingest/paragraph', { doc_id: doc.id, para_num }, {
          doc_id: doc.id,
          para_num,
          text: paragraphs[i],
        })
      }

      doc.status = 'done'
      doc.paragraph_count = paragraphs.length
      await doc.save$()

      return { ok: true, doc_id: doc.id, paragraph_count: paragraphs.length }
    },
  )

  // XLSX handler — parses the workbook and writes one ingest/doc entity plus
  // one ingest/sheet entity per sheet.
  seneca.message(
    'role:ingest,process:file,kind:xlsx',
    async function (this: any, msg: any) {
      const seneca = this
      const { filename, content } = msg

      const { doc, alreadyDone } = await findOrCreateDoc(seneca, filename, content, 'xlsx')
      if (alreadyDone) {
        return { ok: true, why: 'already-processed', doc_id: doc.id }
      }

      let sheets: Array<{ name: string; rows: any[][] }> = []
      try {
        const XLSX = require('xlsx')
        const workbook = XLSX.read(content, { type: 'buffer' })
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName]
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
          sheets.push({ name: sheetName, rows })
        }
      } catch (err: any) {
        return { ok: false, why: 'xlsx-parse-error', err: err.message }
      }

      for (const sheet of sheets) {
        await saveIfNotExists(seneca, 'ingest/sheet', { doc_id: doc.id, sheet_name: sheet.name }, {
          doc_id: doc.id,
          sheet_name: sheet.name,
          row_count: sheet.rows.length,
          rows: sheet.rows,
        })
      }

      doc.status = 'done'
      doc.sheet_count = sheets.length
      await doc.save$()

      return { ok: true, doc_id: doc.id, sheet_count: sheets.length }
    },
  )

  return {
    name: 'Ingestor',
  }
}

const defaults: Options = {
  debug: false,
  bucket: {
    folder: Path.join(process.cwd(), 'data/bucket'),
    prefix: 'files',
  },
}

Object.assign(Ingestor, { defaults })

export default Ingestor

if ('undefined' !== typeof module) {
  module.exports = Ingestor
}
