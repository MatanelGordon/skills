import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  buildChromeArgs,
  captureScreenshots,
  combineCaptureErrors,
  findBrowser,
} from '../scripts/capture.mjs';

test('Chrome capture is pinned to loopback and blocks external networking', () => {
  const args = buildChromeArgs({
    url: 'http://127.0.0.1:8123/index.html',
    profile: resolve('/tmp/impeccable-lite-profile'),
    width: 1440,
    height: 1000,
  });

  assert.ok(args.includes('--disable-background-networking'));
  assert.ok(args.some((arg) => arg.startsWith('--host-resolver-rules=')));
  assert.ok(args.some((arg) => arg.startsWith('--proxy-server=')));
  assert.ok(args.includes('--proxy-bypass-list=127.0.0.1:8123'));
  assert.ok(args.includes('--remote-debugging-pipe'));
  assert.equal(args.at(-1), 'about:blank');

  assert.throws(
    () => buildChromeArgs({
      url: 'https://example.test',
      profile: '/tmp/profile',
      width: 390,
      height: 844,
    }),
    /loopback/i,
  );
});

test('capture preserves both rendering and cleanup failures', () => {
  const rendering = new Error('render failed');
  const cleanup = new Error('cleanup failed');
  const combined = combineCaptureErrors(rendering, cleanup);

  assert.ok(combined instanceof AggregateError);
  assert.deepEqual(combined.errors, [rendering, cleanup]);
  assert.equal(combineCaptureErrors(rendering, null), rendering);
  assert.equal(combineCaptureErrors(null, cleanup), cleanup);
});

const localBrowser = await findBrowser();

test('real Chrome capture uses the requested CSS viewport, not a cropped desktop viewport', {
  skip: !localBrowser,
  timeout: 30_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-capture-'));
  await writeFile(join(root, 'index.html'), `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width"><title>Viewport probe</title></head>
    <body><main><h1>Viewport probe</h1><img src="hero.svg" alt=""></main></body></html>`, 'utf8');
  await writeFile(join(root, 'hero.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>', 'utf8');

  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    viewports: [{ name: 'mobile', width: 390, height: 844 }],
  });

  assert.equal(report.ok, true);
  assert.equal(report.captures[0].cssWidth, 390);
  assert.equal(report.captures[0].cssHeight, 844);
  assert.equal(report.captures[0].blockedRequests.length, 0);
  assert.match(report.artifactHash, /^[a-f0-9]{64}$/);
  assert.match(report.captures[0].sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.resources.map((resource) => resource.path), ['hero.svg', 'index.html']);
  assert.ok(report.resources.every((resource) => /^[a-f0-9]{64}$/.test(resource.sha256)));
  assert.match(report.generation, /^capture-[a-f0-9-]+$/);
  assert.match(report.captures[0].path, new RegExp(`${report.generation}/mobile\\.png$`));
  assert.match(report.reportPath, new RegExp(`${report.generation}/capture\\.json$`));
});

test('capture rejects an output ancestor symlink before creating outside directories', {
  skip: !localBrowser,
  timeout: 30_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-capture-ancestor-'));
  const outside = await mkdtemp(join(tmpdir(), 'impeccable-lite-capture-outside-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Safe</title>', 'utf8');
  await symlink(outside, join(root, 'escape'));

  await assert.rejects(
    captureScreenshots({ root, outDir: 'escape/created', browserPath: localBrowser }),
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
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-capture-origin-'));
  await writeFile(join(root, 'index.html'), `<!doctype html><html><head><title>Origin</title></head>
    <body><img src="http://127.0.0.1:${address.port}/probe" alt=""></body></html>`, 'utf8');

  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    viewports: [{ name: 'desktop', width: 800, height: 600 }],
  });

  assert.equal(hits, 0);
  assert.equal(report.ok, false);
  assert.equal(report.captures[0].blockedRequests.length, 1);
  assert.match(report.captures[0].blockedRequests[0], new RegExp(`:${address.port}/probe$`));
  await access(report.reportPath);
  assert.equal(JSON.parse(await readFile(report.reportPath, 'utf8')).ok, false);
});

test('failed capture never mixes a new screenshot into existing evidence', {
  skip: !localBrowser,
  timeout: 30_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-capture-atomic-'));
  const output = join(root, '.impeccable-lite', 'evidence');
  const existing = join(output, 'capture-existing');
  await mkdir(existing, { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Atomic</title>', 'utf8');
  await writeFile(join(existing, 'desktop.png'), 'old-desktop', 'utf8');
  await writeFile(join(existing, 'mobile.png'), 'old-mobile', 'utf8');
  await writeFile(join(existing, 'capture.json'), 'old-report', 'utf8');

  await assert.rejects(
    captureScreenshots({
      root,
      browserPath: localBrowser,
      viewports: [
        { name: 'desktop-new', width: 800, height: 600 },
        { name: 'mobile-bad', width: 390, height: 844 },
      ],
    }),
    /viewport mismatch/i,
  );

  assert.equal(await readFile(join(existing, 'desktop.png'), 'utf8'), 'old-desktop');
  assert.equal(await readFile(join(existing, 'mobile.png'), 'utf8'), 'old-mobile');
  assert.equal(await readFile(join(existing, 'capture.json'), 'utf8'), 'old-report');
  assert.deepEqual(await readdir(output), ['capture-existing']);
});

test('Chrome capture rejects nonsensical viewport sizes', () => {
  assert.throws(
    () => buildChromeArgs({
      url: 'http://127.0.0.1:8123/',
      profile: '/tmp/profile',
      width: 0,
      height: 844,
    }),
    /viewport/i,
  );
});
