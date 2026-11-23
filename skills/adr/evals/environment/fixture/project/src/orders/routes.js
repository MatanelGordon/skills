'use strict';

const express = require('express');
const { placeOrder, findOrder } = require('./service');

function orderRoutes() {
  const router = express.Router();

  router.post('/', async (request, response, next) => {
    try {
      const order = await placeOrder(request.body);
      response.status(201).json(order);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (request, response, next) => {
    try {
      const order = await findOrder(request.params.id);
      if (!order) {
        response.status(404).json({ error: 'order not found' });
        return;
      }
      response.json(order);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { orderRoutes };
