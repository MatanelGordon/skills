'use strict';

const express = require('express');
const { orderRoutes } = require('./orders/routes');
const { startConsumers } = require('./orders/service');

const PORT = Number(process.env.PORT) || 3000;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/orders', orderRoutes());
  app.use((error, _request, response, _next) => {
    const status = error.status || 500;
    response.status(status).json({ error: status === 500 ? 'internal error' : error.message });
  });
  return app;
}

if (require.main === module) {
  startConsumers()
    .then(() => createApp().listen(PORT, () => console.log(`orders-api on :${PORT}`)))
    .catch((error) => {
      console.error('startup failed', error);
      process.exit(1);
    });
}

module.exports = { createApp };
