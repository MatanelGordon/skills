import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rateLimit } from '../src/middleware.js';

const WINDOW_MS = 1000;

function send(limiter, ip) {
  const res = {
    statusCode: 200,
    headers: {},
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json() { return this; },
  };
  let passed = false;
  limiter({ ip }, res, () => { passed = true; });
  return { passed, res };
}

test('lets a client through until max is reached', () => {
  const limiter = rateLimit({ windowMs: WINDOW_MS, max: 2, now: () => 0 });
  assert.equal(send(limiter, '10.0.0.1').passed, true);
  assert.equal(send(limiter, '10.0.0.1').passed, true);
});

test('answers 429 with Retry-After once max is passed', () => {
  const limiter = rateLimit({ windowMs: WINDOW_MS, max: 1, now: () => 0 });
  send(limiter, '10.0.0.1');
  const { passed, res } = send(limiter, '10.0.0.1');
  assert.equal(passed, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '1');
});

test('counts each client separately', () => {
  const limiter = rateLimit({ windowMs: WINDOW_MS, max: 1, now: () => 0 });
  send(limiter, '10.0.0.1');
  assert.equal(send(limiter, '10.0.0.2').passed, true);
});
