#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCompatibleNode } from './launcher.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export const main = async () => {
  const node = await findCompatibleNode();
  if (!node) {
    throw new Error('browser-capture tests require Node 22.12 or newer. Install it or set BROWSER_CAPTURE_NODE to its absolute executable path.');
  }
  const testsRoot = join(here, 'tests');
  const tests = (await readdir(testsRoot))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join(testsRoot, name));
  const child = spawn(node, ['--test', '--test-concurrency=1', ...tests], {
    cwd: here,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  await new Promise((resolveRun, rejectRun) => {
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = code ?? 1;
      resolveRun();
    });
  });
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`browser-capture tests: ${error.message}\n`);
    process.exitCode = 1;
  });
}
