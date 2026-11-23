'use strict';

const { pool } = require('../db');
const { readSupplierItems } = require('./supplier');

const UPSERT = `
  INSERT INTO items (sku, name, price_cents, stock)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (sku) DO UPDATE SET name = $2, price_cents = $3, stock = $4, updated_at = now()`;

async function importCatalog({ read = readSupplierItems, db = pool } = {}) {
  const items = await read();
  for (const item of items) {
    await db.query(UPSERT, [item.sku, item.name, item.priceCents, item.stock]);
  }
  return { imported: items.length };
}

if (require.main === module) {
  importCatalog()
    .then((result) => {
      console.log(`imported ${result.imported} items`);
      return pool.end();
    })
    .catch((error) => {
      console.error('import failed', error);
      process.exit(1);
    });
}

module.exports = { importCatalog };
