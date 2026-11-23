#!/usr/bin/env node
// Count the lines in each file given on the command line.
const { readFileSync } = require('node:fs');

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('usage: cli.js <file>...');
  process.exit(64);
}

let total = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  console.log(`${lines}\t${file}`);
  total += lines;
}
console.log(`${total}\ttotal`);
