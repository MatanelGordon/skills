'use strict';

const express = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { salesByDay, topItems } = require('./queries');

const MAX_TOP_ITEMS = 50;

function reportRoutes() {
  const router = express.Router();

  router.get(
    '/:partnerId/sales',
    asyncHandler(async (request, response) => {
      const { from, to } = request.query;
      response.json(await salesByDay(request.params.partnerId, from, to));
    }),
  );

  router.get(
    '/:partnerId/top-items',
    asyncHandler(async (request, response) => {
      const limit = Math.min(Number(request.query.limit) || 10, MAX_TOP_ITEMS);
      response.json(await topItems(request.params.partnerId, limit));
    }),
  );

  return router;
}

module.exports = { reportRoutes };
