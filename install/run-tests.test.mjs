import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runCommands, serialTestCommands } from './run-tests.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Real path, so the fixture is not reached through a link such as macOS's /var.
const makeTemp = async () => realpath(await mkdtemp(join(tmpdir(), 'skills-root-runner-test-')));

const passingTest = (name) => `import test from 'node:test';\ntest('${name}', () => {});\n`;
const failingTest = (name) => `import test from 'node:test';\ntest('${name}', () => { throw new Error('fixture failure'); });\n`;

/** A throwaway repository with its own copy of the runner, so running it never re-enters this suite. */
async function writeFixtureRepo(tests) {
  const root = await makeTemp();
  await mkdir(join(root, 'install'));
  await mkdir(join(root, 'skills', 'fixture', 'tests'), { recursive: true });
  await Promise.all([
    ...['run-tests.mjs', 'entry-point.mjs'].map((file) => copyFile(join(HERE, file), join(root, 'install', file))),
    ...Object.entries(tests).map(([file, body]) => writeFile(join(root, file), body)),
  ]);
  return root;
}

function runFixtureRunner(runner) {
  // Inherited from the suite running this file, it would tell a nested `node --test` to run nothing.
  const { NODE_TEST_CONTEXT: _outerRunner, ...env } = process.env;
  return spawnSync(process.execPath, [runner], { encoding: 'utf8', env });
}

test('serial test commands use the concurrency flag when Node supports it', () => {
  assert.deepEqual(serialTestCommands(['a.test.mjs', 'b.test.mjs'], true), [
    ['--test', '--test-concurrency=1', 'a.test.mjs', 'b.test.mjs'],
  ]);
});

test('serial test commands fall back to one process per file without the concurrency flag', () => {
  assert.deepEqual(serialTestCommands(['a.test.mjs', 'b.test.mjs'], false), [
    ['--test', 'a.test.mjs'],
    ['--test', 'b.test.mjs'],
  ]);
});

test('running commands keeps going after a failure and reports it', () => {
  const ran = [];
  const outcome = runCommands([['a'], ['b'], ['c']], ([name]) => {
    ran.push(name);
    return { status: name === 'b' ? 3 : 0, signal: null };
  });
  assert.deepEqual(ran, ['a', 'b', 'c']);
  assert.deepEqual(outcome, { status: 3, signal: null });
});

test('running commands stops when a child is reported killed by a signal', () => {
  const ran = [];
  const outcome = runCommands([['a'], ['b']], ([name]) => {
    ran.push(name);
    return { status: null, signal: 'SIGTERM' };
  });
  assert.deepEqual(ran, ['a']);
  assert.equal(outcome.signal, 'SIGTERM');
});

const SIGNAL_TESTS = { skip: process.platform === 'win32' ? 'Windows reports no terminating signal' : false };
const writeMarker = (marker) => ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`];

test('running commands stops after a real child dies from a signal', SIGNAL_TESTS, async () => {
  const marker = join(await makeTemp(), 'later-command-ran');
  const outcome = runCommands(
    [['-e', "process.kill(process.pid, 'SIGKILL')"], writeMarker(marker)],
    (args) => spawnSync(process.execPath, args),
  );
  assert.equal(outcome.signal, 'SIGKILL');
  assert.equal(existsSync(marker), false, 'a command ran after the signal');
});

test('running commands cannot tell a real child that caught a signal from a failing one', SIGNAL_TESTS, async () => {
  const marker = join(await makeTemp(), 'later-command-ran');
  const catchesSigterm = "process.on('SIGTERM', () => process.exit(1)); process.kill(process.pid, 'SIGTERM'); setTimeout(() => {}, 5_000);";
  const outcome = runCommands(
    [['-e', catchesSigterm], writeMarker(marker)],
    (args) => spawnSync(process.execPath, args),
  );
  // What `node --test` does on SIGTERM: the caller sees an exit status and no signal, so the run carries on.
  assert.deepEqual(outcome, { status: 1, signal: null });
  assert.equal(existsSync(marker), true, 'the later command did not run');
});

test('running commands rethrows a process that could not start', () => {
  assert.throws(() => runCommands([['a']], () => ({ error: new Error('spawn failed') })), /spawn failed/);
});

test('root test runner runs every discovered file on this Node version', async () => {
  const root = await writeFixtureRepo({
    'install/first.test.mjs': passingTest('first fixture test ran'),
    'skills/fixture/tests/second.test.mjs': passingTest('second fixture test ran'),
  });

  const result = runFixtureRunner(join(root, 'install', 'run-tests.mjs'));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /first fixture test ran/);
  assert.match(result.stdout, /second fixture test ran/);
});

test('root test runner exits non-zero when a discovered file fails, after running the rest', async () => {
  const root = await writeFixtureRepo({
    'install/first.test.mjs': failingTest('failing fixture test'),
    'skills/fixture/tests/second.test.mjs': passingTest('second fixture test ran'),
  });

  const result = runFixtureRunner(join(root, 'install', 'run-tests.mjs'));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /second fixture test ran/);
});

test('root test runner CLI runs when its directory is reached through a symlink', async () => {
  const root = await writeFixtureRepo({
    'skills/fixture/tests/linked.test.mjs': passingTest('linked fixture test ran'),
  });
  const linkedInstall = join(await makeTemp(), 'install');
  await symlink(join(root, 'install'), linkedInstall, process.platform === 'win32' ? 'junction' : 'dir');

  const result = runFixtureRunner(join(linkedInstall, 'run-tests.mjs'));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  // Exiting 0 without running anything is the regression: it reads as a passing suite.
  assert.match(result.stdout, /linked fixture test ran/);
});
