/* Copyright (c) 2024 Seneca contributors, MIT License */

import Crypto from 'crypto'

export function hashContent(content: Buffer): string {
  return Crypto.createHash('sha256').update(content).digest('hex')
}

export async function findOrCreateDoc(
  seneca: any,
  filename: string,
  content: Buffer,
  kind: string,
): Promise<{ doc: any; alreadyDone: boolean }> {
  const hash = hashContent(content)
  const existing = await seneca.entity('ingest/doc').list$({ filename, hash })

  if (existing.length > 0 && 'done' === existing[0].status) {
    return { doc: existing[0], alreadyDone: true }
  }

  const doc =
    existing.length > 0
      ? existing[0]
      : await seneca
          .entity('ingest/doc')
          .make$()
          .data$({ filename, hash, kind, status: 'processing' })
          .save$()

  return { doc, alreadyDone: false }
}

export async function saveIfNotExists(
  seneca: any,
  entityType: string,
  query: Record<string, any>,
  data: Record<string, any>,
): Promise<void> {
  const existing = await seneca.entity(entityType).list$(query)
  if (existing.length === 0) {
    await seneca.entity(entityType).make$().data$(data).save$()
  }
}
