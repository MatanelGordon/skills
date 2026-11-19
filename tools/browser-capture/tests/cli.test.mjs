import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { parseArgs } from '../cli.mjs';
import { findBrowser } from '../lib/capture.mjs';
import { isCompatibleNodeVersion } from '../launcher.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'cli.mjs');
const fixture = join(here, 'fixtures');

test('CLI parser preserves defaults and repeated viewport options', () => {
  assert.deepEqual(parseArgs(['capture']), {
    command: 'capture',
    root: '.',
    entry: 'index.html',
    outDir: '.browser-capture/evidence',
    browserPath: '',
    timeoutMs: 30_000,
    viewports: undefined,
    json: false,
    port: undefined,
  });
  assert.deepEqual(parseArgs([
    'capture', '--root', '/tmp/site', '--viewport', 'wide:1200:800', '--viewport=phone:390:844',
  ]).viewports, [
    { name: 'wide', width: 1200, height: 800 },
    { name: 'phone', width: 390, height: 844 },
  ]);
  assert.throws(() => parseArgs(['capture', '--unknown', 'x']), /unknown option/i);
  assert.throws(() => parseArgs(['capture', '--root', 'a', '--root', 'b']), /duplicate option/i);
  assert.throws(() => parseArgs(['wat']), /unknown command/i);
  assert.equal(parseArgs(['serve', '--root', '/tmp/site', '--port', '4180']).port, 4180);
  assert.throws(() => parseArgs(['serve', '--port', '0']), /port/i);
  assert.equal(parseArgs(['doctor', '--json', 'true']).json, true);
});

test('launcher recognizes the exact isolated runtime floor', () => {
  assert.equal(isCompatibleNodeVersion('v18.20.8'), false);
  assert.equal(isCompatibleNodeVersion('v22.11.0'), false);
  assert.equal(isCompatibleNodeVersion('v22.12.0'), true);
  assert.equal(isCompatibleNodeVersion('v23.0.0'), true);
  assert.equal(isCompatibleNodeVersion('not-a-version'), false);
});

test('doctor reports the isolated runtime without downloading a browser', () => {
  const result = spawnSync(process.execPath, [cli, 'doctor', '--json', 'true'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.compatible, true);
  assert.equal(isCompatibleNodeVersion(report.node), true);
  assert.equal(report.dependencies, 'puppeteer-core 25.18.1');
  assert.equal(report.network, 'runtime network is restricted to the exact loopback preview origin');
  assert.ok(Object.hasOwn(report, 'browser'));
  assert.ok(Object.hasOwn(report, 'browserVersion'));
});

const localBrowser = await findBrowser();

test('capture command emits a structured manifest and diagnostic exit status', {
  skip: !localBrowser,
  timeout: 30_000,
}, async (t) => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'browser-capture-cli-'));
  const result = spawnSync(process.execPath, [
    cli,
    'capture',
    '--root', fixture,
    '--out', outputRoot,
    '--browser', localBrowser,
    '--viewport', 'phone:390:844',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /absolute paths are not allowed/i);

  const localOut = `.evidence-${Date.now()}`;
  t.after(() => rm(join(fixture, localOut), { recursive: true, force: true }));
  const success = spawnSync(process.execPath, [
    cli,
    'capture',
    '--root', fixture,
    '--out', localOut,
    '--browser', localBrowser,
    '--viewport', 'phone:390:844',
  ], { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  const report = JSON.parse(success.stdout);
  assert.equal(report.producer, 'browser-capture');
  assert.equal(report.captures[0].name, 'phone');
});
