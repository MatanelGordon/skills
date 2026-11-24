import { request } from 'undici';

const BASE_URL = process.env.ORDERS_API_URL ?? 'https://orders.internal.example';

export async function fetchOrder(orderId) {
  const { statusCode, body } = await request(`${BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (statusCode !== 200) {
    throw new Error(`Order ${orderId} request failed with status ${statusCode}`);
  }
  return body.json();
}
