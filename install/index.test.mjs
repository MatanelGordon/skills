import assert from 'node:assert/strict';
import { cp, copyFile, mkdtemp, mkdir, readdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isEntryPoint } from './entry-point.mjs';
import {
  classifyDestination,
  installPath,
  parseArgs,
  pruneStaleLinks,
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

test('isEntryPoint recognises only the script Node was started with', () => {
  assert.equal(isEntryPoint(import.meta.url, fileURLToPath(import.meta.url)), true);
  assert.equal(isEntryPoint(import.meta.url, resolve('install/index.mjs')), false);
  // An empty path stands in for a missing argv[1] (REPL, --eval); passing undefined would select the default.
  assert.equal(isEntryPoint(import.meta.url, ''), false);
});

test('isEntryPoint compares paths as written when argv[1] cannot be resolved', async () => {
  // "-" is what argv[1] holds when the program is piped in on stdin; it must not throw at import time.
  assert.equal(isEntryPoint(import.meta.url, '-'), false);
  const missing = join(await makeTemp(), 'gone.mjs');
  assert.equal(isEntryPoint(pathToFileURL(missing).href, missing), true);
});

test('installer runs when its directory is reached through a symlink', async () => {
  const linkedInstall = join(await makeTemp(), 'install');
  await symlink(resolve('install'), linkedInstall, process.platform === 'win32' ? 'junction' : 'dir');

  const result = spawnSync(process.execPath, [join(linkedInstall, 'index.mjs'), '--help'], {
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /install-skills --yes/);
});

test('installer runs through an extensionless file symlink, the shape of an npm bin shim', {
  skip: process.platform === 'win32' ? 'npm installs .cmd shims on Windows, not symlinks' : false,
}, async () => {
  const bin = join(await makeTemp(), 'install-skills');
  await symlink(resolve('install/index.mjs'), bin);

  const result = spawnSync(process.execPath, [bin, '--help'], {
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /install-skills --yes/);
});

const dirLink = process.platform === 'win32' ? 'junction' : 'dir';

/** A source root with one live skill, and an agent folder to prune. */
async function pruneFixture() {
  const root = await makeTemp();
  const sourceRoot = join(root, 'repo', 'skills');
  await makeSkill(sourceRoot, 'live');
  const agentDir = join(root, 'agent-skills');
  await mkdir(agentDir, { recursive: true });
  return { root, sourceRoot, agentDir };
}

test('pruneStaleLinks removes a link into the source root whose target is gone, and reports it', async () => {
  const { sourceRoot, agentDir } = await pruneFixture();
  const gone = await makeSkill(sourceRoot, 'gone');
  await symlink(gone, join(agentDir, 'gone'), dirLink);
  await symlink(join(sourceRoot, 'live'), join(agentDir, 'live'), dirLink);
  await rm(gone, { recursive: true });

  const pruned = await pruneStaleLinks(agentDir, sourceRoot);
  assert.deepEqual(pruned.map(({ name, target }) => [name, resolve(agentDir, target)]), [['gone', gone]]);
  assert.equal(existsSync(join(agentDir, 'live', 'SKILL.md')), true);
  assert.deepEqual((await readdir(agentDir)).sort(), ['live']);
});

test('pruneStaleLinks removes a relative link into the source root whose target is gone', {
  skip: process.platform === 'win32' ? 'a relative directory symlink needs Developer Mode on Windows; junctions are absolute' : false,
}, async () => {
  const { sourceRoot, agentDir } = await pruneFixture();
  const gone = await makeSkill(sourceRoot, 'gone');
  await symlink(relative(agentDir, gone), join(agentDir, 'gone'), 'dir');
  await rm(gone, { recursive: true });

  assert.deepEqual((await pruneStaleLinks(agentDir, sourceRoot)).map(({ name }) => name), ['gone']);
  assert.deepEqual(await readdir(agentDir), []);
});

test('pruneStaleLinks never touches anything that is not a dangling link into the source root', async () => {
  const { root, sourceRoot, agentDir } = await pruneFixture();
  const foreign = await makeSkill(join(root, 'elsewhere'), 'foreign');
  const lookalike = await makeSkill(join(root, 'repo', 'skills-old'), 'lookalike');
  await symlink(foreign, join(agentDir, 'foreign'), dirLink);
  await symlink(lookalike, join(agentDir, 'lookalike'), dirLink);
  await rm(foreign, { recursive: true });
  await rm(lookalike, { recursive: true });
  await mkdir(join(agentDir, 'real-dir'));
  await writeFile(join(agentDir, 'real-dir', 'notes.txt'), 'keep me', 'utf8');
  await writeFile(join(agentDir, 'real-file'), 'keep me', 'utf8');
  await symlink(join(sourceRoot, 'live'), join(agentDir, 'live'), dirLink);

  assert.deepEqual(await pruneStaleLinks(agentDir, sourceRoot), []);
  assert.deepEqual((await readdir(agentDir)).sort(), ['foreign', 'live', 'lookalike', 'real-dir', 'real-file']);
  assert.equal(await readFile(join(agentDir, 'real-dir', 'notes.txt'), 'utf8'), 'keep me');
});

test('pruneStaleLinks returns nothing for a folder that does not exist', async () => {
  const { root, sourceRoot } = await pruneFixture();
  assert.deepEqual(await pruneStaleLinks(join(root, 'missing'), sourceRoot), []);
});

test('real CLI install prunes dangling links into this repo and keeps foreign ones', async () => {
  const home = await makeTemp();
  const skillsDir = join(home, '.claude', 'skills');
  await mkdir(skillsDir, { recursive: true });
  const retiredTarget = resolve('skills', 'zz-retired-fixture-skill');
  const foreignTarget = join(home, 'elsewhere', 'gone');
  await symlink(retiredTarget, join(skillsDir, 'zz-retired-fixture-skill'), dirLink);
  await symlink(foreignTarget, join(skillsDir, 'foreign-gone'), dirLink);

  const result = spawnSync(process.execPath, ['install/index.mjs', '--yes', '--copy'], {
    cwd: resolve('.'),
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /pruned zz-retired-fixture-skill/);
  const left = await readdir(skillsDir);
  assert.equal(left.includes('zz-retired-fixture-skill'), false);
  assert.equal(left.includes('foreign-gone'), true);
  assert.match(await readFile(join(skillsDir, 'adr', 'SKILL.md'), 'utf8'), /name: adr/);
});

test('real CLI uninstall also prunes dangling links into this repo', async () => {
  const home = await makeTemp();
  const skillsDir = join(home, '.codex', 'skills');
  await mkdir(skillsDir, { recursive: true });
  await symlink(resolve('skills', 'zz-retired-fixture-skill'), join(skillsDir, 'zz-retired-fixture-skill'), dirLink);

  const result = spawnSync(process.execPath, ['install/index.mjs', 'uninstall', '--yes'], {
    cwd: resolve('.'),
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /pruned zz-retired-fixture-skill/);
  assert.deepEqual(await readdir(skillsDir), []);
});
