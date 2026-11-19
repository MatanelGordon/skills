import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';

import { isPathContained, resolveWithin } from './filesystem.mjs';

const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

const sendText = (response, status, message) => {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${message}\n`);
};

const isPrivatePath = (path) => path.split(/[\\/]/)
  .filter(Boolean)
  .some((segment) => segment.startsWith('.') || segment === 'node_modules');

const resolveRequest = async (root, requestUrl) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch {
    return { ok: false, status: 400, error: 'Malformed request path.' };
  }
  if (pathname.includes('\0')) return { ok: false, status: 400, error: 'Malformed request path.' };
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (isPrivatePath(relativePath)) return { ok: false, status: 403, error: 'Private paths are not served.' };
  const lexical = resolveWithin(root, relativePath);
  if (!lexical.ok) return { ok: false, status: 403, error: lexical.error };
  let candidate = lexical.value;
  try {
    const metadata = await stat(candidate);
    if (metadata.isDirectory()) candidate = resolve(candidate, 'index.html');
    const physical = await realpath(candidate);
    if (!isPathContained(root, physical)) return { ok: false, status: 403, error: 'Path escapes the preview root.' };
    if (isPrivatePath(relative(root, physical))) return { ok: false, status: 403, error: 'Private paths are not served.' };
    if (!(await stat(physical)).isFile()) return { ok: false, status: 404, error: 'Not found.' };
    return { ok: true, value: physical };
  } catch {
    return { ok: false, status: 404, error: 'Not found.' };
  }
};

export const createStaticServer = async ({ root = '.', port = 0, onServed = () => {} } = {}) => {
  if (typeof onServed !== 'function') throw new TypeError('onServed must be a function.');
  const physicalRoot = await realpath(resolve(root));
  let servedError;
  const server = createServer(async (request, response) => {
    const host = request.headers.host || '';
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(host)) return sendText(response, 403, 'Invalid preview host.');
    if (!['GET', 'HEAD'].includes(request.method || '')) return sendText(response, 405, 'Method not allowed.');
    const target = await resolveRequest(physicalRoot, request.url || '/');
    if (!target.ok) return sendText(response, target.status, target.error);
    response.writeHead(200, {
      'content-type': MIME[extname(target.value).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; font-src 'self' data:; object-src 'self' data: blob:; frame-src 'self' blob:; base-uri 'self'; form-action 'self'",
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(target.value);
    const hash = createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('end', () => {
      try {
        onServed(Object.freeze({ path: relative(physicalRoot, target.value), sha256: hash.digest('hex') }));
      } catch (error) {
        servedError ||= error;
      }
    });
    stream.once('error', () => response.destroy());
    stream.pipe(response);
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Preview server has no TCP address.');
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, reject) => {
      server.close((error) => (error || servedError ? reject(error || servedError) : resolveClose()));
      server.closeIdleConnections?.();
    }),
  });
};
