![Seneca](http://senecajs.org/files/assets/seneca-logo.png)

> A [Seneca.js][] file ingestion plugin.

# @seneca/ingestor

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |

## Description

`@seneca/ingestor` is a Seneca plugin that reads binary files from an S3 bucket (or a local folder in development), detects their type, and writes structured entities for downstream processing.

It uses Seneca's pattern matching to route each file to a type-specific handler based on the detected file kind (e.g. `kind:pdf`).

Currently supported file types:

- **PDF** — writes one `ingest/doc` entity and one `ingest/page` entity per page

## Install

```sh
npm install @seneca/ingestor
```

You will also need these peer dependencies:

```sh
npm install seneca seneca-entity seneca-promisify
```

And a store plugin for the `ingest/file` entity (the raw S3 file). For local development, [`@seneca/s3-store`](https://github.com/senecajs/SenecaS3Store) in local mode works well:

```sh
npm install @seneca/s3-store
```

## Quick Start

```js
const Seneca = require('seneca')
const S3Store = require('@seneca/s3-store')
const Ingestor = require('@seneca/ingestor')

const seneca = Seneca({ legacy: false })
  .use('promisify')
  .use('entity')
  .use(S3Store, {
    map: { '-/ingest/file': '*' },
    folder: 'files',
    shared: { Bucket: 'my-bucket' },
    s3: { Region: 'us-east-1' },
    local: {
      active: true, // use local folder instead of real S3
      folder: '/path/to/local/bucket',
    },
    ent: {
      '-/ingest/file': { bin: 'content' }, // read file content as binary
    },
  })
  .use(Ingestor, {
    bucket: {
      folder: '/path/to/local/bucket',
      prefix: 'files',
    },
  })

await seneca.ready()

// Run the ingestor — reads all files from the bucket and processes each one
const result = await seneca.post('role:ingest,cmd:run', {})
console.log(result)
// { ok: true, count: 2, results: [...] }
```

## Messages

| Pattern                             | Description                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `role:ingest,cmd:run`               | Lists all files in the bucket and dispatches `process:file` for each one      |
| `role:ingest,process:file`          | Reads a file from S3, detects its type, and routes to a kind-specific handler |
| `role:ingest,process:file,kind:pdf` | Parses a PDF and writes `ingest/doc` + `ingest/page` entities                 |

## Entities

| Entity        | Store      | Description                                                      |
| ------------- | ---------- | ---------------------------------------------------------------- |
| `ingest/file` | s3-store   | Raw binary file read from S3. Configured by the host app.        |
| `ingest/doc`  | host store | One per processed file — metadata (filename, hash, kind, status) |
| `ingest/page` | host store | One per PDF page, linked to `ingest/doc` via `doc_id`            |

`ingest/doc` and `ingest/page` are stored in whatever store the host app configures for them. By default Seneca uses its in-memory store.

## Local Development

Generate sample fixture files and run the tests:

```sh
node scripts/generate-fixtures.js
npm test
```

## Options

```js
{
  debug: false,
  bucket: {
    folder: './data/bucket',  // absolute path to the local bucket root
    prefix: 'files',          // sub-folder within the bucket where files live
  }
}
```

## License

Copyright (c) 2024 Seneca contributors.
Licensed under [MIT][].

[MIT]: ./LICENSE
[Seneca.js]: https://www.npmjs.com/package/seneca
