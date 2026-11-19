#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { parseViewportSpec, validateBrowserPath, validateTimeout } from './lib/contract.mjs';
import { createStaticServer } from './lib/static-server.mjs';

const HELP = `browser-capture — deterministic local browser evidence

Commands:
  capture [--root <dir>] [--entry <html>] [--out <dir>] [--browser <absolute-path>]
          [--timeout <ms>] [--viewport <name:width:height> ...]
  serve   [--root <dir>] [--port <1-65535>]
  doctor  [--browser <absolute-path>] [--json true]

No command downloads a browser, browses the public web, updates itself, or emits telemetry.\n`;

const commandFlags = Object.freeze({
  capture: new Set(['root', 'entry', 'out', 'browser', 'timeout', 'viewport']),
  serve: new Set(['root', 'port']),
  doctor: new Set(['browser', 'json']),
});

const readOptions = (tokens, command) => {
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const equals = token.indexOf('=');
    const key = token.slice(2, equals > 0 ? equals : undefined);
    if (!commandFlags[command].has(key)) throw new Error(`Unknown option for ${command}: --${key}`);
    const value = equals > 0 ? token.slice(equals + 1) : tokens[index + 1];
    if (value === undefined || (equals < 0 && value.startsWith('--'))) throw new Error(`Option --${key} requires a value.`);
    if (key !== 'viewport' && values.has(key)) throw new Error(`Duplicate option: --${key}`);
    values.set(key, [...(values.get(key) || []), value]);
    if (equals < 0) index += 1;
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
  if (!commandFlags[command]) throw new Error(`Unknown command: ${command}`);
  const options = readOptions(tokens, command);
  if (command === 'capture') {
    const timeoutMs = Number(options.one('timeout', '30000'));
    validateTimeout(timeoutMs);
    const browserPath = options.one('browser');
    validateBrowserPath(browserPath);
    const viewports = options.has('viewport') ? options.many('viewport').map(parseViewportSpec) : undefined;
    return Object.freeze({
      command,
      root: options.one('root', '.'),
      entry: options.one('entry', 'index.html'),
      outDir: options.one('out', '.browser-capture/evidence'),
      browserPath,
      timeoutMs,
      viewports,
      json: false,
      port: undefined,
    });
  }
  if (command === 'serve') {
    const rawPort = options.has('port') ? options.one('port') : process.env.BROWSER_CAPTURE_PORT;
    const port = rawPort === undefined ? 4173 : Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new TypeError('Port must be an integer from 1 through 65535.');
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
  if (!['true', 'false'].includes(json)) throw new TypeError('--json must be true or false.');
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
      throw new Error('puppeteer-core is not installed. From the registry root run `npm run setup:browser-capture`.');
    }
    throw error;
  }
};

const runCapture = async (options) => {
  const { captureScreenshots } = await loadCaptureRuntime();
  const report = await captureScreenshots(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
};

const runServe = async (options) => {
  const preview = await createStaticServer({ root: options.root, port: options.port });
  process.stdout.write(`${preview.origin}\n`);
  const stop = async () => {
    await preview.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

const runDoctor = async (options) => {
  let browser = null;
  let dependencyError = '';
  try {
    const { findBrowser } = await loadCaptureRuntime();
    browser = await findBrowser(options.browserPath);
  } catch (error) {
    dependencyError = error.message;
  }
  const report = Object.freeze({
    node: process.version,
    compatible: nodeCompatible(),
    browser,
    browserVersion: null,
    dependencies: dependencyError || 'puppeteer-core 25.18.1',
    captureAvailable: nodeCompatible() && !dependencyError && Boolean(browser),
    network: 'runtime network is restricted to the exact loopback preview origin',
  });
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Node ${report.node}: ${report.compatible ? 'ready' : 'unsupported'}\nBrowser: ${browser || 'not found'}\nDependencies: ${report.dependencies}\nNetwork: ${report.network}\n`);
  if (!report.compatible) process.exitCode = 1;
};

export const main = async (argv) => {
  const options = parseArgs(argv);
  if (options.command === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (options.command === 'capture') return runCapture(options);
  if (options.command === 'serve') return runServe(options);
  return runDoctor(options);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`browser-capture: ${error.message}\n`);
    process.exitCode = 64;
  });
}
