import { createHash } from 'node:crypto';
import { open, readFile, realpath, stat } from 'node:fs/promises';

import { inspectPng, isPathContained, resolveWithin } from '../../../skills/impeccable-lite/scripts/lib/core.mjs';
import { assertSafeDirectoryPath, ensureSafeDirectory } from '../../../skills/impeccable-lite/scripts/lib/filesystem.mjs';

export { assertSafeDirectoryPath, ensureSafeDirectory, isPathContained, resolveWithin };

export const sha256 = (content) => createHash('sha256').update(content).digest('hex');

export const resolveExistingFile = async (root, requested) => {
  const lexical = resolveWithin(root, requested);
  if (!lexical.ok) throw new TypeError(lexical.error);
  const physical = await realpath(lexical.value);
  if (!isPathContained(root, physical)) throw new Error('Entry escapes the project root.');
  const metadata = await stat(physical);
  if (!metadata.isFile()) throw new Error('Entry must be a file.');
  return physical;
};

export const writeExclusive = async (path, content) => {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const readAndInspectPng = async (path) => {
  const bytes = await readFile(path);
  if (bytes.length < 100) throw new Error(`Capture is unexpectedly small: ${path}`);
  const inspected = inspectPng(bytes);
  if (!inspected.ok) throw new Error(`Capture is not a valid PNG: ${path}. ${inspected.error}`);
  return Object.freeze({ ...inspected.value, sha256: sha256(bytes) });
};
