/* Copyright (c) 2024 Seneca contributors, MIT License */

import Path from 'path'
import Fsp from 'fs/promises'

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

  // List files from the local S3 bucket folder and process each one.
  // In local mode the s3-store list$() returns [] so we use Fsp.readdir
  // directly on the bucket folder.
  seneca.message('role:ingest,cmd:run', async function (this: any, msg: any) {
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

    return { ok: true, count: filenames.length, filenames }
  })

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
