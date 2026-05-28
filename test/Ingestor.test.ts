/* Copyright © 2024 Seneca Project Contributors, MIT License. */

import Seneca from 'seneca'

import Ingestor from '../src/Ingestor'
import IngestorDoc from '../src/IngestorDoc'

describe('Ingestor', () => {
  test('load-plugin', async () => {
    expect(Ingestor).toBeDefined()
    expect(IngestorDoc).toBeDefined()

    const seneca = Seneca({ legacy: false })
      .test()
      .use('promisify')
      .use('entity')
      .use(Ingestor)

    await seneca.ready()
    await seneca.close()
  })
})
