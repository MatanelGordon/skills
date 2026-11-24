#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LOG_FILE = path.join(os.homedir(), '.tasklog.txt');
const USAGE = `Usage: tasklog <command>

Commands:
  add <text>   append an entry with the current time
  list         print all entries

Options:
  --help       show this message`;

function main(argv) {
  const [command, ...rest] = argv;

  if (!command || command === '--help') {
    console.log(USAGE);
    return 0;
  }
  if (command === 'add') {
    const text = rest.join(' ').trim();
    if (!text) {
      console.error('tasklog add: nothing to add');
      return 1;
    }
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${text}\n`);
    return 0;
  }
  if (command === 'list') {
    process.stdout.write(fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '');
    return 0;
  }
  console.error(`tasklog: unknown command "${command}"\n\n${USAGE}`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
