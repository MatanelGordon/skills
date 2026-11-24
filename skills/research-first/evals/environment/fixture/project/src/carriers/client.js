'use strict';

const BASE_URL = process.env.NORVIA_URL || 'https://api.norvia.example/v2';

async function call(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.NORVIA_TOKEN}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = new Error(`Norvia ${method} ${path} answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function bookShipment({ orderId, address, parcels }) {
  const booked = await call('POST', '/shipments', { reference: orderId, address, parcels });
  return { id: booked.shipment_id, labelId: booked.label_id, tracking: booked.tracking_number };
}

function getLabel(labelId) {
  return call('GET', `/labels/${labelId}`);
}

function deleteLabel(labelId) {
  return call('DELETE', `/labels/${labelId}`);
}

module.exports = { bookShipment, getLabel, deleteLabel };
