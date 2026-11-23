#!/usr/bin/env node
// filesize: prints the size in bytes of each file named on the command line.
import {statSync} from 'node:fs';
import {parseArgs} from 'node:util';

const {values, positionals} = parseArgs({
  options: {
    help: {type: 'boolean', short: 'h'},
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log('usage: filesize [-h] <file>...');
  process.exit(values.help ? 0 : 2);
}

for (const file of positionals) {
  const {size} = statSync(file);
  console.log(`${String(size).padStart(10)}  ${file}`);
}
