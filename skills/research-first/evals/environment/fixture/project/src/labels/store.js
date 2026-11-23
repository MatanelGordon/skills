'use strict';

const { pool } = require('../db');

async function saveLabel(shipmentId, labelId) {
  await pool.query('INSERT INTO labels (shipment_id, label_id) VALUES ($1, $2)', [shipmentId, labelId]);
}

async function findPurgeable(olderThanDays) {
  const found = await pool.query(
    `SELECT l.label_id FROM labels l JOIN shipments s ON s.id = l.shipment_id
     WHERE s.status = 'closed' AND s.closed_at < now() - ($1 || ' days')::interval`,
    [olderThanDays],
  );
  return found.rows.map((row) => row.label_id);
}

async function forget(labelId) {
  await pool.query('DELETE FROM labels WHERE label_id = $1', [labelId]);
}

module.exports = { saveLabel, findPurgeable, forget };
