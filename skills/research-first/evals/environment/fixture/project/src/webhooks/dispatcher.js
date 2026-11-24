'use strict';

const { retryWithBackoff } = require('../lib/backoff');

const STOREFRONT_HOOK = process.env.STOREFRONT_HOOK_URL;

async function post(event, payload) {
  const response = await fetch(STOREFRONT_HOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, payload }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    const error = new Error(`storefront hook answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

function dispatch(event, payload) {
  return retryWithBackoff(() => post(event, payload), { attempts: 5 });
}

module.exports = { dispatch };
