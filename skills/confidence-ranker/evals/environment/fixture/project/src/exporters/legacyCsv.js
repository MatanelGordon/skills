'use strict';

const COLUMNS = ['day', 'orders', 'revenue_cents'];

const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

function exportReport(rows) {
  const lines = rows.map((row) => COLUMNS.map((column) => quote(row[column])).join(';'));
  return { contentType: 'text/csv', body: [COLUMNS.join(';'), ...lines].join('\r\n') };
}

module.exports = { exportReport };
