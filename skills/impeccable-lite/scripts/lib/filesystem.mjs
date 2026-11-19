import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { isPathContained, resolveWithin } from './core.mjs';

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
