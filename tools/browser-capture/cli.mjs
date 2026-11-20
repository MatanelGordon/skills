#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parseViewportSpec, validateBrowserPath, validateTimeout } from './lib/contract.mjs';
import { createStaticServer } from './lib/static-server.mjs';

export const EXIT = Object.freeze({ DIAGNOSTIC: 1, USAGE: 64, RUNTIME: 70 });

const HELP = `browser-capture — deterministic local browser evidence

Commands:
  capture [--root <dir>] [--entry <html>] [--out <dir>] [--browser <absolute-path>]
          [--timeout <ms>] [--viewport <name:width:height> ...]
  serve   [--root <dir>] [--port <1-65535>]
  doctor  [--browser <absolute-path>] [--json[=true|false]]

No command downloads a browser, browses the public web, updates itself, or emits telemetry.\n`;

const commandFlags = Object.freeze({
  capture: new Set(['root', 'entry', 'out', 'browser', 'timeout', 'viewport']),
  serve: new Set(['root', 'port']),
  doctor: new Set(['browser', 'json']),
});

export class UsageError extends Error {}

const readOptions = (tokens, command) => {
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new UsageError(`Unexpected argument: ${token}`);
    const equals = token.indexOf('=');
    const key = token.slice(2, equals > 0 ? equals : undefined);
    if (!commandFlags[command].has(key)) throw new UsageError(`Unknown option for ${command}: --${key}`);
    const following = tokens[index + 1];
    const booleanJson = command === 'doctor' && key === 'json' && equals < 0
      && (following === undefined || following.startsWith('--'));
    const value = booleanJson ? 'true' : equals > 0 ? token.slice(equals + 1) : following;
    if (value === undefined || (equals < 0 && !booleanJson && value.startsWith('--'))) {
      throw new UsageError(`Option --${key} requires a value.`);
    }
    if (key !== 'viewport' && values.has(key)) throw new UsageError(`Duplicate option: --${key}`);
    values.set(key, [...(values.get(key) || []), value]);
    if (equals < 0 && !booleanJson) index += 1;
  }
  return Object.freeze({
    one: (key, fallback = '') => values.get(key)?.at(-1) ?? fallback,
    many: (key) => values.get(key) || [],
    has: (key) => values.has(key),
  });
};

export const parseArgs = (argv) => {
  const [command = 'help', ...tokens] = argv;
  if (['help', '--help', '-h'].includes(command)) return Object.freeze({ command: 'help' });
  if (!commandFlags[command]) throw new UsageError(`Unknown command: ${command}`);
  const options = readOptions(tokens, command);
  if (command === 'capture') {
    const timeoutMs = Number(options.one('timeout', '30000'));
    validateTimeout(timeoutMs);
    const browserPath = options.one('browser');
    validateBrowserPath(browserPath);
    return Object.freeze({
      command,
      root: options.one('root', '.'),
      entry: options.one('entry', 'index.html'),
      outDir: options.one('out', '.browser-capture/evidence'),
      browserPath,
      timeoutMs,
      viewports: options.has('viewport') ? options.many('viewport').map(parseViewportSpec) : undefined,
      json: false,
      port: undefined,
    });
  }
  if (command === 'serve') {
    const rawPort = options.has('port') ? options.one('port') : process.env.BROWSER_CAPTURE_PORT;
    const port = rawPort === undefined ? 4173 : Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new UsageError('Port must be an integer from 1 through 65535.');
    }
    return Object.freeze({
      command,
      root: options.one('root', '.'),
      entry: 'index.html',
      outDir: '.browser-capture/evidence',
      browserPath: '',
      timeoutMs: 30_000,
      viewports: undefined,
      json: false,
      port,
    });
  }
  const browserPath = options.one('browser');
  validateBrowserPath(browserPath);
  const json = options.one('json', 'false');
  if (!['true', 'false'].includes(json)) throw new UsageError('--json must be true or false.');
  return Object.freeze({
    command,
    root: '.',
    entry: 'index.html',
    outDir: '.browser-capture/evidence',
    browserPath,
    timeoutMs: 30_000,
    viewports: undefined,
    json: json === 'true',
    port: undefined,
  });
};

const nodeCompatible = () => {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 12);
};

const loadCaptureRuntime = async () => {
  try {
    return await import('./lib/capture.mjs');
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && /puppeteer-core/i.test(error.message)) {
      throw new Error('puppeteer-core is not installed; from a registry checkout run `npm run setup:browser-capture`.');
    }
    throw error;
  }
};

const dependencyVersion = async () => {
  const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
  return packageJson.dependencies?.['puppeteer-core'] || 'unknown';
};

const runCapture = async (options, signal) => {
  const { captureScreenshots } = await loadCaptureRuntime();
  const report = await captureScreenshots({ ...options, signal });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = EXIT.DIAGNOSTIC;
};

const runServe = async (options) => {
  const preview = await createStaticServer({ root: options.root, port: options.port });
  process.stdout.write(`${preview.origin}\n`);
  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    try {
      await preview.close();
      process.exitCode = signal === 'SIGINT' ? 130 : 143;
    } catch (error) {
      process.stderr.write(`${formatError(error)}\n`);
      process.exitCode = EXIT.RUNTIME;
    }
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
};

const runDoctor = async (options) => {
  let browser = null;
  let browserVersion = null;
  let dependency = null;
  let captureError = '';
  try {
    const runtime = await loadCaptureRuntime();
    dependency = `puppeteer-core@${await dependencyVersion()}`;
    browser = await runtime.findBrowser(options.browserPath);
    if (!browser) {
      captureError = options.browserPath
        ? `Configured browser is not executable: ${options.browserPath}`
        : 'No supported local Chrome, Chromium, or Edge browser was found; pass --browser <absolute-path>.';
    } else {
      browserVersion = runtime.getBrowserVersion(browser);
      if (!browserVersion) captureError = `Executable is not a supported Chrome-family browser: ${browser}`;
    }
  } catch (error) {
    captureError = error.message;
  }
  if (!nodeCompatible()) captureError ||= 'Capture runtime requires Node 22.12 or newer.';
  const report = Object.freeze({
    schemaVersion: 1,
    producer: 'browser-capture',
    captureNode: process.version,
    nodeCompatible: nodeCompatible(),
    browser,
    browserVersion,
    dependency,
    captureAvailable: nodeCompatible() && !captureError && Boolean(browserVersion),
    captureError: captureError || null,
    enforcement: Object.freeze([
      'process-owned deny proxy with exact preview-origin bypass',
      'request interception for the capture page',
      'isolated profile with non-proxied WebRTC UDP disabled',
    ]),
  });
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(`Capture: ${report.captureAvailable ? 'available' : `unavailable (${report.captureError})`}\n`);
    process.stdout.write(`Capture Node ${report.captureNode}: ${report.nodeCompatible ? 'ready' : 'unsupported'}\n`);
    process.stdout.write(`Browser: ${report.browserVersion || report.browser || 'not found'}\n`);
    process.stdout.write(`Dependency: ${report.dependency || 'unavailable'}\n`);
    process.stdout.write(`Containment: ${report.enforcement.join('; ')}\n`);
  }
  if (!report.captureAvailable) process.exitCode = EXIT.RUNTIME;
};

export const main = async (argv, { signal } = {}) => {
  const options = parseArgs(argv);
  if (options.command === 'help') return process.stdout.write(HELP);
  if (options.command === 'capture') return runCapture(options, signal);
  if (options.command === 'serve') return runServe(options);
  return runDoctor(options);
};

const errorLines = (error, prefix = 'browser-capture') => {
  const own = `${prefix}: ${error?.message || String(error)}`;
  const nested = error instanceof AggregateError
    ? error.errors.flatMap((cause, index) => errorLines(cause, `${prefix} cause ${index + 1}`))
    : [];
  return [own, ...nested];
};

export const formatError = (error) => errorLines(error).join('\n');

const signalExitCode = (signal) => signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143;

const runDirect = async () => {
  const controller = new AbortController();
  let receivedSignal = null;
  const handlers = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [signal, () => {
    receivedSignal ||= signal;
    controller.abort(new Error(`Capture interrupted by ${signal}.`));
  }]));
  for (const [signal, handler] of Object.entries(handlers)) process.once(signal, handler);
  try {
    await main(process.argv.slice(2), { signal: controller.signal });
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = error instanceof UsageError || error instanceof TypeError ? EXIT.USAGE : EXIT.RUNTIME;
  } finally {
    for (const [signal, handler] of Object.entries(handlers)) process.off(signal, handler);
    if (receivedSignal) process.exitCode = signalExitCode(receivedSignal);
  }
};

const invokedDirectly = process.argv[1]
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await runDirect();
