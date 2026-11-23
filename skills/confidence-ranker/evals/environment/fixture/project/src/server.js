'use strict';

const express = require('express');
const { reportRoutes } = require('./reports/routes');

const PORT = Number(process.env.PORT) || 3300;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/reports', reportRoutes());
  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(error.status || 500).json({ error: error.expose ? error.message : 'internal error' });
  });
  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => console.log(`partner-reports on :${PORT}`));
}

module.exports = { createApp };
