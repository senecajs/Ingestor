# Changes

## 0.1.0 2026-11-21

First release of `@seneca/ingestor`, and first entry of this change log.

* Seneca 4: the peer dependency is `seneca` `^4.0.0` (was `>=3`).
* The entity plugin peer is `@seneca/entity` `^29.0.0` (was
  `seneca-entity` `>=25`).
* Node.js 24 or later (`engines.node` `>=24`).
* The peer dependencies `seneca-promisify` and `@seneca/entity-util` are
  removed. Seneca 4 has promises built in (D4), and the plugin does not use
  `@seneca/entity-util`.
* The package ships its own build: `dist/` held only the build output of the
  OpenSearch store template that this repository started from, so `main`
  (`dist/Ingestor.js`) and `types` were missing.
* `repository.url` names `senecajs/Ingestor`.
* The tests load the entity plugin by its full name (`@seneca/entity`, B14)
  and use `@seneca/s3-store` 3, the Seneca 4 release. They also run against
  an S3 compatible server when `SENECA_TEST_S3_ENDPOINT` is set.
