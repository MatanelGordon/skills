'use strict';

const odbc = require('odbc');

const STOCK_QUERY = 'SELECT ItemCode, Description, UnitPrice, QtyOnHand FROM StockItems WHERE Active = 1';

async function readSupplierItems(dsn = process.env.SUPPLIER_DSN) {
  if (!dsn) throw new Error('SUPPLIER_DSN is not set');
  const connection = await odbc.connect(`DSN=${dsn}`);
  try {
    const rows = await connection.query(STOCK_QUERY);
    return rows.map((row) => ({
      sku: String(row.ItemCode).trim(),
      name: String(row.Description).trim(),
      priceCents: Math.round(Number(row.UnitPrice) * 100),
      stock: Number(row.QtyOnHand),
    }));
  } finally {
    await connection.close();
  }
}

module.exports = { readSupplierItems };
