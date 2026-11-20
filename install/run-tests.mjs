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

export const main = async () => {
  const tests = await discoverRootTests();
  if (tests.length === 0) throw new Error('No root test files discovered.');
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
    cwd: DEFAULT_ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.status ?? 1;
};

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`root tests: ${error.message}\n`);
    process.exitCode = 1;
  });
}
