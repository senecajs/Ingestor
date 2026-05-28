/* Copyright (c) 2024 Seneca contributors, MIT License */

import Path from 'path'
import Fsp from 'fs/promises'
import Crypto from 'crypto'

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
      { role: 'ingest', process: 'file', kind },
      { filename, content, kind, bytes },
    )
  })

  // PDF handler — parses the PDF and writes one ingest/doc entity plus one
  // ingest/page entity per page.
  // Idempotent: same filename + content hash → skips if already done.
  seneca.message(
    'role:ingest,process:file,kind:pdf',
    async function (this: any, msg: any) {
      const seneca = this
      const { filename, content } = msg

      const hash = hashContent(content)

      const existing = await seneca
        .entity('ingest/doc')
        .list$({ filename, hash })

      if (existing.length > 0 && 'done' === existing[0].status) {
        return { ok: true, why: 'already-processed', doc_id: existing[0].id }
      }

      let docEnt: any =
        existing.length > 0
          ? existing[0]
          : await seneca
              .entity('ingest/doc')
              .make$()
              .data$({ filename, hash, kind: 'pdf', status: 'processing' })
              .save$()

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
        const existingPages = await seneca
          .entity('ingest/page')
          .list$({ doc_id: docEnt.id, page_num })

        if (existingPages.length === 0) {
          await seneca
            .entity('ingest/page')
            .make$()
            .data$({ doc_id: docEnt.id, page_num, text: pages[i] })
            .save$()
        }
      }

      docEnt.status = 'done'
      docEnt.page_count = pages.length
      await docEnt.save$()

      return { ok: true, doc_id: docEnt.id, page_count: pages.length }
    },
  )

  return {
    name: 'Ingestor',
  }
}

function hashContent(content: Buffer): string {
  return Crypto.createHash('sha256').update(content).digest('hex')
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
