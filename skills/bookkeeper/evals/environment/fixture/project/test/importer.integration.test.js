'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readSupplierItems } = require('../src/importer/supplier');

test('reads active items from the supplier database', async () => {
  const items = await readSupplierItems(process.env.SUPPLIER_DSN || 'SupplierStock');

  assert.ok(items.length > 0, 'supplier returned no active items');
  for (const item of items) {
    assert.match(item.sku, /\S/);
    assert.ok(Number.isInteger(item.priceCents) && item.priceCents >= 0);
    assert.ok(Number.isFinite(item.stock));
  }
});
