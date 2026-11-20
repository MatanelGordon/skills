import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { captureScreenshots, findBrowser } from '../lib/capture.mjs';

const localBrowser = await findBrowser();
if (!localBrowser && process.env.CI) throw new Error('CI requires a supported local Chrome-family browser.');
const requireBrowser = !localBrowser && process.env.CI ? 'CI requires a supported local Chrome-family browser' : !localBrowser;

const listen = (server, ...args) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(...args, () => {
    server.off('error', reject);
    resolve();
  });
});

const close = (server) => new Promise((resolve) => server.close(resolve));

const lanAddress = () => Object.values(networkInterfaces())
  .flat()
  .find((address) => address?.family === 'IPv4' && !address.internal)?.address || '127.0.0.1';

test('all page-controlled HTTP, WebSocket, worker, popup, prerender, and WebRTC paths stay contained', {
  skip: requireBrowser,
  timeout: 45_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-containment-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const networkHits = [];
  const other = createServer((request, response) => {
    networkHits.push(`${request.method} ${request.url}`);
    response.writeHead(204);
    response.end();
  });
  other.on('upgrade', (request, socket) => {
    networkHits.push(`WS ${request.url}`);
    socket.destroy();
  });
  await listen(other, 0, '0.0.0.0');
  t.after(() => close(other));
  const networkPort = other.address().port;

  const udpHits = [];
  const udp = createSocket('udp4');
  udp.on('message', (message) => udpHits.push(message.length));
  await new Promise((resolve, reject) => {
    udp.once('error', reject);
    udp.bind(0, '0.0.0.0', resolve);
  });
  t.after(() => udp.close());
  const udpPort = udp.address().port;
  const base = `http://127.0.0.1:${networkPort}`;

  await writeFile(join(root, 'worker.js'), `
    setTimeout(() => {
      fetch('${base}/dedicated-worker', { method: 'POST' }).catch(() => {});
      new WebSocket('ws://127.0.0.1:${networkPort}/dedicated-worker-socket');
    }, 100);
  `, 'utf8');
  await writeFile(join(root, 'shared.js'), `
    onconnect = () => setTimeout(() => fetch('${base}/shared-worker', { method: 'POST' }).catch(() => {}), 100);
  `, 'utf8');
  await writeFile(join(root, 'service.js'), `
    addEventListener('install', (event) => event.waitUntil(new Promise((resolve) => setTimeout(resolve, 100)).then(() => fetch('${base}/service-worker')).catch(() => {})));
  `, 'utf8');
  await writeFile(join(root, 'index.html'), `<!doctype html>
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>Containment</title>
    <link rel="prerender" href="${base}/link-prerender">
    <script type="speculationrules">{"prerender":[{"source":"list","urls":["${base}/speculation-prerender"]}],"prefetch":[{"source":"list","urls":["${base}/speculation-prefetch"]}]}</script>
    <iframe id="error-frame" src="/missing-frame"></iframe>
    <script>
      fetch('${base}/main-fetch').catch(() => {});
      window.open('${base}/popup', '_blank', 'popup,width=200,height=200');
      new Worker('/worker.js');
      new SharedWorker('/shared.js');
      navigator.serviceWorker.register('/service.js').catch(() => {});
      const frame = document.querySelector('#error-frame');
      frame.addEventListener('load', () => {
        try { frame.contentWindow.eval("new WebSocket('ws://127.0.0.1:${networkPort}/error-frame-socket')"); } catch {}
      });
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:${lanAddress()}:${udpPort}' }] });
      pc.createDataChannel('x');
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => {});
    </script>`, 'utf8');

  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    timeoutMs: 15_000,
    viewports: [{ name: 'desktop', width: 800, height: 600 }],
  });

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(networkHits, [], `network escaped containment: ${networkHits.join(', ')}`);
  assert.deepEqual(udpHits, [], `WebRTC escaped containment: ${udpHits.join(', ')}`);
  assert.equal(report.ok, false);
  const blocked = report.captures[0].blockedRequests.join('\n');
  for (const path of [
    'main-fetch',
    'popup',
    'link-prerender',
    'speculation-prerender',
    'speculation-prefetch',
    'dedicated-worker',
    'dedicated-worker-socket',
    'shared-worker',
    'service-worker',
    'error-frame-socket',
  ]) assert.match(blocked, new RegExp(path), `missing attempted activity: ${path}\n${blocked}`);
});

test('page code cannot erase blocked-request evidence and local evaluation is not network', {
  skip: requireBrowser,
  timeout: 30_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const other = createServer((_request, response) => response.end());
  await listen(other, 0, '127.0.0.1');
  t.after(() => close(other));
  const port = other.address().port;
  await writeFile(join(root, 'index.html'), `<!doctype html>
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>Evidence</title>
    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
    <div style="width:900px;height:1px"></div>
    <script>
      Object.defineProperty(window, '__browserCapturePolicyBlocks', { get() { return []; }, set() {} });
      addEventListener('securitypolicyviolation', (event) => event.stopImmediatePropagation(), true);
      try { Object.defineProperty(document.documentElement, 'scrollWidth', { get() { return 1; } }); } catch {}
      try { eval('1 + 1'); } catch {}
      fetch('data:text/plain,local').catch(() => {});
      fetch('http://127.0.0.1:${port}/cannot-erase').catch(() => {});
    </script>`, 'utf8');
  const report = await captureScreenshots({
    root,
    browserPath: localBrowser,
    viewports: [{ name: 'desktop', width: 800, height: 600 }],
  });
  assert.deepEqual(report.captures[0].blockedRequests, [`http://127.0.0.1:${port}/cannot-erase`]);
  assert.equal(report.captures[0].overflow, true);
});
