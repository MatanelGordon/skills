import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('npm package manifest is an allowlist and excludes sanctioned scratch trees', async () => {
  const root = resolve('.');
  const scratch = join(root, 'skills', 'package-test-workspace');
  const cache = await mkdtemp(join(tmpdir(), 'skills-npm-cache-'));
  await mkdir(join(scratch, 'skill-snapshot'), { recursive: true });
  await writeFile(join(scratch, 'skill-snapshot', 'SKILL.md'), 'must not ship', 'utf8');
  try {
    const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(packageJson.bin), ['install-skills']);
    const councilTest = 'skills/council/tests/council-protocol.test.mjs';
    assert.equal(packageJson.scripts['test:council'], `node --test ${councilTest}`);
    assert.match(packageJson.scripts.test, new RegExp(`(?:^| )${councilTest.replaceAll('.', '\\.')}(?: |$)`));
    assert.doesNotMatch(packageJson.scripts.test, /skills\/council\/tests\/\*/);
    assert(process.env.npm_execpath, 'package test must run through npm so npm_execpath is available');
    const packed = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      env: { ...process.env, npm_config_cache: cache },
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stdout + packed.stderr);
    const [manifest] = JSON.parse(packed.stdout);
    const paths = manifest.files.map((entry) => entry.path);
    assert(!paths.some((path) => path.startsWith('skills/package-test-workspace/')), paths.join('\n'));
    assert(!paths.some((path) => path.startsWith('skills/rank-workspace/')), paths.join('\n'));
    assert(!paths.some((path) => path.startsWith('.github/')), paths.join('\n'));
    assert(!paths.some((path) => path.startsWith('tools/browser-capture/node_modules/')), paths.join('\n'));
    for (const required of [
      'install/index.mjs',
      'install/validate.mjs',
      'install/run-evals.mjs',
      'agents/code-archaeologist.md',
      'skills/adr/SKILL.md',
      'skills/adr/evals/evals.json',
      'tools/browser-capture/cli.mjs',
      'tools/browser-capture/test.mjs',
      'tools/browser-capture/package.json',
      'tools/browser-capture/npm-shrinkwrap.json',
    ]) assert(paths.includes(required), `missing ${required}`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('the packed package installs exactly one usable npx bin', async () => {
  const root = resolve('.');
  const temporary = await mkdtemp(join(tmpdir(), 'skills-npx-'));
  const archive = join(temporary, 'archive');
  const consumer = join(temporary, 'consumer');
  const cache = await mkdtemp(join(tmpdir(), 'skills-npx-cache-'));
  try {
    await mkdir(archive);
    await mkdir(consumer);
    assert(process.env.npm_execpath, 'package test must run through npm so npm_execpath is available');
    const npxCli = join(dirname(process.env.npm_execpath), 'npx-cli.js');
    assert.ok((await readFile(npxCli)).byteLength > 0, 'npm installation does not include its sibling npx-cli.js');
    const packed = spawnSync(process.execPath, [
      process.env.npm_execpath,
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      archive,
    ], {
      cwd: root,
      env: { ...process.env, npm_config_cache: cache },
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stdout + packed.stderr);
    const manifests = JSON.parse(packed.stdout);
    assert.equal(manifests.length, 1, 'npm pack must produce exactly one package manifest');
    const archiveEntries = await readdir(archive, { withFileTypes: true });
    const tarballs = archiveEntries.filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'));
    assert.equal(
      tarballs.length,
      1,
      `npm pack must write exactly one regular .tgz; found: ${archiveEntries.map((entry) => entry.name).join(', ')}`,
    );
    const tarball = join(archive, tarballs[0].name);
    assert.equal((await readFile(tarball)).byteLength, manifests[0].size, 'packed archive size does not match npm output');
    const installed = spawnSync(process.execPath, [
      process.env.npm_execpath,
      'install',
      '--ignore-scripts',
      '--prefix',
      consumer,
      '--cache',
      cache,
      tarball,
    ], {
      cwd: consumer,
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
    const installedPackage = JSON.parse(await readFile(
      join(consumer, 'node_modules', '@matanelgordon', 'skills', 'package.json'),
      'utf8',
    ));
    assert.equal(installedPackage.version, manifests[0].version);
    assert.deepEqual(Object.keys(installedPackage.bin || {}), ['install-skills']);
    const invoked = spawnSync(process.execPath, [
      npxCli,
      '--no-install',
      '--prefix',
      consumer,
      'install-skills',
      '--help',
    ], {
      cwd: consumer,
      env: { ...process.env, npm_config_cache: cache },
      encoding: 'utf8',
    });
    assert.equal(invoked.status, 0, invoked.stdout + invoked.stderr);
    assert.match(invoked.stdout, /install-skills/);
    assert.match(invoked.stdout, /interactive install/);
    assert.equal((await readFile(tarball)).byteLength, manifests[0].size, 'npx moved or changed the packed archive');
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});
