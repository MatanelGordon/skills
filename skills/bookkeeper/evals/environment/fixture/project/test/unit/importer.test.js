'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { importCatalog } = require('../../src/importer/run');

test('upserts every item the supplier returns', async () => {
  const written = [];
  const db = { query: async (_sql, values) => written.push(values) };
  const read = async () => [
    { sku: 'A-1', name: 'Anvil', priceCents: 12900, stock: 4 },
    { sku: 'B-2', name: 'Bellows', priceCents: 4500, stock: 0 },
  ];

  const result = await importCatalog({ read, db });

  assert.equal(result.imported, 2);
  assert.deepEqual(written[1], ['B-2', 'Bellows', 4500, 0]);
});
