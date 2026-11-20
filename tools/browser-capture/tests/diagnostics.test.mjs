import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { captureScreenshots, findBrowser } from '../lib/capture.mjs';

const localBrowser = await findBrowser();
if (!localBrowser && process.env.CI) throw new Error('CI requires a supported local Chrome-family browser.');
const requireBrowser = !localBrowser && process.env.CI ? 'CI requires a supported local Chrome-family browser' : !localBrowser;

const capturePage = async (t, html, viewport = { name: 'mobile', width: 390, height: 844 }) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-diagnostic-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), html, 'utf8');
  const report = await captureScreenshots({ root, browserPath: localBrowser, viewports: [viewport] });
  return { root, report, capture: report.captures[0] };
};

test('missing mobile viewport metadata publishes a named diagnostic generation', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  const { report, capture } = await capturePage(t, '<!doctype html><title>No viewport</title><h1>Hello</h1>');
  assert.equal(report.ok, false);
  assert.equal(capture.viewportMismatch, true);
  assert.ok(capture.diagnostics.some((message) => /viewport meta/i.test(message)));
  assert.equal(capture.width, 390);
  assert.equal(capture.height, 844);
});

test('slight mobile overflow is diagnostic instead of an argument failure', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  const { report, capture } = await capturePage(t, `<!doctype html>
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>Wide</title>
    <div style="width:400px;height:20px"></div>`);
  assert.equal(report.ok, false);
  assert.equal(capture.viewportMismatch, true);
  assert.equal(capture.overflow, false);
  assert.ok(capture.diagnostics.some((message) => /fixed-width content/i.test(message)));
});

test('same-origin load failures are reported and evidence paths are relocatable', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  const { report, capture } = await capturePage(t, `<!doctype html>
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>Missing CSS</title>
    <link rel="stylesheet" href="missing.css"><h1>Unstyled</h1>`, { name: 'desktop', width: 800, height: 600 });
  assert.equal(report.ok, false);
  assert.deepEqual(capture.failedRequests.map(({ status }) => status), [404]);
  assert.equal(report.reportPath, 'capture.json');
  assert.equal(capture.path, 'desktop.png');
  assert.equal(report.colorScheme, 'light');
});

test('stale staging directories are reaped before a new generation', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-stale-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), '<!doctype html><meta name="viewport" content="width=device-width"><title>Stale</title>', 'utf8');
  const output = join(root, '.browser-capture', 'evidence');
  await mkdir(join(output, '.capture-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.staging'), { recursive: true });
  await writeFile(join(output, '.capture-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.staging', 'partial'), 'partial', 'utf8');
  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    viewports: [{ name: 'desktop', width: 800, height: 600 }],
  });
  assert.deepEqual(await readdir(output), [report.generation]);
});

test('dialogs are dismissed and same-origin meta refresh is diagnostic', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-navigation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'other.html'), '<!doctype html><meta name="viewport" content="width=device-width"><title>Other</title>', 'utf8');
  await writeFile(join(root, 'index.html'), `<!doctype html>
    <meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="0;url=/other.html">
    <title>Entry</title><script>alert('dismiss me')</script>`, 'utf8');
  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    viewports: [{ name: 'desktop', width: 800, height: 600 }],
  });
  assert.equal(report.ok, false);
  assert.ok(report.captures[0].failedRequests.some(({ error }) => /unexpected navigation/i.test(error || '')));
});
