/* Copyright © 2024 Seneca Project Contributors, MIT License. */

import * as path from 'path'
import * as fs from 'fs'
import { describe, test, expect } from '@jest/globals'

import Seneca from 'seneca'
import S3Store from '@seneca/s3-store'

import Ingestor from '../src/Ingestor'
import IngestorDoc from '../src/IngestorDoc'

const BUCKET_FOLDER = path.join(__dirname, '../data/bucket')
const FILES_PREFIX = 'files'

function makeSeneca() {
  return Seneca({ legacy: false })
    .test()
    .use('@seneca/entity')
    .use(S3Store, {
      map: { '-/ingest/file': '*' },
      folder: FILES_PREFIX,
      shared: { Bucket: 'ingestor-local-bucket' },
      s3: { Region: 'us-east-1' },
      local: {
        active: true,
        folder: BUCKET_FOLDER,
      },
      ent: {
        '-/ingest/file': { bin: 'content' },
      },
    })
    .use(Ingestor, {
      bucket: {
        folder: BUCKET_FOLDER,
        prefix: FILES_PREFIX,
      },
    })
}

describe('Ingestor', () => {
  test('load-plugin', async () => {
    expect(Ingestor).toBeDefined()
    expect(IngestorDoc).toBeDefined()

    const seneca = makeSeneca()
    await seneca.ready()
    await seneca.close()
  })

  test('cmd-run', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    const result = await seneca.post('role:ingest,cmd:run', {})

    expect(result.ok).toBe(true)
    expect(result.count).toBe(3)

    await seneca.close()
  }, 30000)

  test('process-pdf', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    const result = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
    })

    expect(result.ok).toBe(true)
    expect(result.doc_id).toBeDefined()
    expect(result.page_count).toBeGreaterThan(0)

    const docEnt = await seneca.entity('ingest/doc').load$(result.doc_id)
    expect(docEnt.status).toBe('done')
    expect(docEnt.kind).toBe('pdf')

    const pages = await seneca
      .entity('ingest/page')
      .list$({ doc_id: result.doc_id })
    expect(pages.length).toBeGreaterThan(0)

    await seneca.close()
  }, 30000)

  test('idempotent-pdf', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    const r1 = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
    })
    expect(r1.ok).toBe(true)

    const r2 = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
    })
    expect(r2.ok).toBe(true)
    expect(r2.why).toBe('already-processed')
    expect(r2.doc_id).toBe(r1.doc_id)

    const all = await seneca.entity('ingest/doc').list$({ kind: 'pdf' })
    expect(all.filter((e: any) => e.filename === 'sample.pdf').length).toBe(1)

    await seneca.close()
  }, 30000)

  test('process-xlsx', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    const result = await seneca.post('role:ingest,process:file', {
      filename: 'sample.xlsx',
    })

    expect(result.ok).toBe(true)
    expect(result.doc_id).toBeDefined()
    expect(result.sheet_count).toBe(1)

    const docEnt = await seneca.entity('ingest/doc').load$(result.doc_id)
    expect(docEnt.status).toBe('done')
    expect(docEnt.kind).toBe('xlsx')

    const sheets = await seneca
      .entity('ingest/sheet')
      .list$({ doc_id: result.doc_id })
    expect(sheets.length).toBe(1)
    expect(sheets[0].sheet_name).toBe('Employees')
    expect(sheets[0].row_count).toBe(3)

    await seneca.close()
  })

  test('idempotent-xlsx', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    const r1 = await seneca.post('role:ingest,process:file', {
      filename: 'sample.xlsx',
    })
    expect(r1.ok).toBe(true)

    const r2 = await seneca.post('role:ingest,process:file', {
      filename: 'sample.xlsx',
    })
    expect(r2.ok).toBe(true)
    expect(r2.why).toBe('already-processed')
    expect(r2.doc_id).toBe(r1.doc_id)

    const sheets = await seneca
      .entity('ingest/sheet')
      .list$({ doc_id: r1.doc_id })
    expect(sheets.length).toBe(1)

    await seneca.close()
  })

  test('process-docx', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    const result = await seneca.post('role:ingest,process:file', {
      filename: 'sample.docx',
    })

    expect(result.ok).toBe(true)
    expect(result.doc_id).toBeDefined()
    expect(result.paragraph_count).toBeGreaterThan(0)

    const docEnt = await seneca.entity('ingest/doc').load$(result.doc_id)
    expect(docEnt.status).toBe('done')
    expect(docEnt.kind).toBe('docx')

    const paragraphs = await seneca
      .entity('ingest/paragraph')
      .list$({ doc_id: result.doc_id })
    expect(paragraphs.length).toBeGreaterThan(0)

    await seneca.close()
  })

  test('context-routing', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    // Register a context-specific handler — only fires for PDFs from 'invoices'
    seneca.message(
      'role:ingest,process:file,kind:pdf,source:invoices',
      async function (this: any, msg: any) {
        return { ok: true, why: 'invoices-handler', filename: msg.filename }
      },
    )

    const result = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
      source: 'invoices',
    })

    expect(result.ok).toBe(true)
    expect(result.why).toBe('invoices-handler')

    // Without source — routes to the generic PDF handler instead
    const result2 = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
    })
    expect(result2.ok).toBe(true)
    expect(result2.why).not.toBe('invoices-handler')

    await seneca.close()
  }, 30000)

  test('unsupported-kind', async () => {
    const seneca = makeSeneca()
    await seneca.ready()

    const result = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
      kind: 'unknown-format',
    })

    expect(result.ok).toBe(false)
    expect(result.why).toBe('unsupported-kind')

    await seneca.close()
  })
})


// The same messages against an S3 compatible server, such as the s3mock
// service of the Seneca test harness. Set SENECA_TEST_S3_ENDPOINT to run
// them, for example http://127.0.0.1:19100. The fixture files are written to
// the bucket through the ingest/file entity, under a folder of their own,
// and removed again at the end.
const S3_ENDPOINT = process.env.SENECA_TEST_S3_ENDPOINT
const S3_BUCKET = process.env.SENECA_TEST_S3_BUCKET || 'test-bucket'
const S3_FOLDER =
  'ingestor-test/' + Date.now().toString(36) + Math.random().toString(36).slice(2)
const FIXTURES = ['sample.pdf', 'sample.xlsx', 'sample.docx']

function makeS3Seneca() {
  return Seneca({ legacy: false })
    .test()
    .use('@seneca/entity')
    .use(S3Store, {
      map: { '-/ingest/file': '*' },
      folder: S3_FOLDER,
      shared: { Bucket: S3_BUCKET },
      s3: {
        endpoint: S3_ENDPOINT,
        forcePathStyle: true,
        region: process.env.SENECA_TEST_S3_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.SENECA_TEST_S3_ACCESS_KEY || 'test',
          secretAccessKey: process.env.SENECA_TEST_S3_SECRET_KEY || 'test',
        },
      },
      ent: {
        '-/ingest/file': { bin: 'content' },
      },
    })
    .use(Ingestor, {
      bucket: {
        folder: BUCKET_FOLDER,
        prefix: FILES_PREFIX,
      },
    })
}

const describeS3 = S3_ENDPOINT ? describe : describe.skip

describeS3('Ingestor-s3 (needs SENECA_TEST_S3_ENDPOINT)', () => {
  test('process-files', async () => {
    const seneca = makeS3Seneca()
    await seneca.ready()

    for (const filename of FIXTURES) {
      await seneca
        .entity('ingest/file')
        .make$()
        .data$({
          id$: filename,
          content: fs.readFileSync(
            path.join(BUCKET_FOLDER, FILES_PREFIX, filename),
          ),
        })
        .save$()
    }

    const pdf = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
    })
    expect(pdf.ok).toBe(true)
    expect(pdf.page_count).toBeGreaterThan(0)

    const xlsx = await seneca.post('role:ingest,process:file', {
      filename: 'sample.xlsx',
    })
    expect(xlsx.ok).toBe(true)
    expect(xlsx.sheet_count).toBe(1)

    const sheets = await seneca
      .entity('ingest/sheet')
      .list$({ doc_id: xlsx.doc_id })
    expect(sheets[0].sheet_name).toBe('Employees')
    expect(sheets[0].row_count).toBe(3)

    const docx = await seneca.post('role:ingest,process:file', {
      filename: 'sample.docx',
    })
    expect(docx.ok).toBe(true)
    expect(docx.paragraph_count).toBe(3)

    const again = await seneca.post('role:ingest,process:file', {
      filename: 'sample.pdf',
    })
    expect(again).toMatchObject({ ok: true, why: 'already-processed' })

    const missing = await seneca.post('role:ingest,process:file', {
      filename: 'missing.pdf',
    })
    expect(missing).toEqual({
      ok: false,
      why: 'file-not-found',
      filename: 'missing.pdf',
    })

    for (const filename of FIXTURES) {
      await seneca.entity('ingest/file').remove$(filename)
    }

    await seneca.close()
  }, 30000)
})
