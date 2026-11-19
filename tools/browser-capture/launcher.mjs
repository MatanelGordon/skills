#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));

export const isCompatibleNodeVersion = (version) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!match) return false;
  const [, majorText, minorText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  return major > 22 || (major === 22 && minor >= 12);
};

const versionOf = (executable) => {
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : '';
};

const nvmCandidates = async (environment) => {
  const nvmRoot = environment.NVM_DIR || join(homedir(), '.nvm');
  const versionsRoot = join(nvmRoot, 'versions', 'node');
  let versions = [];
  try {
    versions = await readdir(versionsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return versions
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    .map((version) => join(versionsRoot, version, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'));
};

export const findCompatibleNode = async (environment = process.env) => {
  const explicit = environment.BROWSER_CAPTURE_NODE;
  if (explicit) {
    if (!isAbsolute(explicit)) throw new Error('BROWSER_CAPTURE_NODE must be an absolute path.');
    const version = versionOf(explicit);
    if (!isCompatibleNodeVersion(version)) {
      throw new Error(`BROWSER_CAPTURE_NODE must be Node 22.12 or newer; found ${version || 'an unusable executable'}.`);
    }
    return explicit;
  }

  if (isCompatibleNodeVersion(process.version)) return process.execPath;

  const fileName = process.platform === 'win32' ? 'node.exe' : 'node';
  const candidates = [
    ...await nvmCandidates(environment),
    environment.NVM_SYMLINK && join(environment.NVM_SYMLINK, fileName),
    environment.VOLTA_HOME && join(environment.VOLTA_HOME, 'bin', fileName),
    ...(environment.PATH || '').split(delimiter).filter(Boolean).map((directory) => join(directory, fileName)),
  ].filter(Boolean);

  for (const candidate of new Set(candidates)) {
    if (isCompatibleNodeVersion(versionOf(candidate))) return candidate;
  }
  return null;
};

export const main = async (argv) => {
  const node = await findCompatibleNode();
  if (!node) {
    throw new Error('browser-capture requires Node 22.12 or newer. Install it or set BROWSER_CAPTURE_NODE to its absolute executable path.');
  }
  const child = spawn(node, [CLI, ...argv], {
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

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`browser-capture: ${error.message}\n`);
    process.exitCode = 64;
  });
}
