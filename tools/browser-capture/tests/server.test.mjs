import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
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
  assert.equal((await fetch(`${preview.origin}/.env`)).status, 403);
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
