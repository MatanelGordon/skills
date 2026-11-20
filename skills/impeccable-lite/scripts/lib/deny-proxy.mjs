import { createServer } from 'node:http';

const MAX_REQUEST_BODY_BYTES = 1_024;

const absoluteRequestUrl = (request, scheme = 'http:') => {
  try {
    if (/^https?:\/\//i.test(request.url || '')) return new URL(request.url).href;
    const host = request.headers.host;
    return host ? new URL(request.url || '/', `${scheme}//${host}`).href : `${scheme}//unknown/`;
  } catch {
    return `${scheme}//invalid/`;
  }
};

export const createDenyProxy = async ({ onBlocked = () => {} } = {}) => {
  if (typeof onBlocked !== 'function') throw new TypeError('onBlocked must be a function.');
  let policyError;
  const record = (attempt) => {
    try {
      onBlocked(Object.freeze(attempt));
    } catch (error) {
      policyError ||= error;
    }
  };
  const server = createServer((request, response) => {
    request.on('error', () => {});
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) request.destroy();
    });
    record({
      method: request.method || 'GET',
      transport: request.headers.upgrade?.toLowerCase() === 'websocket' ? 'websocket' : 'http',
      url: absoluteRequestUrl(request, request.headers.upgrade ? 'ws:' : 'http:'),
    });
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
    response.end('Blocked by browser-capture.\n');
  });
  server.on('connect', (request, socket) => {
    socket.on('error', () => {});
    record({ method: 'CONNECT', transport: 'tunnel', url: `https://${request.url || 'unknown'}/` });
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
  });
  server.on('upgrade', (request, socket) => {
    socket.on('error', () => {});
    record({ method: 'GET', transport: 'websocket', url: absoluteRequestUrl(request, 'ws:') });
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Deny proxy has no TCP address.');
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => server.closeAllConnections?.(), 250);
      server.close((error) => {
        clearTimeout(timer);
        if (error || policyError) reject(error || policyError);
        else resolve();
      });
      server.closeIdleConnections?.();
    }),
  });
};
