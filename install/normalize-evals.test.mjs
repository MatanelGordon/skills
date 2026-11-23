import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkRepositoryEvals, normalizeRepository } from './normalize-evals.mjs';

const CLI = fileURLToPath(new URL('./normalize-evals.mjs', import.meta.url));
const makeTemp = () => mkdtemp(join(tmpdir(), 'skills-normalize-evals-test-'));
const runCli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

async function put(root, relativePath, content) {
  const file = join(root, ...relativePath.split('/'));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}
const read = (root, relativePath) => readFile(join(root, ...relativePath.split('/')), 'utf8');
const readJson = async (root, relativePath) => JSON.parse(await read(root, relativePath));

/** Every file under root, as sorted forward-slash paths with their content: the whole tree in one value. */
async function snapshot(root, prefix = '') {
  const entries = await readdir(join(root, ...prefix.split('/').filter(Boolean)), { withFileTypes: true });
  const nested = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? snapshot(root, path) : [[path, await read(root, path)]];
  }));
  return nested.flat();
}

const INLINE_FIXTURE = 'ROUND-1 FIXTURE\n\nSkeptic\nVOTE: A\n';
const messyCases = () => [
  { id: 1, prompt: 'p1', expected_output: 'e1', expectations: ['One.'] },
  { id: 2, prompt: 'p2', expected_output: 'e2', files: [{ path: 'package.json', content: '{"a":1}' }], expectations: ['Two.'] },
  { id: 3, prompt: 'p3', expected_output: 'e3', files: [INLINE_FIXTURE], expectations: ['Three.'] },
  { id: 4, prompt: 'p4', expected_output: 'e4', files: ['evals/fixtures/discount.diff', 'references/rust.md'], expectations: ['Four.'] },
];

async function writeMessyRepo() {
  const root = await makeTemp();
  await put(root, 'skills/messy/SKILL.md', '---\nname: messy\ndescription: A fixture.\n---\n# Messy\n');
  await put(root, 'skills/messy/evals/evals.json', JSON.stringify({ skill_name: 'messy', evals: messyCases() }));
  await put(root, 'skills/messy/evals/fixtures/discount.diff', '+ discount\n');
  await put(root, 'skills/messy/references/rust.md', '# Rust adapter\n');
  await put(root, 'agents/reviewer.md', '---\nname: reviewer\ndescription: A fixture.\n---\n');
  await put(root, 'agents/reviewer.evals.json', JSON.stringify({
    agent_name: 'reviewer',
    evals: [{ id: 1, prompt: 'p', expected_output: 'e', expectations: ['Agent one.'] }],
  }));
  return root;
}

test('normalising a repository rewrites every eval file and creates its fixtures', async () => {
  const root = await writeMessyRepo();
  const results = await normalizeRepository(root);
  assert.deepEqual(results.map((result) => [result.scope, result.changed, result.problems]), [
    ['messy', true, []],
    ['agents/reviewer.evals.json', true, []],
  ]);

  const doc = await readJson(root, 'skills/messy/evals/evals.json');
  assert.deepEqual(doc.evals.map((evaluation) => evaluation.files), [
    [],
    ['evals/files/2/package.json'],
    ['evals/files/3/fixture-1.txt'],
    ['evals/files/4/discount.diff', 'evals/files/4/rust.md'],
  ]);
  for (const evaluation of doc.evals) assert.deepEqual(evaluation.assertions, evaluation.expectations);

  assert.equal(await read(root, 'skills/messy/evals/files/2/package.json'), '{"a":1}');
  assert.equal(await read(root, 'skills/messy/evals/files/3/fixture-1.txt'), INLINE_FIXTURE);
  assert.equal(await read(root, 'skills/messy/evals/files/4/discount.diff'), '+ discount\n');
  assert.equal(await read(root, 'skills/messy/evals/files/4/rust.md'), '# Rust adapter\n');
  assert.equal(existsSync(join(root, 'skills', 'messy', 'evals', 'fixtures')), false, 'the emptied fixtures folder is removed');
  assert.equal(await read(root, 'skills/messy/references/rust.md'), '# Rust adapter\n', 'a skill file is copied, never moved');

  const agent = await readJson(root, 'agents/reviewer.evals.json');
  assert.deepEqual(agent.evals[0].files, []);
  assert.deepEqual(agent.evals[0].assertions, ['Agent one.']);
});

test('a second run changes nothing: same bytes, no rewrites', async () => {
  const root = await writeMessyRepo();
  await normalizeRepository(root);
  const afterFirst = await snapshot(root);

  const second = await normalizeRepository(root);
  assert.deepEqual(second.map((result) => [result.changed, result.problems]), [[false, []], [false, []]]);
  assert.deepEqual(await snapshot(root), afterFirst);
});

test('check mode reports pending work without writing anything', async () => {
  const root = await writeMessyRepo();
  const before = await snapshot(root);

  const pending = await normalizeRepository(root, { write: false });
  assert.deepEqual(pending.map((result) => result.changed), [true, true]);
  assert.deepEqual(await snapshot(root), before);

  const cliPending = runCli('--check', '--root', root);
  assert.equal(cliPending.status, 1, cliPending.stdout + cliPending.stderr);
  assert.match(cliPending.stdout + cliPending.stderr, /messy/);
  assert.deepEqual(await snapshot(root), before);

  const cliWrite = runCli('--root', root);
  assert.equal(cliWrite.status, 0, cliWrite.stdout + cliWrite.stderr);
  const cliClean = runCli('--check', '--root', root);
  assert.equal(cliClean.status, 0, cliClean.stdout + cliClean.stderr);
});

test('a fixture that already exists with other content is never overwritten', async () => {
  const root = await writeMessyRepo();
  await put(root, 'skills/messy/evals/files/2/package.json', '{"someone":"else"}');
  const evalsBefore = await read(root, 'skills/messy/evals/evals.json');

  const [messy] = await normalizeRepository(root);
  assert.equal(messy.problems.length, 1);
  assert.match(messy.problems[0], /evals\/files\/2\/package\.json already exists with different content/);
  assert.equal(await read(root, 'skills/messy/evals/files/2/package.json'), '{"someone":"else"}');
  assert.equal(await read(root, 'skills/messy/evals/evals.json'), evalsBefore, 'the dataset is not rewritten to point at a file it did not write');

  const cli = runCli('--root', root);
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
});

test('a fixture that already exists with the same content is accepted, and a moved source is removed', async () => {
  const root = await writeMessyRepo();
  await put(root, 'skills/messy/evals/files/2/package.json', '{"a":1}');
  await put(root, 'skills/messy/evals/files/4/discount.diff', '+ discount\n');

  const [messy] = await normalizeRepository(root);
  assert.deepEqual(messy.problems, []);
  assert.equal(existsSync(join(root, 'skills', 'messy', 'evals', 'fixtures', 'discount.diff')), false);
});

test('what the normaliser cannot repair is reported and the rest is still normalised', async () => {
  const root = await makeTemp();
  await put(root, 'skills/half/SKILL.md', '---\nname: half\ndescription: A fixture.\n---\n');
  await put(root, 'skills/half/evals/evals.json', JSON.stringify({
    skill_name: 'half',
    evals: [
      { id: 1, prompt: 'p', expected_output: 'e', expectations: ['One.'] },
      { id: 2, prompt: 'p', expected_output: 'e', files: ['docs/nowhere.md'], assertions: ['A.'], expectations: ['B.'] },
    ],
  }));

  const [half] = await normalizeRepository(root);
  assert.equal(half.problems.length, 2);
  const doc = await readJson(root, 'skills/half/evals/evals.json');
  assert.deepEqual(doc.evals[0].assertions, ['One.']);
  assert.deepEqual(doc.evals[1].files, ['docs/nowhere.md']);
  assert.deepEqual(doc.evals[1].expectations, ['B.']);
  assert.equal(runCli('--root', root).status, 1);
});

test('invalid JSON stops the run with the file named', async () => {
  const root = await writeMessyRepo();
  await put(root, 'skills/messy/evals/evals.json', '{ not json');
  const cli = runCli('--root', root);
  assert.equal(cli.status, 2, cli.stdout + cli.stderr);
  assert.match(cli.stderr, /skills[\\/]messy[\\/]evals[\\/]evals\.json/);
});

test('unknown flags and a missing repository are usage errors', async () => {
  assert.equal(runCli('--nope').status, 2);
  const empty = await makeTemp();
  const cli = runCli('--root', empty);
  assert.equal(cli.status, 2, cli.stdout + cli.stderr);
  assert.match(cli.stderr, /skills/);
});

test('the repository check reports format errors per file and count shortfalls as warnings', async () => {
  const root = await writeMessyRepo();
  const before = await checkRepositoryEvals(root);
  assert.ok(before.errors.some(({ scope, message }) => scope === 'messy' && /eval 1: files must be a list/.test(message)));
  assert.ok(before.errors.some(({ scope, message }) => scope === 'messy' && /eval 4: files\[1\] "references\/rust\.md" must start with evals\/files\//.test(message)));
  assert.ok(before.errors.some(({ scope }) => scope === 'agents/reviewer.evals.json'));
  assert.ok(before.warnings.some(({ scope, message }) => scope === 'messy' && /normalize-evals/.test(message)));

  await normalizeRepository(root);
  const after = await checkRepositoryEvals(root);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(after.warnings.map(({ scope, message }) => [scope, message.split(';')[0].split(' (')[0]]), [
    ['messy', '4 cases'],
    ['messy', 'no negative case'],
  ]);
});

test('the repository check sees a missing fixture and tolerates a CRLF checkout', async () => {
  const root = await writeMessyRepo();
  await normalizeRepository(root);
  const evalsPath = 'skills/messy/evals/evals.json';
  await put(root, evalsPath, (await read(root, evalsPath)).replaceAll('\n', '\r\n'));
  const crlf = await checkRepositoryEvals(root);
  assert.deepEqual(crlf.errors, []);
  assert.ok(!crlf.warnings.some(({ message }) => /normalize-evals/.test(message)), 'CRLF alone is not a layout difference');

  const doc = await readJson(root, evalsPath);
  const broken = { ...doc, evals: doc.evals.map((evaluation) => (evaluation.id === 1 ? { ...evaluation, files: ['evals/files/1/gone.txt'] } : evaluation)) };
  await put(root, evalsPath, `${JSON.stringify(broken, null, 2)}\n`);
  const missing = await checkRepositoryEvals(root);
  assert.equal(missing.errors.length, 1);
  assert.match(missing.errors[0].message, /eval 1: files\[0\] "evals\/files\/1\/gone\.txt" does not exist/);
});

test('a symlinked fixture is rejected by the check', { skip: process.platform === 'win32' }, async () => {
  const root = await writeMessyRepo();
  await normalizeRepository(root);
  const outside = await put(root, 'outside.txt', 'secret\n');
  await mkdir(join(root, 'skills', 'messy', 'evals', 'files', '1'), { recursive: true });
  await symlink(outside, join(root, 'skills', 'messy', 'evals', 'files', '1', 'link.txt'));
  const evalsPath = 'skills/messy/evals/evals.json';
  const doc = await readJson(root, evalsPath);
  const linked = { ...doc, evals: doc.evals.map((evaluation) => (evaluation.id === 1 ? { ...evaluation, files: ['evals/files/1/link.txt'] } : evaluation)) };
  await put(root, evalsPath, `${JSON.stringify(linked, null, 2)}\n`);

  const result = await checkRepositoryEvals(root);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /is not a regular file/);
});

test('the check skips a file it cannot parse, which the validator already reports', async () => {
  const root = await writeMessyRepo();
  await put(root, 'skills/messy/evals/evals.json', '{ not json');
  const result = await checkRepositoryEvals(root);
  assert.ok(!result.errors.some(({ scope }) => scope === 'messy'));
});

test('normaliser CLI runs when its directory is reached through a symlink', async () => {
  const linkedInstall = join(await makeTemp(), 'install');
  await symlink(dirname(CLI), linkedInstall, process.platform === 'win32' ? 'junction' : 'dir');
  const root = await writeMessyRepo();
  const result = spawnSync(process.execPath, [join(linkedInstall, 'normalize-evals.mjs'), '--root', root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /2 rewritten/);
});
