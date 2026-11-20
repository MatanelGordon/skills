#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const protocol = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scripts', 'mutation-protocol.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'mutation-roundtrip-'));
const repository = join(scratch, 'calculator');
const candidateWorktree = join(scratch, 'candidate-worktree');
const unsafeWorktree = join(scratch, 'unsafe-worktree');
const emptyGitConfig = join(scratch, 'empty-gitconfig');
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: emptyGitConfig };

function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function tests(cwd, expectedStatus = 0) {
  const result = spawnSync(process.execPath, ['--test'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
  return result;
}

function guard(args, expectedStatus) {
  const result = spawnSync(process.execPath, [protocol, 'git-import', ...args], {
    encoding: 'utf8',
    env: gitEnv,
  });
  assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
  return result;
}

try {
  await writeFile(emptyGitConfig, '');
  await mkdir(join(repository, 'src'), { recursive: true });
  await mkdir(join(repository, 'tests'), { recursive: true });
  await writeFile(join(repository, 'package.json'), '{"type":"module"}\n');
  await writeFile(
    join(repository, 'src', 'calculator.js'),
    'export const withinDisplayLimit = (value) => value <= 50;\n',
  );
  await writeFile(join(repository, 'tests', 'calculator.test.js'), [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    "import { withinDisplayLimit } from '../src/calculator.js';",
    "test('values around the display limit', () => {",
    '  assert.equal(withinDisplayLimit(49), true);',
    '  assert.equal(withinDisplayLimit(51), false);',
    '});',
    '',
  ].join('\n'));
  git(repository, ['init', '-q', '-b', 'feature']);
  git(repository, ['config', 'user.name', 'Mutation Smoke']);
  git(repository, ['config', 'user.email', 'mutation-smoke@example.invalid']);
  git(repository, ['config', 'commit.gpgsign', 'false']);
  git(repository, ['add', '-A']);
  git(repository, ['commit', '-qm', 'frozen green']);
  const frozen = git(repository, ['rev-parse', 'HEAD']);
  tests(repository);

  git(repository, ['worktree', 'add', '-q', '-b', 'mutation-candidate', candidateWorktree, frozen]);
  await writeFile(join(candidateWorktree, 'tests', 'limit-boundary.test.js'), [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    "import { withinDisplayLimit } from '../src/calculator.js';",
    "test('the exact display limit is accepted', () => {",
    '  assert.equal(withinDisplayLimit(50), true);',
    '});',
    '',
  ].join('\n'));
  tests(candidateWorktree);
  git(candidateWorktree, ['add', 'tests/limit-boundary.test.js']);
  git(candidateWorktree, ['commit', '-qm', 'test: cover exact display limit']);
  const candidate = git(candidateWorktree, ['rev-parse', 'HEAD']);

  git(repository, ['worktree', 'add', '-q', '-b', 'unsafe-candidate', unsafeWorktree, frozen]);
  await writeFile(join(unsafeWorktree, 'src', 'calculator.js'), 'export const withinDisplayLimit = () => true;\n');
  await writeFile(join(unsafeWorktree, 'tests', 'unsafe.test.js'), 'unsafe candidate\n');
  git(unsafeWorktree, ['add', '-A']);
  git(unsafeWorktree, ['commit', '-qm', 'unsafe production and test']);
  const unsafe = git(unsafeWorktree, ['rev-parse', 'HEAD']);
  const rejection = guard([
    '--repo', repository, '--approved', frozen, '--integration', frozen,
    '--candidate', unsafe, '--allow', 'tests/**',
  ], 1);
  assert.equal(JSON.parse(rejection.stderr).code, 'IMPORT_REJECTED');

  const accepted = guard([
    '--repo', repository, '--approved', frozen, '--integration', frozen,
    '--candidate', candidate, '--allow', 'tests/**',
  ], 0);
  const verdict = JSON.parse(accepted.stdout);
  assert.deepEqual(verdict.changed, ['tests/limit-boundary.test.js']);

  git(repository, ['restore', `--source=${verdict.candidate}`, '--staged', '--worktree', '--', ...verdict.changed]);
  const productionDiff = spawnSync('git', [
    '-C', repository, 'diff', '--quiet', '--no-ext-diff', '--no-relative',
    '--ignore-submodules=none', '--no-renames', frozen, '--', '.', ':(exclude,glob)tests/**',
  ], { env: gitEnv });
  assert.equal(productionDiff.status, 0, 'test-only restore changed production');
  git(repository, ['commit', '-qm', 'test: import reviewed mutation remediation']);
  const integrated = git(repository, ['rev-parse', 'HEAD']);
  guard([
    '--repo', repository, '--approved', frozen, '--integration', frozen,
    '--candidate', integrated, '--allow', 'tests/**',
  ], 0);
  tests(repository);

  const productionPath = join(repository, 'src', 'calculator.js');
  const cleanProduction = await readFile(productionPath, 'utf8');
  await writeFile(productionPath, cleanProduction.replace('<=', '<'));
  tests(repository, 1);
  await writeFile(productionPath, cleanProduction);
  tests(repository);
  assert.equal(git(repository, ['status', '--short']), '');

  process.stdout.write(`${JSON.stringify({
    fixture: 'calculator',
    frozen,
    candidate,
    integrated,
    rejectedUnsafeCandidate: unsafe,
    imported: verdict.changed,
    targetedFault: '<= to < at the public display limit',
    result: 'passed',
  }, null, 2)}\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
