'use strict';

const express = require('express');
const { pool } = require('./db');

const PORT = Number(process.env.PORT) || 3100;

function createApp() {
  const app = express();

  app.get('/items/:sku', async (request, response, next) => {
    try {
      const found = await pool.query('SELECT sku, name, price_cents, stock FROM items WHERE sku = $1', [
        request.params.sku,
      ]);
      if (found.rows.length === 0) {
        response.status(404).json({ error: 'item not found' });
        return;
      }
      response.json(found.rows[0]);
    } catch (error) {
      next(error);
    }
  });

  app.get('/healthz', (_request, response) => response.json({ ok: true }));

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: 'internal error' });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => console.log(`catalog-sync on :${PORT}`));
}

module.exports = { createApp };
