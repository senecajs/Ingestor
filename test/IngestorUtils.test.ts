/* Copyright © 2024 Seneca Project Contributors, MIT License. */

import { describe, test, expect } from '@jest/globals'

import Seneca from 'seneca'

import { hashContent, findOrCreateDoc, saveIfNotExists } from '../src/IngestorUtils'

function makeSeneca() {
  return Seneca({ legacy: false })
    .test()
    .use('promisify')
    .use('entity')
}

describe('IngestorUtils', () => {
  describe('hashContent', () => {
    test('returns a sha256 hex string', () => {
      const buf = Buffer.from('hello')
      const hash = hashContent(buf)
      expect(typeof hash).toBe('string')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]+$/)
    })

    test('same content produces same hash', () => {
      const buf = Buffer.from('seneca ingestor')
      expect(hashContent(buf)).toBe(hashContent(buf))
    })

    test('different content produces different hash', () => {
      expect(hashContent(Buffer.from('aaa'))).not.toBe(hashContent(Buffer.from('bbb')))
    })
  })

  describe('findOrCreateDoc', () => {
    test('creates a new doc when none exists', async () => {
      const seneca = makeSeneca()
      await seneca.ready()

      const content = Buffer.from('test content')
      const { doc, alreadyDone } = await findOrCreateDoc(seneca, 'test.pdf', content, 'pdf')

      expect(alreadyDone).toBe(false)
      expect(doc.id).toBeDefined()
      expect(doc.filename).toBe('test.pdf')
      expect(doc.kind).toBe('pdf')
      expect(doc.status).toBe('processing')

      await seneca.close()
    })

    test('returns alreadyDone when doc exists with status done', async () => {
      const seneca = makeSeneca()
      await seneca.ready()

      const content = Buffer.from('test content')

      const { doc: first } = await findOrCreateDoc(seneca, 'test.pdf', content, 'pdf')
      first.status = 'done'
      await first.save$()

      const { doc: second, alreadyDone } = await findOrCreateDoc(seneca, 'test.pdf', content, 'pdf')

      expect(alreadyDone).toBe(true)
      expect(second.id).toBe(first.id)

      await seneca.close()
    })

    test('reuses existing doc when status is not done', async () => {
      const seneca = makeSeneca()
      await seneca.ready()

      const content = Buffer.from('test content')

      const { doc: first } = await findOrCreateDoc(seneca, 'test.pdf', content, 'pdf')
      const { doc: second, alreadyDone } = await findOrCreateDoc(seneca, 'test.pdf', content, 'pdf')

      expect(alreadyDone).toBe(false)
      expect(second.id).toBe(first.id)

      await seneca.close()
    })
  })

  describe('saveIfNotExists', () => {
    test('saves entity when none exists', async () => {
      const seneca = makeSeneca()
      await seneca.ready()

      await saveIfNotExists(seneca, 'ingest/page', { doc_id: 'doc1', page_num: 1 }, {
        doc_id: 'doc1',
        page_num: 1,
        text: 'hello',
      })

      const pages = await seneca.entity('ingest/page').list$({ doc_id: 'doc1', page_num: 1 })
      expect(pages.length).toBe(1)
      expect(pages[0].text).toBe('hello')

      await seneca.close()
    })

    test('does not create duplicate when entity already exists', async () => {
      const seneca = makeSeneca()
      await seneca.ready()

      const query = { doc_id: 'doc2', page_num: 1 }
      const data = { ...query, text: 'hello' }

      await saveIfNotExists(seneca, 'ingest/page', query, data)
      await saveIfNotExists(seneca, 'ingest/page', query, data)

      const pages = await seneca.entity('ingest/page').list$(query)
      expect(pages.length).toBe(1)

      await seneca.close()
    })
  })
})
