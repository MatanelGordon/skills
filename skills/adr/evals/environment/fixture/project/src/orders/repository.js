'use strict';

const { pool } = require('../db');

const toOrder = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  status: row.status,
  lines: row.lines,
  totalCents: row.total_cents,
  cancelReason: row.cancel_reason ?? null,
  createdAt: row.created_at,
});

async function insertOrder(client, { customerId, lines }) {
  const priced = await client.query(
    'SELECT sku, price_cents FROM catalog_prices WHERE sku = ANY($1)',
    [lines.map((line) => line.sku)],
  );
  const priceBySku = new Map(priced.rows.map((row) => [row.sku, row.price_cents]));
  const totalCents = lines.reduce((sum, line) => sum + (priceBySku.get(line.sku) ?? 0) * line.quantity, 0);
  const inserted = await client.query(
    `INSERT INTO orders (customer_id, status, lines, total_cents)
     VALUES ($1, 'accepted', $2, $3) RETURNING *`,
    [customerId, JSON.stringify(lines), totalCents],
  );
  return toOrder(inserted.rows[0]);
}

async function findById(id) {
  const found = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return found.rows[0] ? toOrder(found.rows[0]) : null;
}

async function markCancelled(client, id, reason) {
  await client.query("UPDATE orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [id, reason]);
}

module.exports = { insertOrder, findById, markCancelled };
