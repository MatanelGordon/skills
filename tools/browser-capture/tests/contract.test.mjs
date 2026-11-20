import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VIEWPORTS,
  buildChromeSecurityArgs,
  combineCaptureErrors,
  normalizeViewports,
  parseViewportSpec,
  validateBrowserPath,
  validateTimeout,
} from '../lib/contract.mjs';

test('capture contract supplies bounded desktop and mobile defaults', () => {
  assert.deepEqual(normalizeViewports(), DEFAULT_VIEWPORTS);
  assert.equal(validateTimeout(1_000), 1_000);
  assert.equal(validateTimeout(120_000), 120_000);
  assert.throws(() => validateTimeout(999), /timeout/i);
  assert.throws(() => validateTimeout(120_001), /timeout/i);
});

test('viewport contract accepts one through eight unique named viewports', () => {
  assert.deepEqual(parseViewportSpec('phone:390:844'), { name: 'phone', width: 390, height: 844 });
  assert.equal(normalizeViewports([{ name: 'only', width: 800, height: 600 }]).length, 1);
  assert.equal(normalizeViewports(Array.from({ length: 8 }, (_, index) => ({
    name: `v-${index}`,
    width: 800,
    height: 600,
  }))).length, 8);
  assert.throws(() => normalizeViewports([]), /between 1 and 8/i);
  assert.throws(() => normalizeViewports(Array.from({ length: 9 }, (_, index) => ({
    name: `v-${index}`,
    width: 800,
    height: 600,
  }))), /between 1 and 8/i);
  assert.throws(() => normalizeViewports([
    { name: 'same', width: 800, height: 600 },
    { name: 'same', width: 390, height: 844 },
  ]), /unique/i);
  assert.throws(() => parseViewportSpec('bad:0:844'), /viewport dimensions/i);
  assert.throws(() => parseViewportSpec('missing:800'), /name:width:height/i);
});

test('browser path and Chrome security arguments fail closed', () => {
  assert.equal(validateBrowserPath(''), '');
  assert.throws(() => validateBrowserPath('relative/chrome'), /absolute/i);
  const args = buildChromeSecurityArgs('http://127.0.0.1:8123', 'http://127.0.0.1:9123');
  assert.ok(args.includes('--disable-background-networking'));
  assert.ok(args.includes('--proxy-server=http://127.0.0.1:9123'));
  assert.ok(args.includes('--proxy-bypass-list=<-loopback>;127.0.0.1:8123'));
  assert.ok(args.some((arg) => arg.startsWith('--host-resolver-rules=')));
  assert(!args.some((arg) => arg.startsWith('--remote-debugging')));
  assert.throws(() => buildChromeSecurityArgs('https://example.test', 'http://127.0.0.1:9123'), /127\.0\.0\.1/i);
  assert.throws(() => buildChromeSecurityArgs('http://127.0.0.1:8123', 'https://example.test'), /deny proxy/i);
});

test('capture error combination preserves rendering and cleanup failures', () => {
  const rendering = new Error('render failed');
  const cleanup = new Error('cleanup failed');
  const combined = combineCaptureErrors(rendering, cleanup);
  assert.ok(combined instanceof AggregateError);
  assert.deepEqual(combined.errors, [rendering, cleanup]);
  assert.equal(combineCaptureErrors(rendering, null), rendering);
  assert.equal(combineCaptureErrors(null, cleanup), cleanup);
});
