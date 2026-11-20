import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  captureScreenshots,
  captureViewportWithPuppeteer,
  findBrowser,
} from '../lib/capture.mjs';

const localBrowser = await findBrowser();
if (!localBrowser && process.env.CI) throw new Error('CI requires a supported local Chrome-family browser.');

test('real Puppeteer capture uses the requested CSS viewport and versioned manifest', {
  skip: !localBrowser,
  timeout: 30_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-viewport-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width"><title>Viewport probe</title></head>
    <body><main><h1>Viewport probe</h1><img src="hero.svg" alt=""></main></body></html>`, 'utf8');
  await writeFile(join(root, 'hero.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>', 'utf8');

  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    viewports: [{ name: 'mobile', width: 390, height: 844 }],
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.producer, 'browser-capture');
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.captures[0].cssWidth, 390);
  assert.equal(report.captures[0].cssHeight, 844);
  assert.equal(report.captures[0].blockedRequests.length, 0);
  assert.match(report.browser, /chrome/i);
  assert.match(report.browserVersion, /\d+/);
  assert.match(report.artifactHash, /^[a-f0-9]{64}$/);
  assert.match(report.captures[0].sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.resources.map((resource) => resource.path), ['hero.svg', 'index.html']);
  assert.ok(report.resources.every((resource) => /^[a-f0-9]{64}$/.test(resource.sha256)));
  assert.match(report.generation, /^capture-[a-f0-9-]+$/);
  assert.equal(report.captures[0].path, 'mobile.png');
  assert.equal(report.reportPath, 'capture.json');
  await access(join(root, '.browser-capture', 'evidence', report.generation, report.reportPath));
});

test('capture rejects an output ancestor symlink before creating outside directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-ancestor-'));
  const outside = await mkdtemp(join(tmpdir(), 'browser-capture-outside-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Safe</title>', 'utf8');
  await symlink(outside, join(root, 'escape'));

  await assert.rejects(
    captureScreenshots({ root, outDir: 'escape/created', browserPath: localBrowser || '/missing/chrome' }),
    /symbolic link/i,
  );
  await assert.rejects(access(join(outside, 'created')), /ENOENT/);
});

test('capture blocks requests to a different loopback origin', {
  skip: !localBrowser,
  timeout: 30_000,
}, async (t) => {
  let hits = 0;
  const other = createServer((_request, response) => {
    hits += 1;
    response.writeHead(204);
    response.end();
  });
  await new Promise((resolveListen, reject) => {
    other.once('error', reject);
    other.listen(0, '127.0.0.1', resolveListen);
  });
  t.after(() => new Promise((resolveClose) => other.close(resolveClose)));
  const address = other.address();
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-origin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), `<!doctype html><html><head><title>Origin</title></head>
    <body><img src="http://127.0.0.1:${address.port}/probe" alt="">
    <script>new WebSocket('ws://127.0.0.1:${address.port}/socket')</script></body></html>`, 'utf8');

  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    viewports: [{ name: 'desktop', width: 800, height: 600 }],
  });

  assert.equal(hits, 0);
  assert.equal(report.ok, false);
  assert.equal(report.captures[0].blockedRequests.length, 2);
  assert.ok(report.captures[0].blockedRequests.some((request) => request.endsWith(`:${address.port}/probe`)));
  assert.ok(report.captures[0].blockedRequests.some((request) => request.endsWith(`:${address.port}/socket`)));
  const reportPath = join(root, '.browser-capture', 'evidence', report.generation, report.reportPath);
  await access(reportPath);
  assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).ok, false);
});

test('operational failure never publishes a partial new generation', {
  skip: !localBrowser,
  timeout: 30_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-atomic-'));
  const output = join(root, '.browser-capture', 'evidence');
  const existing = join(output, 'capture-existing');
  await mkdir(existing, { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Atomic</title>', 'utf8');
  await writeFile(join(existing, 'desktop.png'), 'old-desktop', 'utf8');
  await writeFile(join(existing, 'mobile.png'), 'old-mobile', 'utf8');
  await writeFile(join(existing, 'capture.json'), 'old-report', 'utf8');

  let calls = 0;
  await assert.rejects(
    captureScreenshots({
      root,
      browserPath: localBrowser,
      viewports: [
        { name: 'desktop', width: 800, height: 600 },
        { name: 'mobile', width: 390, height: 844 },
      ],
    }, {
      captureViewport: async (input) => {
        calls += 1;
        if (calls === 2) throw new Error('injected second viewport failure');
        return captureViewportWithPuppeteer(input);
      },
    }),
    /injected second viewport failure/i,
  );

  assert.equal(await readFile(join(existing, 'desktop.png'), 'utf8'), 'old-desktop');
  assert.equal(await readFile(join(existing, 'mobile.png'), 'utf8'), 'old-mobile');
  assert.equal(await readFile(join(existing, 'capture.json'), 'utf8'), 'old-report');
  assert.deepEqual(await readdir(output), ['capture-existing']);
});

test('capture rejects missing browser executable without publishing evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-missing-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Missing</title>', 'utf8');
  await assert.rejects(
    captureScreenshots({ root, browserPath: join(root, 'missing-chrome') }),
    /browser|executable/i,
  );
  await assert.rejects(access(join(root, '.browser-capture')), /ENOENT/);
});
