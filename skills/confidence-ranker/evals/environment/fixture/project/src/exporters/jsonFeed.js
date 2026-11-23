'use strict';

function exportReport(rows) {
  return { contentType: 'application/json', body: JSON.stringify({ rows }) };
}

module.exports = { exportReport };
