import assert from 'node:assert/strict';
import { cp, copyFile, mkdtemp, mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  classifyDestination,
  installPath,
  parseArgs,
  resolveSkillSelection,
} from './index.mjs';

const makeTemp = () => mkdtemp(join(tmpdir(), 'skills-installer-test-'));

async function makeSkill(root, name = 'demo') {
  const skill = join(root, name);
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), `---\nname: ${name}\ndescription: demo\n---\n`, 'utf8');
  return skill;
}

test('parseArgs accepts every documented command and install flag', () => {
  assert.deepEqual(parseArgs([]), {
    command: 'install', yes: false, copy: false, all: false, help: false,
  });
  assert.deepEqual(parseArgs(['install', '--yes', '--copy', '--all']), {
    command: 'install', yes: true, copy: true, all: true, help: false,
  });
  assert.equal(parseArgs(['list']).command, 'list');
  assert.equal(parseArgs(['doctor']).command, 'doctor');
  assert.deepEqual(parseArgs(['uninstall', '-y']), {
    command: 'uninstall', yes: true, copy: false, all: false, help: false,
  });
  assert.equal(parseArgs(['help']).help, true);
  assert.equal(parseArgs(['--help']).help, true);
});

test('parseArgs rejects unknown commands, flags, duplicates, and incompatible flags', () => {
  const invalid = [
    ['wat'],
    ['--wat'],
    ['list', 'doctor'],
    ['list', '--yes'],
    ['doctor', '--all'],
    ['uninstall', '--copy'],
    ['--copy'],
    ['--all'],
    ['--yes', '-y'],
    ['--copy', '--copy'],
    ['--help', '-h'],
  ];
  for (const args of invalid) {
    assert.throws(() => parseArgs(args), { name: 'UsageError' }, args.join(' '));
  }
});

test('resolveSkillSelection rejects incompatible direct skills and dependencies', () => {
  const skills = [
    { name: 'portable', depends: [] },
    { name: 'mac-only', platform: 'darwin', depends: [] },
    { name: 'needs-mac', depends: ['mac-only'] },
  ];
  assert.deepEqual(resolveSkillSelection(['portable'], skills, 'linux'), {
    selection: ['portable'], added: [],
  });
  assert.throws(
    () => resolveSkillSelection(['mac-only'], skills, 'linux'),
    /mac-only.*darwin-only.*linux/,
  );
  assert.throws(
    () => resolveSkillSelection(['needs-mac'], skills, 'linux'),
    /mac-only.*darwin-only.*linux/,
  );
});

test('installPath replaces only an owned link or marked managed copy', async () => {
  const root = await makeTemp();
  const source = await makeSkill(join(root, 'source'));
  const linked = join(root, 'targets', 'linked');
  await mkdir(dirname(linked), { recursive: true });
  await symlink(source, linked, process.platform === 'win32' ? 'junction' : 'dir');

  assert.equal((await classifyDestination(source, linked, 'dir')).state, 'owned-link');
  const linkedResult = await installPath({ source, dest: linked, kind: 'dir', mode: 'copy' });
  assert.equal(linkedResult.status, 'copied');
  assert.equal((await classifyDestination(source, linked, 'dir')).state, 'owned-copy');
  assert.match(await readFile(join(linked, 'SKILL.md'), 'utf8'), /name: demo/);

  const managedResult = await installPath({ source, dest: linked, kind: 'dir', mode: 'link' });
  assert.equal(managedResult.status, 'linked');
  assert.equal(resolve(dirname(linked), await readlink(linked)), source);

  const identical = join(root, 'targets', 'identical');
  await mkdir(identical, { recursive: true });
  await writeFile(join(identical, 'SKILL.md'), await readFile(join(source, 'SKILL.md')));
  assert.equal((await classifyDestination(source, identical, 'dir')).state, 'identical-copy');
  const identicalResult = await installPath({ source, dest: identical, kind: 'dir', mode: 'link' });
  assert.equal(identicalResult.status, 'conflict');
  assert.match(await readFile(join(identical, 'SKILL.md'), 'utf8'), /name: demo/);
});

test('installPath preserves foreign links, foreign copies, and edited managed copies', async () => {
  const root = await makeTemp();
  const source = await makeSkill(join(root, 'source'));
  const foreignSource = await makeSkill(join(root, 'foreign-source'), 'foreign');
  const targetRoot = join(root, 'targets');
  await mkdir(targetRoot, { recursive: true });

  const foreignLink = join(targetRoot, 'foreign-link');
  await symlink(foreignSource, foreignLink, process.platform === 'win32' ? 'junction' : 'dir');
  const linkResult = await installPath({ source, dest: foreignLink, kind: 'dir', mode: 'copy' });
  assert.equal(linkResult.status, 'conflict');
  assert.equal(resolve(dirname(foreignLink), await readlink(foreignLink)), foreignSource);

  const foreignCopy = join(targetRoot, 'foreign-copy');
  await mkdir(foreignCopy);
  await writeFile(join(foreignCopy, 'notes.txt'), 'keep me', 'utf8');
  const copyResult = await installPath({ source, dest: foreignCopy, kind: 'dir', mode: 'copy' });
  assert.equal(copyResult.status, 'conflict');
  assert.equal(await readFile(join(foreignCopy, 'notes.txt'), 'utf8'), 'keep me');

  const managed = join(targetRoot, 'managed');
  assert.equal((await installPath({ source, dest: managed, kind: 'dir', mode: 'copy' })).status, 'copied');
  await writeFile(join(managed, 'local-notes.txt'), 'my edit', 'utf8');
  assert.equal((await classifyDestination(source, managed, 'dir')).state, 'edited-copy');
  const editedResult = await installPath({ source, dest: managed, kind: 'dir', mode: 'copy' });
  assert.equal(editedResult.status, 'conflict');
  assert.equal(await readFile(join(managed, 'local-notes.txt'), 'utf8'), 'my edit');
});

test('installPath backs up a conflict only when explicitly requested', async () => {
  const root = await makeTemp();
  const source = await makeSkill(join(root, 'source'));
  const dest = join(root, 'targets', 'demo');
  await mkdir(dest, { recursive: true });
  await writeFile(join(dest, 'notes.txt'), 'keep me', 'utf8');

  const result = await installPath({
    source,
    dest,
    kind: 'dir',
    mode: 'copy',
    onConflict: 'backup',
    now: new Date('2026-11-19T12:34:56.000Z'),
  });
  assert.equal(result.status, 'copied');
  assert.equal(result.previousState, 'foreign-copy');
  assert.match(result.backup, /demo\.backup-20261119T123456Z$/);
  assert.equal(await readFile(join(result.backup, 'notes.txt'), 'utf8'), 'keep me');
  assert.match(await readFile(join(dest, 'SKILL.md'), 'utf8'), /name: demo/);
});

test('real CLI skips skill and agent conflicts noninteractively and exits visibly', async () => {
  const home = await makeTemp();
  const claude = join(home, '.claude');
  const skill = join(claude, 'skills', 'adr');
  const agent = join(claude, 'agents', 'code-archaeologist.md');
  await mkdir(skill, { recursive: true });
  await mkdir(dirname(agent), { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), 'foreign skill', 'utf8');
  await writeFile(agent, 'foreign agent', 'utf8');

  const result = spawnSync(process.execPath, ['install/index.mjs', '--yes', '--copy'], {
    cwd: resolve('.'),
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /conflict/i);
  assert.equal(await readFile(join(skill, 'SKILL.md'), 'utf8'), 'foreign skill');
  assert.equal(await readFile(agent, 'utf8'), 'foreign agent');
  assert.match(await readFile(join(claude, 'skills', 'bookkeeper', 'SKILL.md'), 'utf8'), /name: bookkeeper/);
});

test('--all --yes forces every platform even when none is detected', async () => {
  const home = await makeTemp();
  const result = spawnSync(process.execPath, ['install/index.mjs', '--yes', '--copy', '--all'], {
    cwd: resolve('.'),
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const rel of [
    ['.claude', 'skills', 'adr', 'SKILL.md'],
    ['.codex', 'skills', 'adr', 'SKILL.md'],
    ['.copilot', 'skills', 'adr', 'SKILL.md'],
    ['.tabnine', 'agent', 'skills', 'adr', 'SKILL.md'],
    ['.agents', 'skills', 'adr', 'SKILL.md'],
  ]) {
    assert.match(await readFile(join(home, ...rel), 'utf8'), /name: adr/);
  }
});

test('unknown CLI input fails before creating installation directories', async () => {
  const home = await makeTemp();
  const result = spawnSync(process.execPath, ['install/index.mjs', 'wat'], {
    cwd: resolve('.'),
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr + result.stdout, /Unknown command.*wat/);
});

test('uninstall --yes preserves unmarked identical skill and agent copies', async () => {
  const home = await makeTemp();
  const skill = join(home, '.claude', 'skills', 'adr');
  const agent = join(home, '.claude', 'agents', 'code-archaeologist.md');
  await mkdir(dirname(skill), { recursive: true });
  await mkdir(dirname(agent), { recursive: true });
  await cp(resolve('skills/adr'), skill, { recursive: true });
  await copyFile(resolve('agents/code-archaeologist.md'), agent);

  const result = spawnSync(process.execPath, ['install/index.mjs', 'uninstall', '--yes'], {
    cwd: resolve('.'),
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /kept \(identical-copy\)/);
  assert.match(await readFile(join(skill, 'SKILL.md'), 'utf8'), /name: adr/);
  assert.match(await readFile(agent, 'utf8'), /name: code-archaeologist/);
});
