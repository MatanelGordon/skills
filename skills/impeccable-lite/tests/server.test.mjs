import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../scripts/serve.mjs';

test('static server binds to loopback and serves only files within its root', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-server-'));
  const outside = await mkdtemp(join(tmpdir(), 'impeccable-lite-outside-'));
  await writeFile(join(root, 'index.html'), '<h1>Local only</h1>', 'utf8');
  await writeFile(join(root, '.env'), 'TOKEN=secret', 'utf8');
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'node_modules', 'private.js'), 'private', 'utf8');
  await writeFile(join(outside, 'secret.txt'), 'secret', 'utf8');
  await symlink(join(outside, 'secret.txt'), join(root, 'escape.txt'));
  await symlink(join(root, '.env'), join(root, 'public-env.txt'));
  await symlink(join(root, 'node_modules', 'private.js'), join(root, 'public-module.js'));
  const preview = await createStaticServer({ root, port: 0 });
  t.after(() => preview.close());

  assert.match(preview.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const page = await fetch(`${preview.origin}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') || '', /connect-src 'self'/);
  assert.match(page.headers.get('content-security-policy') || '', /worker-src 'self' blob:/);
  assert.match(page.headers.get('content-security-policy') || '', /object-src 'self' data: blob:/);
  assert.match(page.headers.get('content-security-policy') || '', /frame-src 'self' blob:/);
  assert.match(page.headers.get('content-security-policy') || '', /base-uri 'self'/);
  assert.match(await page.text(), /Local only/);

  const traversal = await fetch(`${preview.origin}/%2e%2e%2fsecret.txt`);
  assert.ok([400, 403, 404].includes(traversal.status));

  const dotfile = await fetch(`${preview.origin}/.env`);
  assert.equal(dotfile.status, 403);
  const symlinkEscape = await fetch(`${preview.origin}/escape.txt`);
  assert.equal(symlinkEscape.status, 403);
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

test('serve CLI starts when the skill is installed as a symlink', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'impeccable-lite-serve-cli-'));
  await writeFile(join(root, 'index.html'), '<h1>Local only</h1>', 'utf8');
  const linkedSkill = join(await mkdtemp(join(tmpdir(), 'impeccable-lite-serve-symlink-')), 'impeccable-lite');
  await symlink(dirname(dirname(fileURLToPath(import.meta.url))), linkedSkill, process.platform === 'win32' ? 'junction' : 'dir');

  const child = spawn(process.execPath, [join(linkedSkill, 'scripts', 'serve.mjs'), root], {
    env: { ...process.env, IMPECCABLE_LITE_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolveClose) => child.once('close', resolveClose));
  t.after(async () => {
    child.kill();
    await closed;
  });

  const origin = await new Promise((resolveOrigin, reject) => {
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) resolveOrigin(output.trim());
    });
    child.once('error', reject);
    closed.then((status) => reject(new Error(`serve exited with status ${status} before printing its origin`)));
  });
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
});
