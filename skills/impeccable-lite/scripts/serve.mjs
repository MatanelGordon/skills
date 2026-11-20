#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPathContained, resolveWithin } from './lib/core.mjs';

const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
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

// Network directives permit attempts so the process-owned deny proxy can record
// them outside page-controlled memory; the proxy and exact-origin interception
// remain the enforcing boundary.
const CONTENT_SECURITY_POLICY = "default-src 'self' data: blob: http: https:; connect-src 'self' data: blob: http: https: ws: wss:; img-src 'self' data: blob: http: https:; style-src 'self' 'unsafe-inline' http: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' http: https:; worker-src 'self' blob:; font-src 'self' data: http: https:; object-src 'none'; frame-src 'self' blob: http: https:; base-uri 'self'; form-action 'self'";
const RESPONSE_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
});

const sendText = (response, status, message) => {
  response.writeHead(status, {
    ...RESPONSE_HEADERS,
    'content-type': 'text/plain; charset=utf-8',
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
  if (isPrivatePath(relativePath)) {
    return { ok: false, status: 403, error: 'Private paths are not served.' };
  }
  const lexical = resolveWithin(root, relativePath);
  if (!lexical.ok) return { ok: false, status: 403, error: lexical.error };

  let candidate = lexical.value;
  try {
    const metadata = await stat(candidate);
    if (metadata.isDirectory()) {
      if (!pathname.endsWith('/')) {
        return { ok: false, status: 308, error: 'Directory URL requires a trailing slash.', location: `${pathname}/` };
      }
      candidate = resolve(candidate, 'index.html');
    }
    const physical = await realpath(candidate);
    if (!isPathContained(root, physical)) {
      return { ok: false, status: 403, error: 'Path escapes the preview root.' };
    }
    if (isPrivatePath(relative(root, physical))) {
      return { ok: false, status: 403, error: 'Private paths are not served.' };
    }
    const physicalMetadata = await stat(physical);
    if (!physicalMetadata.isFile()) return { ok: false, status: 404, error: 'Not found.' };
    return { ok: true, value: physical };
  } catch {
    return { ok: false, status: 404, error: 'Not found.' };
  }
};

export const createStaticServer = async ({ root = '.', port = 0, onServed = () => {}, onFailed = () => {} } = {}) => {
  if (typeof onServed !== 'function') throw new TypeError('onServed must be a function.');
  if (typeof onFailed !== 'function') throw new TypeError('onFailed must be a function.');
  const physicalRoot = await realpath(resolve(root));
  let servedError;
  const server = createServer(async (request, response) => {
    const host = request.headers.host || '';
    const failRequest = (status, message) => {
      try {
        onFailed(Object.freeze({ path: request.url || '/', status }));
      } catch (error) {
        servedError ||= error;
      }
      sendText(response, status, message);
    };
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(host)) {
      failRequest(403, 'Invalid preview host.');
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      failRequest(405, 'Method not allowed.');
      return;
    }

    const target = await resolveRequest(physicalRoot, request.url || '/');
    if (!target.ok) {
      if (target.location) {
        response.writeHead(target.status, { ...RESPONSE_HEADERS, location: target.location });
        response.end();
      } else {
        failRequest(target.status, target.error);
      }
      return;
    }

    response.writeHead(200, {
      'content-type': MIME[extname(target.value).toLowerCase()] || 'application/octet-stream',
      ...RESPONSE_HEADERS,
    });
    if (request.method === 'HEAD') response.end();
    else {
      const stream = createReadStream(target.value);
      const hash = createHash('sha256');
      stream.on('data', (chunk) => hash.update(chunk));
      stream.once('end', () => {
        try {
          onServed(Object.freeze({
            path: relative(physicalRoot, target.value),
            sha256: hash.digest('hex'),
          }));
        } catch (error) {
          servedError ||= error;
        }
      });
      stream.once('error', (error) => {
        servedError ||= error;
        response.destroy(error);
      });
      stream.pipe(response);
    }
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
      const forceTimer = setTimeout(() => server.closeAllConnections?.(), 250);
      server.close((error) => {
        clearTimeout(forceTimer);
        if (error || servedError) reject(error || servedError);
        else resolveClose();
      });
      server.closeIdleConnections?.();
    }),
  });
};

const runCli = async () => {
  const root = process.argv[2] || '.';
  const port = Number(process.env.IMPECCABLE_LITE_PORT || 4173);
  const preview = await createStaticServer({ root, port });
  process.stdout.write(`${preview.origin}\n`);
  const stop = async () => {
    await preview.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`impeccable-lite serve: ${error.message}\n`);
    process.exitCode = 1;
  });
}
