'use strict';

const { withTransaction } = require('../db');
const { publish, subscribe } = require('../queue');
const repository = require('./repository');

function validate(input) {
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  const isValidLine = (line) => typeof line.sku === 'string' && Number.isInteger(line.quantity) && line.quantity > 0;
  if (!input?.customerId || lines.length === 0 || !lines.every(isValidLine)) {
    const error = new Error('order needs a customerId and at least one line with sku and quantity');
    error.status = 400;
    throw error;
  }
  return { customerId: input.customerId, lines };
}

async function placeOrder(input) {
  const draft = validate(input);
  const order = await withTransaction((client) => repository.insertOrder(client, draft));
  await publish('stock.reserve', { orderId: order.id, lines: order.lines });
  await publish('order.accepted', { orderId: order.id, customerId: order.customerId });
  return order;
}

function findOrder(id) {
  return repository.findById(id);
}

async function cancelForStock({ orderId, sku }) {
  await withTransaction((client) => repository.markCancelled(client, orderId, `out of stock: ${sku}`));
  await publish('order.cancelled', { orderId, reason: 'out_of_stock' });
}

function startConsumers() {
  return subscribe('stock.rejected', 'orders.stock-rejected', cancelForStock);
}

module.exports = { placeOrder, findOrder, startConsumers };
