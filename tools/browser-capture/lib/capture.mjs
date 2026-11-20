import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

import puppeteer from 'puppeteer-core';

import {
  MOBILE_MAX_WIDTH,
  PRODUCER,
  SCHEMA_VERSION,
  buildChromeSecurityArgs,
  combineCaptureErrors,
  normalizeViewports,
  validateBrowserPath,
  validateTimeout,
} from './contract.mjs';
import { createDenyProxy } from './deny-proxy.mjs';
import {
  assertSafeDirectoryPath,
  ensureSafeDirectory,
  isPathContained,
  readAndInspectPng,
  resolveExistingFile,
  resolveWithin,
  sha256,
  writeExclusive,
} from './filesystem.mjs';
import { createStaticServer } from './static-server.mjs';

const CHANNELS = Object.freeze(['chrome', 'chrome-beta', 'chrome-dev', 'chrome-canary']);
const FIXED_BROWSER_PATHS = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-edge-stable',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]);
const BROWSER_CLOSE_TIMEOUT_MS = 3_000;
const CAPTURE_SETTLE_MS = 400;

const executable = async (candidate) => {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const findBrowser = async (preferred = '') => {
  if (preferred) {
    validateBrowserPath(preferred);
    return await executable(preferred) ? preferred : null;
  }
  for (const channel of CHANNELS) {
    try {
      const candidate = await puppeteer.executablePath(channel);
      if (await executable(candidate)) return candidate;
    } catch {
      // Continue through supported local Chrome-family candidates. Never download.
    }
  }
  for (const candidate of FIXED_BROWSER_PATHS) {
    if (await executable(candidate)) return candidate;
  }
  return null;
};

export const getBrowserVersion = (browserPath) => {
  if (!browserPath) return null;
  const result = spawnSync(browserPath, ['--version'], { encoding: 'utf8', windowsHide: true });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return result.status === 0 && /(Google Chrome|Chromium|Microsoft Edge|Chrome for Testing)/i.test(output)
    ? output
    : null;
};

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const closeBrowser = async (browser) => {
  let timer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Browser close timed out after ${BROWSER_CLOSE_TIMEOUT_MS}ms.`)),
          BROWSER_CLOSE_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    const browserProcess = browser.process();
    if (browserProcess && browserProcess.exitCode === null && browserProcess.signalCode === null) {
      browserProcess.kill('SIGKILL');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const networkUrl = (value, allowedOrigin) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && url.origin !== allowedOrigin
      ? url.href
      : null;
  } catch {
    return null;
  }
};

const writeBrowserPreferences = async (profile) => {
  const defaults = join(profile, 'Default');
  await mkdir(defaults, { recursive: true, mode: 0o700 });
  await writeFile(join(defaults, 'Preferences'), `${JSON.stringify({
    webrtc: { ip_handling_policy: 'disable_non_proxied_udp' },
  })}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
};

const layoutDiagnostics = (requested, layout) => {
  const diagnostics = [];
  const viewportMismatch = layout.width !== requested.width || layout.height !== requested.height;
  if (viewportMismatch) {
    diagnostics.push(`Rendered layout viewport ${layout.width}x${layout.height} differs from requested ${requested.width}x${requested.height}; check the viewport meta tag and fixed-width content.`);
  }
  if (layout.scrollWidth > layout.width) {
    diagnostics.push(`Horizontal overflow: content width ${layout.scrollWidth}px exceeds the ${layout.width}px layout viewport.`);
  }
  return Object.freeze({ diagnostics: Object.freeze(diagnostics), viewportMismatch });
};

export const captureViewportWithPuppeteer = async ({
  browserPath,
  profile,
  url,
  width,
  height,
  timeoutMs,
  signal,
}, {
  proxyFactory = createDenyProxy,
  securityArgsBuilder = buildChromeSecurityArgs,
  interceptRequests = true,
} = {}) => {
  const allowedOrigin = new URL(url).origin;
  const blockedRequests = new Set();
  const failedRequests = new Map();
  const blockedTargets = new Set();
  const targetTasks = new Set();
  const targetSessions = new Set();
  let proxyConnectionCount = 0;
  let browser;
  let proxy;
  let page;
  let rendered;
  let primaryError;
  let interceptionError;
  let signalClosePromise;
  let interceptedRequestCount = 0;
  const cleanupErrors = [];
  const addBlocked = (value) => {
    const normalized = networkUrl(value, allowedOrigin);
    if (normalized) blockedRequests.add(normalized);
  };
  try {
    if (signal?.aborted) throw signal.reason || new Error('Capture interrupted.');
    await writeBrowserPreferences(profile);
    proxy = await proxyFactory({
      onBlocked: ({ transport, url: blocked }) => {
        proxyConnectionCount += 1;
        try {
          if (transport !== 'tunnel' && new URL(blocked).hostname === '127.0.0.1') addBlocked(blocked);
        } catch {
          // CONNECT authority evidence is counted without inventing a URL scheme.
        }
      },
    });
    if (signal?.aborted) throw signal.reason || new Error('Capture interrupted.');
    browser = await puppeteer.launch({
      browser: 'chrome',
      executablePath: browserPath,
      headless: true,
      pipe: true,
      protocolTimeout: timeoutMs,
      timeout: timeoutMs,
      userDataDir: profile,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      args: securityArgsBuilder(allowedOrigin, proxy.origin),
    });
    const stopForSignal = () => {
      signalClosePromise ||= browser?.close();
    };
    if (signal?.aborted) stopForSignal();
    else signal?.addEventListener('abort', stopForSignal, { once: true });
    const pages = await browser.pages();
    page = pages[0] || await browser.newPage();
    const mainTarget = page.target();
    browser.on('targetcreated', (target) => {
      if (target === mainTarget) return;
      const task = (async () => {
        const initialUrl = target.url();
        if (initialUrl && initialUrl !== 'about:blank') addBlocked(initialUrl);
        if (target.type() === 'page') {
          const createdPage = await target.page();
          if (!createdPage) return;
          const createdUrl = createdPage.url();
          if (createdUrl && createdUrl !== 'about:blank') {
            addBlocked(createdUrl);
            blockedTargets.add(createdUrl);
          } else {
            blockedTargets.add('page target');
          }
          await createdPage.close({ runBeforeUnload: false });
          return;
        }
        const session = await target.createCDPSession();
        targetSessions.add(session);
        session.on('Network.requestWillBeSent', ({ request }) => addBlocked(request.url));
        session.on('Network.webSocketCreated', ({ url: socketUrl }) => addBlocked(socketUrl));
        await session.send('Network.enable');
      })().catch((error) => { interceptionError ||= error; });
      targetTasks.add(task);
      task.finally(() => targetTasks.delete(task));
    });
    page.on('dialog', (dialog) => dialog.dismiss().catch((error) => { interceptionError ||= error; }));
    const pageSession = await page.createCDPSession();
    targetSessions.add(pageSession);
    pageSession.on('Network.requestWillBeSent', ({ request }) => addBlocked(request.url));
    pageSession.on('Network.webSocketCreated', ({ url: socketUrl }) => addBlocked(socketUrl));
    pageSession.on('Network.responseReceived', ({ response: networkResponse, type }) => {
      const responseUrl = networkResponse.url;
      const implicitFavicon = new URL(responseUrl).pathname === '/favicon.ico' && type === 'Other';
      if (!implicitFavicon && networkResponse.status >= 400 && new URL(responseUrl).origin === allowedOrigin) {
        const existing = failedRequests.get(responseUrl) || {};
        failedRequests.set(responseUrl, Object.freeze({
          ...existing,
          url: responseUrl,
          status: networkResponse.status,
        }));
      }
    });
    await pageSession.send('Network.enable');
    page.on('response', (response) => {
      const responseUrl = response.url();
      const implicitFavicon = new URL(responseUrl).pathname === '/favicon.ico'
        && response.request().resourceType() === 'other';
      if (!implicitFavicon && response.status() >= 400 && new URL(responseUrl).origin === allowedOrigin) {
        failedRequests.set(responseUrl, Object.freeze({ url: responseUrl, status: response.status() }));
      }
    });
    page.on('requestfailed', (request) => {
      const requestUrl = request.url();
      try {
        if (new URL(requestUrl).origin === allowedOrigin) {
          if (new URL(requestUrl).pathname === '/favicon.ico' && request.resourceType() === 'other') return;
          const existing = failedRequests.get(requestUrl) || {};
          failedRequests.set(requestUrl, Object.freeze({
            ...existing,
            url: requestUrl,
            error: request.failure()?.errorText || 'request failed',
          }));
        }
      } catch {
        // Non-network local schemes are not requests in the manifest contract.
      }
    });
    await page.setBypassServiceWorker(true);
    if (interceptRequests) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const blocked = networkUrl(request.url(), allowedOrigin);
        if (blocked) {
          interceptedRequestCount += 1;
          blockedRequests.add(blocked);
        }
        const action = blocked ? request.abort('blockedbyclient') : request.continue();
        action.catch((error) => { interceptionError ||= error; });
      });
    }
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
      isMobile: width <= MOBILE_MAX_WIDTH,
    });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    const response = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    if (!response) throw new Error(`Navigation returned no response for ${url}.`);
    if (response.status() >= 400) throw new Error(`Entry navigation returned HTTP ${response.status()}: ${url}`);
    try {
      await Promise.race([
        page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
        }),
        delay(Math.min(1_000, timeoutMs)),
      ]);
    } catch (error) {
      if (page.url() === url) throw error;
      failedRequests.set(page.url(), Object.freeze({
        url: page.url(),
        error: `Unexpected navigation away from capture entry ${url}`,
      }));
    }
    await delay(CAPTURE_SETTLE_MS);
    await Promise.allSettled([...targetTasks]);
    if (interceptionError) throw interceptionError;
    if (page.url() !== url) {
      failedRequests.set(page.url(), Object.freeze({
        url: page.url(),
        error: `Unexpected navigation away from capture entry ${url}`,
      }));
    }
    const client = await page.createCDPSession();
    const metrics = await client.send('Page.getLayoutMetrics');
    await client.detach();
    const layoutViewport = metrics.cssLayoutViewport || metrics.layoutViewport;
    const contentSize = metrics.cssContentSize || metrics.contentSize;
    const layout = Object.freeze({
      width: Math.round(layoutViewport.clientWidth),
      height: Math.round(layoutViewport.clientHeight),
      scrollWidth: Math.ceil(contentSize.width),
    });
    const layoutResult = layoutDiagnostics({ width, height }, layout);
    const screenshot = await page.screenshot({ type: 'png', captureBeyondViewport: false });
    rendered = Object.freeze({
      browserVersion: await browser.version(),
      cssWidth: layout.width,
      cssHeight: layout.height,
      scrollWidth: layout.scrollWidth,
      overflow: layout.scrollWidth > layout.width,
      viewportMismatch: layoutResult.viewportMismatch,
      diagnostics: layoutResult.diagnostics,
      failedRequests: Object.freeze([...failedRequests.values()].sort((left, right) => left.url.localeCompare(right.url))),
      blockedTargets: Object.freeze([...blockedTargets].sort()),
      enforcement: Object.freeze({
        denyProxy: true,
        requestInterception: interceptRequests,
        interceptedRequestCount,
        proxyConnectionCount,
        webrtcPreference: 'disable_non_proxied_udp',
      }),
      png: Buffer.from(screenshot),
    });
    signal?.removeEventListener('abort', stopForSignal);
  } catch (error) {
    primaryError = error;
  } finally {
    if (signalClosePromise) {
      try {
        await signalClosePromise;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (browser?.connected) {
      try {
        await closeBrowser(browser);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const session of targetSessions) {
      try {
        await session.detach();
      } catch {
        // Browser closure can detach sessions first; no external resource remains.
      }
    }
    if (proxy) {
      try {
        await proxy.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  const failures = [primaryError, ...cleanupErrors].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Browser capture and cleanup both failed.');
  return Object.freeze({
    ...rendered,
    blockedRequests: Object.freeze([...blockedRequests].sort()),
  });
};

const encodeEntry = (entry) => entry.split('/').map(encodeURIComponent).join('/');

const reapStaleStaging = async (output) => {
  for (const name of await readdir(output)) {
    if (!/^\.capture-[a-f0-9-]+\.staging$/i.test(name)) continue;
    const candidate = join(output, name);
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`Unsafe stale capture staging path: ${name}`);
    }
    await rm(candidate, { recursive: true, force: true });
  }
};

const validateServedResources = async (root, target, targetHash, servedResources) => {
  const resources = [];
  for (const [resourcePath, resourceHash] of [...servedResources.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const resource = resolveWithin(root, resourcePath);
    if (!resource.ok) throw new Error(resource.error);
    const physicalResource = await realpath(resource.value);
    if (!isPathContained(root, physicalResource) || sha256(await readFile(physicalResource)) !== resourceHash) {
      throw new Error(`A served resource changed during capture: ${resourcePath}`);
    }
    resources.push(Object.freeze({ path: resourcePath, sha256: resourceHash }));
  }
  const artifactResource = resources.find((resource) => resource.path === relative(root, target));
  if (!artifactResource || artifactResource.sha256 !== targetHash) {
    throw new Error('The captured artifact was not bound to the served resource set.');
  }
  return Object.freeze(resources);
};

const captureIsDiagnostic = (capture) => capture.overflow
  || capture.viewportMismatch
  || capture.blockedRequests.length > 0
  || capture.blockedTargets.length > 0
  || capture.failedRequests.length > 0;

export const captureScreenshots = async ({
  root = '.',
  entry = 'index.html',
  outDir = '.browser-capture/evidence',
  browserPath = '',
  timeoutMs = 30_000,
  viewports,
  signal,
} = {}, { captureViewport = captureViewportWithPuppeteer } = {}) => {
  const physicalRoot = await realpath(resolve(root));
  const physicalTarget = await resolveExistingFile(physicalRoot, entry);
  const artifactHash = sha256(await readFile(physicalTarget));
  const normalizedViewports = normalizeViewports(viewports);
  validateTimeout(timeoutMs);
  await assertSafeDirectoryPath(physicalRoot, outDir);
  const browser = await findBrowser(browserPath);
  if (!browser) {
    if (browserPath) throw new Error(`Configured browser is not an executable file: ${browserPath}`);
    throw new Error('No supported local Chrome, Chromium, or Edge executable was found; pass --browser with an absolute path.');
  }
  const physicalOutput = await ensureSafeDirectory(physicalRoot, outDir);
  await reapStaleStaging(physicalOutput);
  const generation = `capture-${randomUUID()}`;
  const staging = join(physicalOutput, `.${generation}.staging`);
  const published = join(physicalOutput, generation);
  const captures = [];
  const servedResources = new Map();
  const serverFailures = [];
  const failures = [];
  let preview;
  let temporaryProfileRoot;
  let report;
  let readyToPublish = false;
  await mkdir(staging, { mode: 0o700 });
  const physicalStaging = await realpath(staging);
  if (!isPathContained(physicalOutput, physicalStaging)) throw new Error('Capture staging directory escapes the output root.');
  try {
    let resourceError;
    preview = await createStaticServer({
      root: physicalRoot,
      onServed: (resource) => {
        const existingHash = servedResources.get(resource.path);
        if (existingHash && existingHash !== resource.sha256) {
          resourceError ||= new Error(`A served resource changed during capture: ${resource.path}`);
        }
        servedResources.set(resource.path, resource.sha256);
      },
      onFailed: (failure) => {
        if (new URL(failure.path, 'http://127.0.0.1').pathname !== '/favicon.ico') serverFailures.push(failure);
      },
    });
    temporaryProfileRoot = await mkdtemp(join(tmpdir(), 'browser-capture-chrome-'));
    let browserVersion = '';
    for (const viewport of normalizedViewports) {
      if (signal?.aborted) throw signal.reason || new Error('Capture interrupted.');
      const failureStart = serverFailures.length;
      const rendered = await captureViewport({
        browserPath: browser,
        profile: join(temporaryProfileRoot, viewport.name),
        url: `${preview.origin}/${encodeEntry(relative(physicalRoot, physicalTarget))}`,
        width: viewport.width,
        height: viewport.height,
        timeoutMs,
        signal,
      });
      await writeExclusive(join(physicalStaging, `${viewport.name}.png`), rendered.png);
      const png = await readAndInspectPng(join(physicalStaging, `${viewport.name}.png`));
      if (png.width !== viewport.width || png.height !== viewport.height) {
        throw new Error(`PNG dimensions do not match the requested viewport: ${viewport.name}.`);
      }
      const { png: _png, browserVersion: viewportBrowserVersion, ...captureMetadata } = rendered;
      const observedServerFailures = serverFailures.slice(failureStart).map((failure) => Object.freeze({
        url: new URL(failure.path, preview.origin).href,
        status: failure.status,
      }));
      const failedByUrl = new Map([
        ...captureMetadata.failedRequests,
        ...observedServerFailures,
      ].map((failure) => [failure.url, failure]));
      browserVersion ||= viewportBrowserVersion;
      captures.push(Object.freeze({
        ...viewport,
        ...captureMetadata,
        failedRequests: Object.freeze([...failedByUrl.values()].sort((left, right) => left.url.localeCompare(right.url))),
        sha256: png.sha256,
        path: `${viewport.name}.png`,
      }));
    }
    if (sha256(await readFile(physicalTarget)) !== artifactHash) {
      throw new Error('The artifact changed during capture; no evidence was published.');
    }
    if (resourceError) throw resourceError;
    const resources = await validateServedResources(physicalRoot, physicalTarget, artifactHash, servedResources);
    report = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      producer: PRODUCER,
      ok: captures.every((capture) => !captureIsDiagnostic(capture)),
      browser: basename(browser),
      browserVersion,
      runtime: Object.freeze({ node: process.env.BROWSER_CAPTURE_SELECTED_NODE_VERSION || process.version }),
      colorScheme: 'light',
      entry: relative(physicalRoot, physicalTarget),
      artifactHash,
      generation,
      reportPath: 'capture.json',
      resources,
      captures: Object.freeze(captures),
    });
    await writeExclusive(join(physicalStaging, 'capture.json'), `${JSON.stringify(report, null, 2)}\n`);
    readyToPublish = true;
  } catch (error) {
    failures.push(error);
  }
  if (preview) {
    try {
      await preview.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (temporaryProfileRoot && basename(temporaryProfileRoot).startsWith('browser-capture-chrome-')) {
    try {
      await rm(temporaryProfileRoot, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0 || !readyToPublish) {
    try {
      await rm(physicalStaging, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    throw new AggregateError(failures, 'Capture failed before evidence could be published.');
  }
  try {
    await rename(physicalStaging, published);
  } catch (error) {
    const publicationFailures = [error];
    try {
      await rm(physicalStaging, { recursive: true, force: true });
    } catch (cleanupError) {
      publicationFailures.push(cleanupError);
    }
    if (publicationFailures.length === 1) throw error;
    throw new AggregateError(publicationFailures, 'Capture evidence publication failed.');
  }
  return report;
};
