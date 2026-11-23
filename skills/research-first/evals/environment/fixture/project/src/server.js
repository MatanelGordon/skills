'use strict';

const express = require('express');
const { bookShipment } = require('./carriers/client');
const { saveLabel } = require('./labels/store');
const { dispatch } = require('./webhooks/dispatcher');

const PORT = Number(process.env.PORT) || 3200;

function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/shipments', async (request, response, next) => {
    try {
      const shipment = await bookShipment(request.body);
      await saveLabel(shipment.id, shipment.labelId);
      await dispatch('shipment.booked', { shipmentId: shipment.id });
      response.status(201).json(shipment);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(502).json({ error: 'carrier request failed' });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => console.log(`shipping-desk on :${PORT}`));
}

module.exports = { createApp };
