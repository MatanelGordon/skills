import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { captureViewportWithPuppeteer, findBrowser } from '../lib/capture.mjs';
import { createStaticServer } from '../lib/static-server.mjs';

const localBrowser = await findBrowser();
if (!localBrowser && process.env.CI) throw new Error('CI requires a supported local Chrome-family browser.');
const requireBrowser = !localBrowser && process.env.CI ? 'CI requires a supported local Chrome-family browser' : !localBrowser;

const fakeProxy = async () => Object.freeze({
  origin: 'http://127.0.0.1:9',
  close: async () => {},
});

const runProbe = async (t, { html, interceptRequests }) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-negative-'));
  const profile = await mkdtemp(join(tmpdir(), 'browser-capture-negative-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(profile, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), html, 'utf8');
  const preview = await createStaticServer({ root });
  t.after(() => preview.close());
  return captureViewportWithPuppeteer({
    browserPath: localBrowser,
    profile,
    url: `${preview.origin}/index.html`,
    width: 800,
    height: 600,
    timeoutMs: 10_000,
  }, {
    proxyFactory: fakeProxy,
    securityArgsBuilder: () => [],
    interceptRequests,
  });
};

test('negative control proves request interception blocks a main-page escape', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  let hits = 0;
  const listener = createServer((_request, response) => {
    hits += 1;
    response.end();
  });
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  const target = `http://127.0.0.1:${listener.address().port}/probe`;
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><title>Interception</title><script>fetch('${target}').catch(() => {})</script>`;

  const protectedResult = await runProbe(t, { html, interceptRequests: true });
  assert.equal(hits, 0);
  assert.equal(protectedResult.enforcement.requestInterception, true);
  assert.ok(protectedResult.blockedRequests.includes(target));

  const unprotectedResult = await runProbe(t, { html, interceptRequests: false });
  assert.ok(hits > 0, 'negative control did not escape when interception was disabled');
  assert.equal(unprotectedResult.enforcement.requestInterception, false);
});

test('negative control proves prerender containment depends on the security proxy flags', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  let hits = 0;
  const listener = createServer((_request, response) => {
    hits += 1;
    response.end();
  });
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  const target = `http://127.0.0.1:${listener.address().port}/prerender`;
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><title>Flags</title><link rel="prerender" href="${target}"><script type="speculationrules">{"prerender":[{"source":"list","urls":["${target}"]}]}</script>`;
  await runProbe(t, { html, interceptRequests: true });
  assert.ok(hits > 0, 'negative control did not escape when the deny proxy flags were removed');
});
