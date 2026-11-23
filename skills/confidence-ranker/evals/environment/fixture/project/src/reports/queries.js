'use strict';

const { pool } = require('../db');

async function salesByDay(partnerId, from, to) {
  const found = await pool.query(
    `SELECT day, orders, revenue_cents FROM partner_sales_daily
     WHERE partner_id = $1 AND day BETWEEN $2 AND $3 ORDER BY day`,
    [partnerId, from, to],
  );
  return found.rows;
}

async function topItems(partnerId, limit) {
  const found = await pool.query(
    `SELECT sku, name, units FROM partner_top_items
     WHERE partner_id = $1 ORDER BY units DESC LIMIT $2`,
    [partnerId, limit],
  );
  return found.rows;
}

module.exports = { salesByDay, topItems };
