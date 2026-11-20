#!/usr/bin/env node
/** Portable discovery for the root suite; provisioned browser tests run separately. */
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEST_ROOTS = Object.freeze(['install', 'skills']);
const EXCLUDED_DIRECTORIES = new Set(['skills/rank-workspace']);
const PROVISIONED_TESTS = new Set(['skills/impeccable-lite/tests/browser-integration.test.mjs']);
const SERIAL_FLAG = '--test-concurrency=1';
const repositoryPath = (root, path) => relative(root, path).replaceAll('\\', '/');

const discoverTestsUnder = async (root, directory) => {
  if (EXCLUDED_DIRECTORIES.has(repositoryPath(root, directory))) return [];
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const discovered = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverTestsUnder(root, path);
    const isRootTest = entry.isFile()
      && entry.name.endsWith('.test.mjs')
      && !PROVISIONED_TESTS.has(repositoryPath(root, path));
    return isRootTest ? [path] : [];
  }));
  return discovered.flat();
};

export const discoverRootTests = async (root = DEFAULT_ROOT) => (
  await Promise.all(TEST_ROOTS.map((directory) => discoverTestsUnder(root, join(root, directory))))
).flat();

// Asked of the running Node, not a version table: older Node 18 releases reject the flag as a bad option.
const supportsSerialFlag = () => (
  spawnSync(process.execPath, [SERIAL_FLAG, '--version'], { stdio: 'ignore' }).status === 0
);

// One file at a time either way: files that overlap race in the signal tests.
export const serialTestCommands = (tests, hasSerialFlag) => (hasSerialFlag
  ? [['--test', SERIAL_FLAG, ...tests]]
  : tests.map((test) => ['--test', test]));

// Like `node --test`, a failing file does not stop the rest; a signal does.
export const runCommands = (commands, run) => commands.reduce((outcome, args) => {
  if (outcome.signal) return outcome;
  const result = run(args);
  if (result.error) throw result.error;
  if (result.signal) return { ...outcome, signal: result.signal };
  return { ...outcome, status: outcome.status || (result.status ?? 1) };
}, { status: 0, signal: null });

export const main = async () => {
  const tests = await discoverRootTests();
  if (tests.length === 0) throw new Error('No root test files discovered.');
  const outcome = runCommands(
    serialTestCommands(tests, supportsSerialFlag()),
    (args) => spawnSync(process.execPath, args, { cwd: DEFAULT_ROOT, stdio: 'inherit' }),
  );
  if (outcome.signal) process.kill(process.pid, outcome.signal);
  else process.exitCode = outcome.status;
};

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`root tests: ${error.message}\n`);
    process.exitCode = 1;
  });
}
