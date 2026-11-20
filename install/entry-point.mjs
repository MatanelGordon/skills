/** Tells a script whether it is the program Node was started with, or was merely imported. */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isEntryPoint(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    // npm bin shims and symlinked checkouts leave the link in argv[1], while import.meta.url names the real file.
    return realpathSync(argvPath) === realpathSync(modulePath);
  } catch {
    // argv[1] names nothing on disk ("-" when the program arrives on stdin): compare the paths as written.
    return resolve(argvPath) === modulePath;
  }
}
