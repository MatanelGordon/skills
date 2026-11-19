#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { inspectPng, isPathContained, resolveWithin } from './lib/core.mjs';
import { ensureSafeDirectory } from './lib/filesystem.mjs';
import { createStaticServer } from './serve.mjs';

const DEFAULT_BROWSERS = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]);

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

const validateViewport = (width, height) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || height < 240 || width > 4096 || height > 4096) {
    throw new TypeError('Viewport dimensions must be integers between 240 and 4096.');
  }
};

export const buildChromeArgs = ({ url, profile, width, height }) => {
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') {
    throw new TypeError('Capture URL must use the 127.0.0.1 loopback origin.');
  }
  validateViewport(width, height);
  if (typeof profile !== 'string' || !profile.trim()) throw new TypeError('Profile path is required.');

  return Object.freeze([
    '--headless=new',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-features=OptimizationHints,MediaRouter',
    '--disable-gpu',
    '--disable-sync',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--metrics-recording-only',
    '--no-first-run',
    '--safebrowsing-disable-auto-update',
    `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${target.hostname}`,
    '--proxy-server=http://127.0.0.1:9',
    `--proxy-bypass-list=${target.host}`,
    `--user-data-dir=${resolve(profile)}`,
    '--remote-debugging-pipe',
    'about:blank',
  ]);
};

export const findBrowser = async (preferred = '') => {
  const candidates = preferred ? [resolve(preferred)] : DEFAULT_BROWSERS;
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next fixed local candidate. Never download a browser.
    }
  }
  return null;
};

const createCdpClient = (child, timeoutMs, stderrText) => {
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const eventWaiters = new Map();
  const eventHandlers = new Map();

  const failAll = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
    for (const waiters of eventWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    }
    eventWaiters.clear();
  };

  const dispatch = (message) => {
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(`Chrome protocol ${message.error.code}: ${message.error.message}`));
      else request.resolve(message.result || {});
      return;
    }

    const key = `${message.sessionId || ''}:${message.method || ''}`;
    for (const handler of eventHandlers.get(key) || []) {
      Promise.resolve(handler(message.params || {})).catch(failAll);
    }
    const waiters = eventWaiters.get(key);
    if (!waiters || waiters.length === 0) return;
    eventWaiters.delete(key);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(message.params || {});
    }
  };

  child.stdio[4].on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let boundary = buffer.indexOf(0);
    while (boundary >= 0) {
      const frame = buffer.subarray(0, boundary).toString('utf8');
      buffer = buffer.subarray(boundary + 1);
      if (frame) {
        try {
          dispatch(JSON.parse(frame));
        } catch (error) {
          failAll(new Error(`Chrome returned malformed protocol data: ${error.message}`));
        }
      }
      boundary = buffer.indexOf(0);
    }
  });

  child.once('error', (error) => failAll(error));
  child.once('close', (code, signal) => {
    if (pending.size > 0 || eventWaiters.size > 0) {
      const detail = stderrText().trim();
      failAll(new Error(`Chrome closed during capture (${code ?? signal ?? 'unknown'}).${detail ? ` ${detail}` : ''}`));
    }
  });

  const timeoutError = (label) => new Error(`${label} timed out after ${timeoutMs}ms.`);
  const send = (method, params = {}, sessionId = '') => new Promise((resolveSend, rejectSend) => {
    const id = nextId;
    nextId += 1;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectSend(timeoutError(`Chrome protocol ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
    const message = sessionId ? { id, method, params, sessionId } : { id, method, params };
    child.stdio[3].write(`${JSON.stringify(message)}\0`, 'utf8', (error) => {
      if (!error) return;
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      clearTimeout(timer);
      rejectSend(error);
    });
  });

  const once = (method, sessionId = '') => new Promise((resolveEvent, rejectEvent) => {
    const key = `${sessionId}:${method}`;
    const timer = setTimeout(() => {
      const remaining = (eventWaiters.get(key) || []).filter((waiter) => waiter.resolve !== resolveEvent);
      if (remaining.length > 0) eventWaiters.set(key, remaining);
      else eventWaiters.delete(key);
      rejectEvent(timeoutError(`Chrome event ${method}`));
    }, timeoutMs);
    const waiters = eventWaiters.get(key) || [];
    eventWaiters.set(key, [...waiters, { resolve: resolveEvent, reject: rejectEvent, timer }]);
  });

  const on = (method, sessionId, handler) => {
    const key = `${sessionId}:${method}`;
    const handlers = eventHandlers.get(key) || new Set();
    handlers.add(handler);
    eventHandlers.set(key, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) eventHandlers.delete(key);
    };
  };

  return Object.freeze({ send, once, on, failAll });
};

const waitForExit = (child, timeoutMs) => new Promise((resolveExit) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    resolveExit(true);
    return;
  }
  const onClose = () => {
    clearTimeout(timer);
    resolveExit(true);
  };
  const timer = setTimeout(() => {
    child.off('close', onClose);
    resolveExit(false);
  }, timeoutMs);
  child.once('close', onClose);
});

const stopChrome = async (child, client) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  client.send('Browser.close').catch(() => {});
  if (await waitForExit(child, 750)) return;
  child.kill('SIGTERM');
  if (await waitForExit(child, 1500)) return;
  child.kill('SIGKILL');
  if (await waitForExit(child, 1500)) return;
  throw new Error('Chrome did not exit after SIGKILL.');
};

export const combineCaptureErrors = (primaryError, cleanupError) => {
  if (primaryError && cleanupError) {
    return new AggregateError([primaryError, cleanupError], 'Chrome capture and cleanup both failed.');
  }
  return primaryError || cleanupError || null;
};

const runChromeCapture = async ({ browser, args, url, width, height, timeoutMs }) => {
  const child = spawn(browser, args, {
    shell: false,
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 16_384) stderr += chunk;
  });
  const client = createCdpClient(child, timeoutMs, () => stderr);
  child.once('error', (error) => client.failAll(error));
  child.once('close', (code, signal) => {
    client.failAll(new Error(`Chrome closed (${code ?? signal ?? 'unknown'}): ${stderr.trim()}`));
  });

  let result;
  let primaryError;
  let cleanupError;
  try {
    await client.send('Browser.getVersion');
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    const allowedOrigin = new URL(url).origin;
    const blockedRequests = new Set();
    const stopObserving = client.on('Network.requestWillBeSent', sessionId, ({ request }) => {
      try {
        const requested = new URL(request.url);
        if (['http:', 'https:'].includes(requested.protocol) && requested.origin !== allowedOrigin) {
          blockedRequests.add(request.url);
        }
      } catch {
        blockedRequests.add(request.url);
      }
    });
    await client.send('Network.enable', {}, sessionId);
    const stopIntercepting = client.on('Fetch.requestPaused', sessionId, async ({ requestId, request }) => {
      let allowed = false;
      try {
        const requested = new URL(request.url);
        allowed = requested.origin === allowedOrigin;
      } catch {
        allowed = false;
      }
      if (allowed) {
        await client.send('Fetch.continueRequest', { requestId }, sessionId);
      } else {
        blockedRequests.add(request.url);
        await client.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
      }
    });
    await client.send('Fetch.enable', {
      patterns: [
        { urlPattern: 'http://*', requestStage: 'Request' },
        { urlPattern: 'https://*', requestStage: 'Request' },
      ],
    }, sessionId);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
      screenWidth: width,
      screenHeight: height,
    }, sessionId);

    const loaded = client.once('Page.loadEventFired', sessionId);
    const navigation = await client.send('Page.navigate', { url }, sessionId);
    if (navigation.errorText) throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
    await loaded;
    await client.send('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    const metrics = await client.send('Runtime.evaluate', {
      expression: '({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth })',
      returnByValue: true,
    }, sessionId);
    const rendered = metrics.result?.value;
    if (!rendered || rendered.width !== width || rendered.height !== height) {
      throw new Error(`Chrome viewport mismatch: requested ${width}x${height}, rendered ${rendered?.width || '?'}x${rendered?.height || '?'}.`);
    }
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    }, sessionId);
    if (!screenshot.data) throw new Error('Chrome returned no screenshot data.');
    await client.send('Target.closeTarget', { targetId });
    stopIntercepting();
    stopObserving();
    result = Object.freeze({
      cssWidth: rendered.width,
      cssHeight: rendered.height,
      scrollWidth: rendered.scrollWidth,
      overflow: rendered.scrollWidth > rendered.width,
      blockedRequests: Object.freeze([...blockedRequests].sort()),
      png: Buffer.from(screenshot.data, 'base64'),
    });
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await stopChrome(child, client);
    } catch (error) {
      cleanupError = error;
    }
    client.failAll(new Error('Chrome capture closed.'));
  }
  const failure = combineCaptureErrors(primaryError, cleanupError);
  if (failure) throw failure;
  return result;
};

const writeExclusive = async (path, content) => {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const assertPng = async (path) => {
  const metadata = await stat(path);
  if (metadata.size < 100) throw new Error(`Capture is unexpectedly small: ${path}`);
  const bytes = await readFile(path);
  const inspected = inspectPng(bytes);
  if (!inspected.ok) throw new Error(`Capture is not a valid PNG: ${path}. ${inspected.error}`);
  return Object.freeze({ ...inspected.value, sha256: sha256(bytes) });
};

const encodeEntry = (entry) => entry.split('/').map(encodeURIComponent).join('/');

export const captureScreenshots = async ({
  root = '.',
  entry = 'index.html',
  outDir = '.impeccable-lite/evidence',
  browserPath = '',
  timeoutMs = 30_000,
  viewports = Object.freeze([
    Object.freeze({ name: 'desktop', width: 1440, height: 1000 }),
    Object.freeze({ name: 'mobile', width: 390, height: 844 }),
  ]),
} = {}) => {
  const physicalRoot = await realpath(resolve(root));
  const target = resolveWithin(physicalRoot, entry);
  if (!target.ok) throw new Error(target.error);
  const physicalTarget = await realpath(target.value);
  if (!isPathContained(physicalRoot, physicalTarget)) throw new Error('Entry escapes the project root.');
  const artifactHash = sha256(await readFile(physicalTarget));

  for (const viewport of viewports) {
    validateViewport(viewport.width, viewport.height);
    if (!/^[a-z0-9-]+$/i.test(viewport.name)) throw new TypeError('Viewport name is invalid.');
  }

  const physicalOutput = await ensureSafeDirectory(physicalRoot, outDir);

  const browser = await findBrowser(browserPath);
  if (!browser) throw new Error('No supported local Chromium browser found; no download was attempted.');

  const generation = `capture-${randomUUID()}`;
  const staging = join(physicalOutput, `.${generation}.staging`);
  const published = join(physicalOutput, generation);

  let preview;
  let temporaryProfileRoot;
  let physicalStaging = staging;
  const captures = [];
  const servedResources = new Map();
  let report;
  let primaryError;
  let resourceError;
  let stagingPending = false;
  let readyToPublish = false;
  try {
    await mkdir(staging, { mode: 0o700 });
    stagingPending = true;
    physicalStaging = await realpath(staging);
    if (!isPathContained(physicalOutput, physicalStaging)) throw new Error('Capture staging directory escapes the output root.');
    preview = await createStaticServer({
      root: physicalRoot,
      port: 0,
      onServed: (resource) => {
        const existingHash = servedResources.get(resource.path);
        if (existingHash && existingHash !== resource.sha256) {
          resourceError ||= new Error(`A served resource changed during capture: ${resource.path}`);
        }
        servedResources.set(resource.path, resource.sha256);
      },
    });
    temporaryProfileRoot = await mkdtemp(join(tmpdir(), 'impeccable-lite-chrome-'));
    for (const viewport of viewports) {
      const stagePath = join(physicalStaging, `${viewport.name}.png`);
      const finalPath = join(published, `${viewport.name}.png`);
      const profile = join(temporaryProfileRoot, viewport.name);
      const url = `${preview.origin}/${encodeEntry(relative(physicalRoot, physicalTarget))}`;
      const args = buildChromeArgs({
        url,
        profile,
        width: viewport.width,
        height: viewport.height,
      });
      const rendered = await runChromeCapture({
        browser,
        args,
        url,
        width: viewport.width,
        height: viewport.height,
        timeoutMs,
      });
      await writeExclusive(stagePath, rendered.png);
      const png = await assertPng(stagePath);
      if (png.width !== viewport.width || png.height !== viewport.height) {
        throw new Error(`PNG dimensions do not match the requested viewport: ${viewport.name}.`);
      }
      const { png: _png, ...captureMetadata } = rendered;
      captures.push(Object.freeze({ ...viewport, ...captureMetadata, sha256: png.sha256, path: finalPath }));
    }
    if (sha256(await readFile(physicalTarget)) !== artifactHash) {
      throw new Error('The artifact changed during capture; no evidence was published.');
    }
    if (resourceError) throw resourceError;
    const resources = [];
    for (const [resourcePath, resourceHash] of [...servedResources.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const resource = resolveWithin(physicalRoot, resourcePath);
      if (!resource.ok) throw new Error(resource.error);
      const physicalResource = await realpath(resource.value);
      if (!isPathContained(physicalRoot, physicalResource) || sha256(await readFile(physicalResource)) !== resourceHash) {
        throw new Error(`A served resource changed during capture: ${resourcePath}`);
      }
      resources.push(Object.freeze({ path: resourcePath, sha256: resourceHash }));
    }
    const artifactResource = resources.find((resource) => resource.path === relative(physicalRoot, physicalTarget));
    if (!artifactResource || artifactResource.sha256 !== artifactHash) {
      throw new Error('The captured artifact was not bound to the served resource set.');
    }
    report = Object.freeze({
      ok: captures.every((capture) => !capture.overflow && capture.blockedRequests.length === 0),
      browser: basename(browser),
      entry: relative(physicalRoot, physicalTarget),
      artifactHash,
      generation,
      reportPath: join(published, 'capture.json'),
      network: 'only the exact preview origin was allowed; all other HTTP(S) requests were blocked',
      resources: Object.freeze(resources),
      captures: Object.freeze(captures),
    });
    await writeExclusive(join(physicalStaging, 'capture.json'), `${JSON.stringify(report, null, 2)}\n`);
    readyToPublish = true;
  } catch (error) {
    primaryError = error;
  }

  const cleanups = [];
  if (preview) cleanups.push(preview.close());
  if (temporaryProfileRoot && basename(temporaryProfileRoot).startsWith('impeccable-lite-chrome-')) {
    cleanups.push(rm(temporaryProfileRoot, { recursive: true, force: true }));
  }
  const cleanupResults = await Promise.allSettled(cleanups);
  const cleanupErrors = cleanupResults.filter((result) => result.status === 'rejected').map((result) => result.reason);

  if (primaryError || cleanupErrors.length > 0 || !readyToPublish) {
    const failureErrors = [primaryError, ...cleanupErrors].filter(Boolean);
    if (stagingPending) {
      try {
        await rm(physicalStaging, { recursive: true, force: true });
        stagingPending = false;
      } catch (error) {
        failureErrors.push(error);
      }
    }
    if (failureErrors.length === 1) throw failureErrors[0];
    throw new AggregateError(failureErrors, 'Capture failed before evidence could be published.');
  }

  try {
    await rename(physicalStaging, published);
    stagingPending = false;
  } catch (error) {
    const publicationErrors = [error];
    if (stagingPending) {
      try {
        await rm(physicalStaging, { recursive: true, force: true });
        stagingPending = false;
      } catch (cleanupError) {
        publicationErrors.push(cleanupError);
      }
    }
    if (publicationErrors.length === 1) throw error;
    throw new AggregateError(publicationErrors, 'Capture evidence publication failed.');
  }
  return report;
};
