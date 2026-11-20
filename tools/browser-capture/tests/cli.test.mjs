import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

import { formatError, parseArgs } from '../cli.mjs';
import { findBrowser } from '../lib/capture.mjs';
import { findCompatibleNode, isCompatibleNodeVersion, versionOf } from '../launcher.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'cli.mjs');
const launcher = join(here, '..', 'launcher.mjs');
const fixture = join(here, 'fixtures');
const localBrowser = await findBrowser();
if (!localBrowser && process.env.CI) throw new Error('CI requires a supported local Chrome-family browser.');

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
  assert.equal(parseArgs(['doctor', '--json']).json, true);
});

test('launcher recognizes the exact isolated runtime floor', () => {
  assert.equal(isCompatibleNodeVersion('v18.20.8'), false);
  assert.equal(isCompatibleNodeVersion('v22.11.0'), false);
  assert.equal(isCompatibleNodeVersion('v22.12.0'), true);
  assert.equal(isCompatibleNodeVersion('v23.0.0'), true);
  assert.equal(isCompatibleNodeVersion('not-a-version'), false);
});

test('launcher prefers the lowest compatible LTS runtime', { skip: process.platform === 'win32' }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'browser-capture-node-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const fakeNode = join(temporary, 'node');
  await writeFile(fakeNode, '#!/bin/sh\nprintf "v22.12.0\\n"\n', 'utf8');
  await chmod(fakeNode, 0o755);
  const selected = await findCompatibleNode({ PATH: temporary, NVM_DIR: join(temporary, 'missing') });
  assert.equal(versionOf(selected), 'v22.12.0');
});

test('nested capture errors retain every actionable cause', () => {
  const formatted = formatError(new AggregateError([
    new Error('navigation aborted'),
    new Error('browser close timed out'),
  ], 'capture and cleanup failed'));
  assert.match(formatted, /capture and cleanup failed/);
  assert.match(formatted, /navigation aborted/);
  assert.match(formatted, /browser close timed out/);
});

test('doctor reports the isolated runtime without downloading a browser', () => {
  const result = spawnSync(process.execPath, [cli, 'doctor', '--json', 'true'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.captureAvailable, true);
  assert.equal(report.nodeCompatible, true);
  assert.equal(isCompatibleNodeVersion(report.captureNode), true);
  assert.match(report.dependency, /^puppeteer-core@/);
  assert.ok(report.enforcement.some((item) => /deny proxy/i.test(item)));
  assert.ok(Object.hasOwn(report, 'browser'));
  assert.ok(Object.hasOwn(report, 'browserVersion'));
});

test('doctor rejects an executable that is not a Chrome-family browser with actionable output', () => {
  const result = spawnSync(process.execPath, [cli, 'doctor', '--browser', process.execPath, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 70, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.captureAvailable, false);
  assert.match(report.captureError, /not a supported Chrome-family browser/i);
});

test('launcher runs through file and directory symlinks', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'browser-capture-symlink-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const fileLink = join(temporary, 'browser-capture');
  const directoryLink = join(temporary, 'tool');
  await symlink(launcher, fileLink);
  await symlink(join(here, '..'), directoryLink, 'dir');
  for (const entry of [fileLink, join(directoryLink, 'launcher.mjs')]) {
    const result = spawnSync(process.execPath, [entry, 'doctor', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).producer, 'browser-capture');
  }
});

const availablePort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const firstLine = (stream) => new Promise((resolve, reject) => {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
    if (output.includes('\n')) resolve(output.split('\n')[0]);
  });
  stream.once('error', reject);
});

test('SIGTERM to the launcher shuts down the serving descendant', { timeout: 15_000 }, async () => {
  const port = await availablePort();
  const child = spawn(process.execPath, [launcher, 'serve', '--root', fixture, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const origin = await firstLine(child.stdout);
  assert.equal((await fetch(origin)).status, 200);
  child.kill('SIGTERM');
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  assert.equal(exit.signal, null);
  assert.equal(exit.code, 143);
  await assert.rejects(fetch(origin));
});

const waitUntil = async (predicate, timeoutMs = 5_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
};

test('SIGTERM during capture removes staging evidence and the temporary profile', {
  skip: !localBrowser,
  timeout: 20_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-signal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Hang</title><script>while (true) {}</script>', 'utf8');
  const profilesBefore = new Set((await readdir(tmpdir())).filter((name) => name.startsWith('browser-capture-chrome-')));
  const child = spawn(process.execPath, [launcher, 'capture', '--root', root, '--timeout', '12000', '--viewport', 'desktop:800:600'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const output = join(root, '.browser-capture', 'evidence');
  await waitUntil(async () => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`capture exited before staging: ${stderr}`);
    try {
      return (await readdir(output)).some((name) => name.endsWith('.staging'));
    } catch {
      return false;
    }
  }, 10_000);
  child.kill('SIGTERM');
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  assert.equal(exit.signal, null);
  assert.equal(exit.code, 143);
  assert.deepEqual(await readdir(output), []);
  const profilesAfter = (await readdir(tmpdir())).filter((name) => name.startsWith('browser-capture-chrome-'));
  assert.deepEqual(profilesAfter.filter((name) => !profilesBefore.has(name)), []);
});

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
