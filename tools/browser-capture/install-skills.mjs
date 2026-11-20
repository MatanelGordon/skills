#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../../install/index.mjs', import.meta.url));

export const main = async (argv) => {
  const child = spawn(process.execPath, [installer, ...argv], {
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = code ?? 1;
      resolve();
    });
  });
};

const invokedDirectly = process.argv[1]
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`install-skills: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
