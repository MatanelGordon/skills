import { isAbsolute } from 'node:path';

export const SCHEMA_VERSION = 1;
export const PRODUCER = 'browser-capture';
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 120_000;
export const MAX_VIEWPORTS = 8;
export const MOBILE_MAX_WIDTH = 599;

export const DEFAULT_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 1000 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
]);

const viewportName = /^[a-z0-9-]+$/i;

export const validateTimeout = (value) => {
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new TypeError(`Timeout must be an integer from ${MIN_TIMEOUT_MS} through ${MAX_TIMEOUT_MS} milliseconds.`);
  }
  return value;
};

export const validateViewport = (viewport) => {
  if (!viewport || typeof viewport !== 'object' || Array.isArray(viewport)) {
    throw new TypeError('Viewport must be an object.');
  }
  const { name, width, height } = viewport;
  if (typeof name !== 'string' || !viewportName.test(name)) {
    throw new TypeError('Viewport name must contain only letters, numbers, and hyphens.');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 240 || height < 240 || width > 4096 || height > 4096) {
    throw new TypeError('Viewport dimensions must be integers between 240 and 4096.');
  }
  return Object.freeze({ name, width, height });
};

export const normalizeViewports = (viewports = DEFAULT_VIEWPORTS) => {
  if (!Array.isArray(viewports) || viewports.length === 0 || viewports.length > MAX_VIEWPORTS) {
    throw new TypeError(`Capture requires between 1 and ${MAX_VIEWPORTS} viewports.`);
  }
  const normalized = viewports.map(validateViewport);
  const names = new Set(normalized.map(({ name }) => name));
  if (names.size !== normalized.length) throw new TypeError('Viewport names must be unique.');
  return Object.freeze(normalized);
};

export const parseViewportSpec = (value) => {
  if (typeof value !== 'string') throw new TypeError('Viewport must use name:width:height.');
  const parts = value.split(':');
  if (parts.length !== 3) throw new TypeError('Viewport must use name:width:height.');
  return validateViewport({
    name: parts[0],
    width: Number(parts[1]),
    height: Number(parts[2]),
  });
};

export const validateBrowserPath = (value) => {
  if (value === '') return '';
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('Browser path must be absolute.');
  }
  return value;
};

export const buildChromeSecurityArgs = (origin, proxyOrigin) => {
  const target = new URL(origin);
  const proxy = new URL(proxyOrigin);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') {
    throw new TypeError('Capture origin must use 127.0.0.1 over HTTP.');
  }
  if (proxy.protocol !== 'http:' || proxy.hostname !== '127.0.0.1' || !proxy.port) {
    throw new TypeError('Capture deny proxy must use a loopback HTTP origin with an explicit port.');
  }
  return Object.freeze([
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-features=OptimizationHints,MediaRouter,InterestFeedContentSuggestions,PrivacySandboxSettings4',
    '--disable-gpu',
    '--disable-sync',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--metrics-recording-only',
    '--no-first-run',
    '--safebrowsing-disable-auto-update',
    `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${target.hostname}`,
    `--proxy-server=${proxy.origin}`,
    `--proxy-bypass-list=<-loopback>;${target.host}`,
  ]);
};

export const combineCaptureErrors = (primaryError, cleanupError) => {
  if (primaryError && cleanupError) {
    return new AggregateError([primaryError, cleanupError], 'Browser capture and cleanup both failed.');
  }
  return primaryError || cleanupError || null;
};
