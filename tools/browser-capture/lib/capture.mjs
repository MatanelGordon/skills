import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

import puppeteer from 'puppeteer-core';

import {
  PRODUCER,
  SCHEMA_VERSION,
  buildChromeSecurityArgs,
  combineCaptureErrors,
  normalizeViewports,
  validateBrowserPath,
  validateTimeout,
} from './contract.mjs';
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

export const findBrowser = async (preferred = '') => {
  if (preferred) {
    validateBrowserPath(preferred);
    try {
      await access(preferred, constants.X_OK);
      return preferred;
    } catch {
      return null;
    }
  }
  for (const channel of CHANNELS) {
    try {
      const candidate = await puppeteer.executablePath(channel);
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Standard-channel discovery is owned by Puppeteer; try the next channel.
    }
  }
  return null;
};

const closeBrowser = async (browser) => {
  let timer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser close timed out after 3000ms.')), 3_000);
      }),
    ]);
  } catch (error) {
    const process = browser.process();
    if (process && process.exitCode === null && process.signalCode === null) process.kill('SIGKILL');
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const captureViewportWithPuppeteer = async ({
  browserPath,
  profile,
  url,
  width,
  height,
  timeoutMs,
}) => {
  const allowedOrigin = new URL(url).origin;
  let browser;
  let result;
  let primaryError;
  let cleanupError;
  try {
    browser = await puppeteer.launch({
      browser: 'chrome',
      executablePath: browserPath,
      headless: true,
      pipe: true,
      protocolTimeout: timeoutMs,
      timeout: timeoutMs,
      userDataDir: profile,
      args: buildChromeSecurityArgs(allowedOrigin),
    });
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    const blockedRequests = new Set();
    let interceptionError;
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(() => {
      globalThis.__browserCapturePolicyBlocks = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__browserCapturePolicyBlocks.push(event.blockedURI);
      });
    });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      let blocked = false;
      try {
        const requested = new URL(request.url());
        blocked = ['http:', 'https:', 'ws:', 'wss:'].includes(requested.protocol)
          && requested.origin !== allowedOrigin;
      } catch {
        blocked = true;
      }
      if (blocked) blockedRequests.add(request.url());
      const action = blocked ? request.abort('blockedbyclient') : request.continue();
      action.catch((error) => { interceptionError ||= error; });
    });
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
      isMobile: width < 600,
    });
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    });
    if (interceptionError) throw interceptionError;
    const policyBlocks = await page.evaluate(() => globalThis.__browserCapturePolicyBlocks || []);
    for (const blocked of policyBlocks) {
      try {
        const requested = new URL(blocked);
        if (['http:', 'https:', 'ws:', 'wss:'].includes(requested.protocol)
          && requested.origin !== allowedOrigin) {
          blockedRequests.add(blocked);
        }
      } catch {
        if (blocked) blockedRequests.add(blocked);
      }
    }
    const rendered = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (rendered.width !== width || rendered.height !== height) {
      throw new Error(`Browser viewport mismatch: requested ${width}x${height}, rendered ${rendered.width}x${rendered.height}.`);
    }
    const screenshot = await page.screenshot({ type: 'png', captureBeyondViewport: false });
    result = Object.freeze({
      browserVersion: await browser.version(),
      cssWidth: rendered.width,
      cssHeight: rendered.height,
      scrollWidth: rendered.scrollWidth,
      overflow: rendered.scrollWidth > rendered.width,
      blockedRequests: Object.freeze([...blockedRequests].sort()),
      png: Buffer.from(screenshot),
    });
  } catch (error) {
    primaryError = error;
  } finally {
    if (browser) {
      try {
        await closeBrowser(browser);
      } catch (error) {
        cleanupError = error;
      }
    }
  }
  const failure = combineCaptureErrors(primaryError, cleanupError);
  if (failure) throw failure;
  return result;
};

const encodeEntry = (entry) => entry.split('/').map(encodeURIComponent).join('/');

export const captureScreenshots = async ({
  root = '.',
  entry = 'index.html',
  outDir = '.browser-capture/evidence',
  browserPath = '',
  timeoutMs = 30_000,
  viewports,
} = {}, { captureViewport = captureViewportWithPuppeteer } = {}) => {
  const physicalRoot = await realpath(resolve(root));
  const physicalTarget = await resolveExistingFile(physicalRoot, entry);
  const artifactHash = sha256(await readFile(physicalTarget));
  const normalizedViewports = normalizeViewports(viewports);
  validateTimeout(timeoutMs);
  await assertSafeDirectoryPath(physicalRoot, outDir);

  const browser = await findBrowser(browserPath);
  if (!browser) throw new Error('No supported local Chrome executable found; no browser download was attempted.');
  const physicalOutput = await ensureSafeDirectory(physicalRoot, outDir);
  const generation = `capture-${randomUUID()}`;
  const staging = join(physicalOutput, `.${generation}.staging`);
  const published = join(physicalOutput, generation);

  let preview;
  let temporaryProfileRoot;
  let physicalStaging = staging;
  let stagingPending = false;
  let readyToPublish = false;
  let primaryError;
  let resourceError;
  let report;
  const captures = [];
  const servedResources = new Map();
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
    temporaryProfileRoot = await mkdtemp(join(tmpdir(), 'browser-capture-chrome-'));
    for (const viewport of normalizedViewports) {
      const stagePath = join(physicalStaging, `${viewport.name}.png`);
      const finalPath = join(published, `${viewport.name}.png`);
      const url = `${preview.origin}/${encodeEntry(relative(physicalRoot, physicalTarget))}`;
      const rendered = await captureViewport({
        browserPath: browser,
        profile: join(temporaryProfileRoot, viewport.name),
        url,
        width: viewport.width,
        height: viewport.height,
        timeoutMs,
      });
      await writeExclusive(stagePath, rendered.png);
      const png = await readAndInspectPng(stagePath);
      if (png.width !== viewport.width || png.height !== viewport.height) {
        throw new Error(`PNG dimensions do not match the requested viewport: ${viewport.name}.`);
      }
      const { png: _png, browserVersion: _browserVersion, ...captureMetadata } = rendered;
      captures.push(Object.freeze({ ...viewport, ...captureMetadata, sha256: png.sha256, path: finalPath }));
      report ||= { browserVersion: rendered.browserVersion };
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
      schemaVersion: SCHEMA_VERSION,
      producer: PRODUCER,
      ok: captures.every((capture) => !capture.overflow && capture.blockedRequests.length === 0),
      browser: basename(browser),
      browserVersion: report.browserVersion,
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
  if (temporaryProfileRoot && basename(temporaryProfileRoot).startsWith('browser-capture-chrome-')) {
    cleanups.push(rm(temporaryProfileRoot, { recursive: true, force: true }));
  }
  const cleanupResults = await Promise.allSettled(cleanups);
  const cleanupErrors = cleanupResults.filter((result) => result.status === 'rejected').map((result) => result.reason);
  if (primaryError || cleanupErrors.length > 0 || !readyToPublish) {
    const failures = [primaryError, ...cleanupErrors].filter(Boolean);
    if (stagingPending) {
      try {
        await rm(physicalStaging, { recursive: true, force: true });
        stagingPending = false;
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    throw new AggregateError(failures, 'Capture failed before evidence could be published.');
  }

  try {
    await rename(physicalStaging, published);
    stagingPending = false;
  } catch (error) {
    const failures = [error];
    if (stagingPending) {
      try {
        await rm(physicalStaging, { recursive: true, force: true });
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    if (failures.length === 1) throw error;
    throw new AggregateError(failures, 'Capture evidence publication failed.');
  }
  return report;
};
