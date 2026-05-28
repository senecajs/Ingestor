/* Copyright (c) 2024 Seneca contributors, MIT License */

import Path from 'path'

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
