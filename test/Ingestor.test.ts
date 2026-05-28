/* Copyright © 2024 Seneca Project Contributors, MIT License. */

import * as path from 'path'

import Seneca from 'seneca'
import S3Store from '@seneca/s3-store'

import Ingestor from '../src/Ingestor'
import IngestorDoc from '../src/IngestorDoc'

const BUCKET_FOLDER = path.join(__dirname, '../data/bucket')
const FILES_PREFIX = 'files'

function makeSeneca() {
  return Seneca({ legacy: false })
    .test()
    .use('promisify')
    .use('entity')
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
    expect(result.count).toBe(2)

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
