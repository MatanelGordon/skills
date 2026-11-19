#!/usr/bin/env node
import { calculate, withinDisplayLimit } from './calculator.js';

const [operation, rawLeft, rawRight] = process.argv.slice(2);
const result = calculate(operation, Number(rawLeft), Number(rawRight));
const rendered = result.ok ? String(result.value) : result.error;

if (!withinDisplayLimit(rendered)) {
  process.stderr.write('Result exceeds the 12-character display limit\n');
  process.exitCode = 2;
} else {
  process.stdout.write(`${rendered}\n`);
}
