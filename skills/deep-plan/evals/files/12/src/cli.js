#!/usr/bin/env node
// copydir <from> <to>: copies every file in <from> into <to>.
import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function main([from, to]) {
  if (!from || !to) {
    console.error('usage: copydir <from> <to>');
    process.exitCode = 64;
    return;
  }
  for (const name of await readdir(from)) {
    await copyFile(join(from, name), join(to, name));
    console.log(`copied ${name}`);
  }
}

main(process.argv.slice(2));
