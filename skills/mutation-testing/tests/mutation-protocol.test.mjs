import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ProtocolError,
  checkProvenance,
  classifyMutationResult,
  validateGitImport,
  validateImportCandidate,
} from '../scripts/mutation-protocol.mjs';

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const protocol = join(skillRoot, 'scripts', 'mutation-protocol.mjs');

function runGit(repository, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: join(repository, '.empty-gitconfig') },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

async function makeRepository() {
  const root = await mkdtemp(join(tmpdir(), 'mutation-protocol-'));
  const repository = join(root, 'repository');
  await mkdir(join(repository, 'src'), { recursive: true });
  await mkdir(join(repository, 'tests'), { recursive: true });
  await mkdir(join(repository, 'drivers'), { recursive: true });
  await writeFile(join(repository, '.empty-gitconfig'), '');
  await writeFile(join(repository, 'src', 'calculator.js'), 'export const add = (a, b) => a + b;\n');
  await writeFile(join(repository, 'tests', 'calculator.test.js'), 'base test\n');
  await writeFile(join(repository, 'drivers', 'aux.c'), 'approved legacy path\n');
  runGit(repository, ['init', '-q', '-b', 'work']);
  runGit(repository, ['config', 'user.name', 'Protocol Test']);
  runGit(repository, ['config', 'user.email', 'protocol@example.invalid']);
  runGit(repository, ['config', 'commit.gpgsign', 'false']);
  runGit(repository, ['add', '-A']);
  runGit(repository, ['commit', '-qm', 'base']);
  return { root, repository, base: runGit(repository, ['rev-parse', 'HEAD']) };
}

async function commitFrom(repository, base, name, mutate, { indexPrepared = false } = {}) {
  runGit(repository, ['checkout', '-qB', name, base]);
  await mutate(repository);
  if (!indexPrepared) runGit(repository, ['add', '-A']);
  runGit(repository, ['commit', '-qm', name]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

function entry(path, overrides = {}) {
  return {
    path,
    status: 'A',
    beforeMode: null,
    afterMode: '100644',
    ...overrides,
  };
}

function cli(args, options = {}) {
  return spawnSync(process.execPath, [protocol, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

test('native engine meanings remain separate from workflow decisions', () => {
  const cases = [
    ['stryker-js', 'Killed', 'detected', 'verified'],
    ['stryker-js', 'Timeout', 'detected', 'verified'],
    ['stryker-js', 'NoCoverage', 'undetected', 'actionable-survivor'],
    ['stryker-js', 'Ignored', 'out-of-scope', 'resolved'],
    ['gremlins', 'SKIPPED', 'out-of-scope', 'resolved'],
    ['cargo-mutants', 'CaughtMutant', 'detected', 'verified'],
    ['cargo-mutants', 'MissedMutant', 'undetected', 'actionable-survivor'],
    ['cargo-mutants', 'Unviable', 'excluded', 'resolved'],
    ['mutmut', 'not checked', 'pending', 'incomplete'],
  ];
  for (const [engine, rawStatus, nativeMeaning, decision] of cases) {
    const result = classifyMutationResult({ engine, rawStatus, mutantId: 'm1', location: 'src/x:1' });
    assert.equal(result.raw.status, rawStatus, `${engine}:${rawStatus} raw status`);
    assert.equal(result.nativeMeaning, nativeMeaning, `${engine}:${rawStatus} native meaning`);
    assert.equal(result.workflowDecision, decision, `${engine}:${rawStatus} decision`);
  }
});

test('equivalent triage resolves an actionable survivor without rewriting raw truth', () => {
  const result = classifyMutationResult({
    engine: 'stryker-js',
    rawStatus: 'Survived',
    mutantId: '42',
    location: 'src/x:1',
    reportSha256: 'abc',
    triage: { disposition: 'equivalent', rationale: 'same public result', reviewer: 'review-1' },
  });
  assert.equal(result.raw.status, 'Survived');
  assert.equal(result.raw.reportSha256, 'abc');
  assert.equal(result.nativeMeaning, 'undetected');
  assert.equal(result.workflowDecision, 'equivalent');
  assert.equal(result.blocksCompletion, false);
});

test('budget exhaustion is incomplete and blocks a complete claim', () => {
  const result = classifyMutationResult({
    engine: 'stryker-js', rawStatus: 'Killed', mutantId: '1', location: 'x:1', budgetExhausted: true,
  });
  assert.equal(result.nativeMeaning, 'detected');
  assert.equal(result.workflowDecision, 'incomplete');
  assert.equal(result.blocksCompletion, true);
});

test('legitimate ecosystem tests and fixture metadata pass the import policy', () => {
  const cases = [
    ['tests/**', 'tests/config.test.js'],
    ['tests/**', 'tests/test_config.py'],
    ['**/*_test.go', 'internal/config/config_test.go'],
    ['tests/**', 'tests/config.rs'],
    ['tests/**', 'tests/fixtures/sample.toml'],
    ['tests/**', 'tests/fixtures/app/package.json'],
    ['**/testdata/**', 'pkg/testdata/request.json'],
    ['**/*Tests.cs', 'src/App/CalculatorTests.cs'],
    ['**/*Test.java', 'src/test/CalculatorTest.java'],
    ['**/__snapshots__/**', 'src/__snapshots__/view.snap'],
    ['**/*.cy.ts', 'app/login.cy.ts'],
    ['tests/**', 'tests/aux.test.js'],
  ];
  for (const [pattern, path] of cases) {
    assert.deepEqual(validateImportCandidate({ allowPatterns: [pattern], entries: [entry(path)] }).changed, [path]);
  }
});

test('runner configuration, dependencies, hidden paths, and new executables fail closed', () => {
  const denied = [
    entry('tests/jest.config.js'),
    entry('tests/karma.conf.js'),
    entry('tests/mocha.opts'),
    entry('tests/noxfile.py'),
    entry('tests/node_modules/helper.test.js'),
    entry('tests/run-all.sh', { afterMode: '100755' }),
    entry('tests/.env'),
  ];
  for (const candidate of denied) {
    assert.throws(
      () => validateImportCandidate({ allowPatterns: ['tests/**'], entries: [candidate] }),
      (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
      candidate.path,
    );
  }
});

test('unsupported or overbroad allow patterns are rejected explicitly', () => {
  for (const pattern of ['tests/**/*.[jt]s', 'tests/?.js', '**/*.{test,spec}.ts', './tests/**', 'tests/', '**/spec/**']) {
    assert.throws(
      () => validateImportCandidate({ allowPatterns: [pattern], entries: [entry('tests/a.test.js')] }),
      (error) => error instanceof ProtocolError && error.code === 'INVALID_ALLOWLIST'
        && error.message.includes(pattern),
      pattern,
    );
  }
});

test('Git import accepts one direct test-only child and ignores approved legacy paths', async (t) => {
  const fixture = await makeRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const candidate = await commitFrom(fixture.repository, fixture.base, 'valid', async (repository) => {
    await writeFile(join(repository, 'tests', 'config.test.js'), 'config behavior\n');
    await mkdir(join(repository, 'tests', 'fixtures'), { recursive: true });
    await writeFile(join(repository, 'tests', 'fixtures', 'sample.toml'), 'fixture = true\n');
  });
  const result = validateGitImport({
    repository: fixture.repository,
    approvedRef: fixture.base,
    integrationRef: fixture.base,
    candidateRef: candidate,
    allowPatterns: ['tests/**'],
  });
  assert.deepEqual(result.changed, ['tests/config.test.js', 'tests/fixtures/sample.toml']);
  assert.equal(result.candidate, candidate);
  assert.equal(result.importMethod, 'git-restore-paths');
});

test('Git import rejects production changes and emits nonzero JSON from the CLI', async (t) => {
  const fixture = await makeRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const candidate = await commitFrom(fixture.repository, fixture.base, 'production', async (repository) => {
    await writeFile(join(repository, 'src', 'calculator.js'), 'export const add = (a, b) => a - b;\n');
    await writeFile(join(repository, 'tests', 'new.test.js'), 'new test\n');
  });
  const result = cli([
    'git-import', `--repo=${fixture.repository}`, `--approved=${fixture.base}`,
    `--integration=${fixture.base}`, `--candidate=${candidate}`, '--allow=tests/**',
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.equal(error.ok, false);
  assert.equal(error.code, 'IMPORT_REJECTED');
  assert.match(error.message, /src\/calculator\.js/);
});

test('Git import rejects a clean tip whose candidate history mutated production', async (t) => {
  const fixture = await makeRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const first = await commitFrom(fixture.repository, fixture.base, 'mutate-first', async (repository) => {
    await writeFile(join(repository, 'src', 'calculator.js'), 'export const add = (a, b) => a - b;\n');
  });
  const candidate = await commitFrom(fixture.repository, first, 'restore-tip', async (repository) => {
    await writeFile(join(repository, 'src', 'calculator.js'), 'export const add = (a, b) => a + b;\n');
    await writeFile(join(repository, 'tests', 'new.test.js'), 'new test\n');
  });
  assert.throws(
    () => validateGitImport({
      repository: fixture.repository,
      approvedRef: fixture.base,
      integrationRef: fixture.base,
      candidateRef: candidate,
      allowPatterns: ['tests/**'],
    }),
    (error) => error instanceof ProtocolError && error.code === 'HISTORY_NOT_IMPORTABLE',
  );
});

test('Git plumbing sees a submodule pointer bump even when .gitmodules says ignore all', async (t) => {
  const fixture = await makeRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const emptyTree = runGit(fixture.repository, ['mktree'], { input: '' });
  const foreignOne = runGit(fixture.repository, ['commit-tree', emptyTree, '-m', 'foreign one']);
  const foreignTwo = runGit(fixture.repository, ['commit-tree', emptyTree, '-p', foreignOne, '-m', 'foreign two']);
  const baseWithSubmodule = await commitFrom(fixture.repository, fixture.base, 'submodule-base', async (repository) => {
    await writeFile(join(repository, '.gitmodules'), '[submodule "vendor/lib"]\n\tpath = vendor/lib\n\turl = ../lib\n\tignore = all\n');
    runGit(repository, ['add', '.gitmodules']);
    runGit(repository, ['update-index', '--add', '--cacheinfo', `160000,${foreignOne},vendor/lib`]);
  }, { indexPrepared: true });
  const candidate = await commitFrom(fixture.repository, baseWithSubmodule, 'submodule-bump', async (repository) => {
    await writeFile(join(repository, 'tests', 'new.test.js'), 'new test\n');
    runGit(repository, ['add', 'tests/new.test.js']);
    runGit(repository, ['update-index', '--cacheinfo', `160000,${foreignTwo},vendor/lib`]);
  }, { indexPrepared: true });
  assert.throws(
    () => validateGitImport({
      repository: fixture.repository,
      approvedRef: baseWithSubmodule,
      integrationRef: baseWithSubmodule,
      candidateRef: candidate,
      allowPatterns: ['tests/**'],
    }),
    (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED'
      && error.message.includes('vendor/lib'),
  );
});

test('Git import rejects a stale integration target', async (t) => {
  const fixture = await makeRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const candidate = await commitFrom(fixture.repository, fixture.base, 'candidate', async (repository) => {
    await writeFile(join(repository, 'tests', 'new.test.js'), 'new test\n');
  });
  const moved = await commitFrom(fixture.repository, fixture.base, 'moved-target', async (repository) => {
    await writeFile(join(repository, 'README.md'), 'review moved\n');
  });
  assert.throws(
    () => validateGitImport({
      repository: fixture.repository,
      approvedRef: fixture.base,
      integrationRef: moved,
      candidateRef: candidate,
      allowPatterns: ['tests/**'],
    }),
    (error) => error instanceof ProtocolError && error.code === 'STALE_INTEGRATION_TARGET',
  );
});

test('symlinked CLI invocation runs normally and preserves failure status', async (t) => {
  const fixture = await makeRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const candidate = await commitFrom(fixture.repository, fixture.base, 'production', async (repository) => {
    await writeFile(join(repository, 'src', 'calculator.js'), 'mutated\n');
  });
  const linkRoot = join(fixture.root, 'linked-skill');
  await symlink(await realpath(skillRoot), linkRoot, 'dir');
  const result = spawnSync(process.execPath, [
    join(linkRoot, 'scripts', 'mutation-protocol.mjs'),
    'git-import', '--repo', fixture.repository, '--approved', fixture.base,
    '--integration', fixture.base, '--candidate', candidate, '--allow', 'tests/**',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).ok, false);
});

test('Git execution ignores inherited repository selectors', async (t) => {
  const fixture = await makeRepository();
  const other = await makeRepository();
  t.after(() => Promise.all([
    rm(fixture.root, { recursive: true, force: true }),
    rm(other.root, { recursive: true, force: true }),
  ]));
  const candidate = await commitFrom(fixture.repository, fixture.base, 'valid', async (repository) => {
    await writeFile(join(repository, 'tests', 'new.test.js'), 'new test\n');
  });
  const result = cli([
    'git-import', '--repo', fixture.repository, '--approved', fixture.base,
    '--integration', fixture.base, '--candidate', candidate, '--allow', 'tests/**',
  ], { env: { ...process.env, GIT_DIR: join(other.repository, '.git') } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).changed, ['tests/new.test.js']);
});

test('CLI rejects missing, unknown, and repeated options and supports help', () => {
  for (const args of [
    ['git-import', '--approved', 'main', '--candidate', 'HEAD', '--allow', 'tests/**'],
    ['git-import', '--repo', '.', '--approved', 'main', '--candidate', 'HEAD', '--allow', 'tests/**', '--force'],
    ['git-import', '--repo', '.', '--repo', '/tmp', '--approved', 'main', '--candidate', 'HEAD', '--allow', 'tests/**'],
  ]) {
    const result = cli(args);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).ok, false);
  }
  const help = cli(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /git-import/);
});

test('missing git is reported as an unavailable executable', () => {
  const result = cli([
    'git-import', '--repo', '.', '--approved', 'HEAD', '--integration', 'HEAD',
    '--candidate', 'HEAD', '--allow', 'tests/**',
  ], { env: { ...process.env, PATH: '' } });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, 'GIT_UNAVAILABLE');
});

test('provenance check compares tracked upstream blobs rather than the manifest to itself', async () => {
  const manifest = {
    upstream: {
      repository: 'https://github.com/cursor/plugins',
      revision: 'e58dd043600587dbaf58ba315e7f2b38373eeb43',
      trackingRef: 'main',
    },
    principles: [
      { path: 'pstack/skills/example/SKILL.md', blob: '1111111111111111111111111111111111111111' },
    ],
  };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ sha: '2222222222222222222222222222222222222222' }),
  });
  const result = await checkProvenance(manifest, { fetchImpl, apiBase: 'https://example.invalid' });
  assert.equal(result.ok, false);
  assert.equal(result.reviewRequired, true);
  assert.deepEqual(result.drifted, ['pstack/skills/example/SKILL.md']);
});

test('provenance CLI exits nonzero when the tracked upstream has drifted', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'provenance-cli-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const manifestPath = join(scratch, 'provenance.json');
  await writeFile(manifestPath, JSON.stringify({
    upstream: {
      repository: 'https://github.com/cursor/plugins',
      revision: 'e58dd043600587dbaf58ba315e7f2b38373eeb43',
      trackingRef: 'main',
    },
    principles: [{ path: 'pstack/skills/example/SKILL.md', blob: '1111111111111111111111111111111111111111' }],
  }));
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ sha: '2222222222222222222222222222222222222222' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const child = execFile(process.execPath, [
    protocol, 'provenance-check', '--manifest', manifestPath,
    '--api-base', `http://127.0.0.1:${port}`,
  ], { encoding: 'utf8' });
  const result = await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).code, 'PROVENANCE_DRIFT');
});

test('shipped provenance identifies the actual pinned upstream and attribution', async () => {
  const manifest = JSON.parse(await readFile(join(skillRoot, 'references', 'provenance.json'), 'utf8'));
  const attribution = await readFile(join(skillRoot, 'ATTRIBUTION.txt'), 'utf8');
  assert.equal(manifest.upstream.repository, 'https://github.com/cursor/plugins');
  assert.match(manifest.upstream.revision, /^[0-9a-f]{40}$/);
  assert.equal(manifest.upstream.trackingRef, 'main');
  assert.match(attribution, /https:\/\/github\.com\/cursor\/plugins/);
  assert.match(attribution, /MIT/i);
});
