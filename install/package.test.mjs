import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

test('the packed package has one auto-selected bin that invokes the installer', async () => {
  const root = resolve('.');
  const temporary = await mkdtemp(join(tmpdir(), 'skills-npx-'));
  const cache = await mkdtemp(join(tmpdir(), 'skills-npx-cache-'));
  try {
    assert(process.env.npm_execpath, 'package test must run through npm so npm_execpath is available');
    const packed = spawnSync(process.execPath, [
      process.env.npm_execpath,
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      temporary,
    ], {
      cwd: root,
      env: { ...process.env, npm_config_cache: cache },
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stdout + packed.stderr);
    const [{ filename }] = JSON.parse(packed.stdout);
    const invoked = spawnSync(process.execPath, [
      process.env.npm_execpath,
      'exec',
      '--yes',
      `file:${join(temporary, filename)}`,
      '--',
      '--help',
    ], {
      cwd: temporary,
      env: { ...process.env, npm_config_cache: cache },
      encoding: 'utf8',
    });
    assert.equal(invoked.status, 0, invoked.stdout + invoked.stderr);
    assert.match(invoked.stdout, /install-skills/);
    assert.match(invoked.stdout, /interactive install/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});
