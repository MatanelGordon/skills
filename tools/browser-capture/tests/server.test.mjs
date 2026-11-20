import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createStaticServer } from '../lib/static-server.mjs';

test('general preview is loopback-only and refuses private or escaped files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-server-'));
  const outside = await mkdtemp(join(tmpdir(), 'browser-capture-server-outside-'));
  const html = '<!doctype html><title>Local</title><h1>Local only</h1>';
  await writeFile(join(root, 'index.html'), html, 'utf8');
  await writeFile(join(root, '.env'), 'TOKEN=secret', 'utf8');
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'node_modules', 'private.js'), 'private', 'utf8');
  await writeFile(join(outside, 'secret.txt'), 'secret', 'utf8');
  await symlink(join(outside, 'secret.txt'), join(root, 'escape.txt'));
  await symlink(join(root, '.env'), join(root, 'public-env.txt'));
  await symlink(join(root, 'node_modules', 'private.js'), join(root, 'public-module.js'));
  const served = [];
  const preview = await createStaticServer({ root, port: 0, onServed: (item) => served.push(item) });
  t.after(() => preview.close());

  assert.match(preview.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const page = await fetch(`${preview.origin}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') || '', /connect-src 'self'/);
  assert.match(await page.text(), /Local only/);
  assert.deepEqual(served, [{
    path: 'index.html',
    sha256: createHash('sha256').update(html).digest('hex'),
  }]);

  assert.ok([400, 403, 404].includes((await fetch(`${preview.origin}/%2e%2e%2fsecret.txt`)).status));
  const privateResponse = await fetch(`${preview.origin}/.env`);
  assert.equal(privateResponse.status, 403);
  assert.match(privateResponse.headers.get('content-security-policy') || '', /connect-src 'self'/);
  assert.equal((await fetch(`${preview.origin}/escape.txt`)).status, 403);
  assert.equal((await fetch(`${preview.origin}/public-env.txt`)).status, 403);
  assert.equal((await fetch(`${preview.origin}/public-module.js`)).status, 403);

  const target = new URL(preview.origin);
  const badHostStatus = await new Promise((resolveStatus, reject) => {
    const req = request({
      host: target.hostname,
      port: target.port,
      path: '/',
      headers: { host: 'attacker.example' },
    }, (response) => {
      response.resume();
      response.once('end', () => resolveStatus(response.statusCode));
    });
    req.once('error', reject);
    req.end();
  });
  assert.equal(badHostStatus, 403);
});

test('preview redirects directory URLs and serves HTML extension variants', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-server-routing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'sub'));
  await writeFile(join(root, 'sub', 'index.html'), '<!doctype html><title>Sub</title>', 'utf8');
  await writeFile(join(root, 'page.htm'), '<!doctype html><title>HTM</title>', 'utf8');
  const preview = await createStaticServer({ root });
  t.after(() => preview.close());

  const directory = await fetch(`${preview.origin}/sub`, { redirect: 'manual' });
  assert.equal(directory.status, 308);
  assert.equal(directory.headers.get('location'), '/sub/');
  assert.match(directory.headers.get('content-security-policy') || '', /connect-src 'self'/);
  const html = await fetch(`${preview.origin}/page.htm`);
  assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal((await fetch(`${preview.origin}/index.html/`)).status, 404);
});

test('preview shutdown is bounded when a client leaves a request unfinished', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'browser-capture-server-close-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Close</title>', 'utf8');
  const preview = await createStaticServer({ root });
  const target = new URL(preview.origin);
  const socket = createConnection({ host: target.hostname, port: Number(target.port) });
  t.after(() => socket.destroy());
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n');
  await Promise.race([
    preview.close(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('preview close was unbounded')), 1_500)),
  ]);
});
