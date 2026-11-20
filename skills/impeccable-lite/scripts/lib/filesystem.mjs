import { realpathSync } from 'node:fs';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPathContained, resolveWithin } from './core.mjs';

// Kept local: an installed skill cannot import from the registry's install/ directory.
export const isEntryPoint = (moduleUrl, argvPath = process.argv[1]) => {
  if (!argvPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    // A symlinked skill install leaves the link in argv[1], while import.meta.url names the real file.
    return realpathSync(argvPath) === realpathSync(modulePath);
  } catch {
    // argv[1] names nothing on disk ("-" when the program arrives on stdin): compare the paths as written.
    return resolve(argvPath) === modulePath;
  }
};

export const ensureSafeDirectory = async (root, requested) => {
  const lexical = resolveWithin(root, requested);
  if (!lexical.ok) throw new Error(lexical.error);
  const fromRoot = relative(root, lexical.value);
  let current = root;
  for (const segment of fromRoot.split(sep).filter(Boolean)) {
    const next = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(next);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        await mkdir(next, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') throw mkdirError;
      }
      metadata = await lstat(next);
    }
    if (metadata.isSymbolicLink()) throw new Error(`Unsafe symbolic link in output path: ${relative(root, next)}`);
    if (!metadata.isDirectory()) throw new Error(`Output parent is not a directory: ${relative(root, next)}`);
    const physical = await realpath(next);
    if (!isPathContained(root, physical)) throw new Error(`Output directory escapes the project root: ${relative(root, next)}`);
    current = physical;
  }
  return current;
};
