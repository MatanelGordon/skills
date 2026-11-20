#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const MINIMUM_NODE = Object.freeze({ major: 22, minor: 12, patch: 0 });
const FORCE_KILL_GRACE_MS = 8_000;

const parseNodeVersion = (version) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  return match ? match.slice(1).map(Number) : null;
};

export const isCompatibleNodeVersion = (version) => {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  const [major, minor] = parsed;
  return major > MINIMUM_NODE.major || (major === MINIMUM_NODE.major && minor >= MINIMUM_NODE.minor);
};

export const versionOf = (executable) => {
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : '';
};

const versionedCandidates = async (root, suffix) => {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, ...suffix));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
};

const managedCandidates = async (environment) => {
  const home = homedir();
  const fileName = process.platform === 'win32' ? 'node.exe' : 'node';
  const nvmRoot = environment.NVM_DIR || join(home, '.nvm');
  return [
    ...await versionedCandidates(join(nvmRoot, 'versions', 'node'), ['bin', fileName]),
    ...await versionedCandidates(join(environment.FNM_DIR || join(home, '.local', 'share', 'fnm'), 'node-versions'), ['installation', 'bin', fileName]),
    ...await versionedCandidates(join(home, '.asdf', 'installs', 'nodejs'), ['bin', fileName]),
    ...await versionedCandidates(join(home, '.local', 'share', 'mise', 'installs', 'node'), ['bin', fileName]),
    ...await versionedCandidates(join(environment.N_PREFIX || join(home, '.n'), 'versions', 'node'), ['bin', fileName]),
    environment.NVM_SYMLINK && join(environment.NVM_SYMLINK, fileName),
    environment.VOLTA_HOME && join(environment.VOLTA_HOME, 'bin', fileName),
    '/opt/homebrew/opt/node@22/bin/node',
    '/usr/local/opt/node@22/bin/node',
  ].filter(Boolean);
};

const candidateRank = ({ version }) => {
  const [major, minor, patch] = parseNodeVersion(version);
  return [major % 2, major, minor, patch];
};

const compareRank = (left, right) => {
  const leftRank = candidateRank(left);
  const rightRank = candidateRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return leftRank[index] - rightRank[index];
  }
  return left.executable.localeCompare(right.executable);
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
  const fileName = process.platform === 'win32' ? 'node.exe' : 'node';
  const rawCandidates = [
    ...await managedCandidates(environment),
    process.execPath,
    ...(environment.PATH || '').split(delimiter).filter(Boolean).map((directory) => join(directory, fileName)),
  ];
  const candidates = [...new Set(rawCandidates)].map((executable) => ({ executable, version: versionOf(executable) }))
    .filter(({ version }) => isCompatibleNodeVersion(version))
    .sort(compareRank);
  return candidates[0]?.executable || null;
};

const terminateGroup = (child) => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
};

export const main = async (argv) => {
  const node = await findCompatibleNode();
  if (!node) throw new Error('browser-capture requires Node 22.12 or newer; install a compatible LTS or set BROWSER_CAPTURE_NODE.');
  const selectedVersion = versionOf(node);
  const child = spawn(node, [CLI, ...argv], {
    detached: process.platform !== 'win32',
    env: { ...process.env, BROWSER_CAPTURE_SELECTED_NODE_VERSION: selectedVersion },
    stdio: 'inherit',
    windowsHide: true,
  });
  let killTimer;
  const forward = (signal) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    clearTimeout(killTimer);
    killTimer = setTimeout(() => terminateGroup(child), FORCE_KILL_GRACE_MS);
  };
  const handlers = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [signal, () => forward(signal)]));
  for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(killTimer);
      if (signal) process.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143;
      else process.exitCode = code ?? 1;
      resolve();
    });
  });
  for (const [signal, handler] of Object.entries(handlers)) process.off(signal, handler);
};

const invokedDirectly = process.argv[1]
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`browser-capture launcher: ${error.message}\n`);
    process.exitCode = 70;
  });
}
