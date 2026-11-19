import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ProtocolError,
  detectAdapter,
  mapEngineStatus,
  normalizeMutationResult,
  planLanes,
  validateGitImport,
  validateImportCandidate,
  validateProvenance,
} from '../scripts/mutation-protocol.mjs';

const skillRoot = fileURLToPath(new URL('..', import.meta.url));

test('detects one supported ecosystem and refuses ambiguous repositories', () => {
  assert.deepEqual(
    detectAdapter(['package.json', 'src/calculator.ts']),
    { id: 'javascript-typescript', manifest: 'package.json' },
  );
  assert.deepEqual(
    detectAdapter(['pyproject.toml', 'calculator/__init__.py']),
    { id: 'python', manifest: 'pyproject.toml' },
  );
  assert.deepEqual(
    detectAdapter(['Calculator.csproj', 'Program.cs']),
    { id: 'csharp', manifest: 'Calculator.csproj' },
  );
  assert.deepEqual(
    detectAdapter(['Cargo.toml', 'src/lib.rs']),
    { id: 'rust', manifest: 'Cargo.toml' },
  );
  assert.deepEqual(
    detectAdapter(['go.mod', 'calculator.go']),
    { id: 'go', manifest: 'go.mod' },
  );
  assert.deepEqual(
    detectAdapter(['apps/web/package.json', 'apps/web/src/calculator.ts']),
    { id: 'javascript-typescript', manifest: 'apps/web/package.json' },
  );

  assert.throws(
    () => detectAdapter(['package.json', 'pyproject.toml']),
    (error) => error instanceof ProtocolError && error.code === 'AMBIGUOUS_ADAPTER',
  );
  assert.throws(
    () => detectAdapter(['apps/web/package.json', 'packages/ui/package.json']),
    (error) => error instanceof ProtocolError && error.code === 'AMBIGUOUS_ADAPTER',
  );
  assert.throws(
    () => detectAdapter(['README.md']),
    (error) => error instanceof ProtocolError && error.code === 'NO_ADAPTER',
  );
});

test('uses native concurrency first and creates no more than three disjoint lanes', () => {
  assert.deepEqual(
    planLanes({
      clusters: [{ id: 'calculator', project: 'app', testPaths: ['test/calculator.test.js'] }],
      predictedNativeSeconds: 90,
      predictedLaneSeconds: 60,
      duplicatedSetupSeconds: 20,
    }),
    { mode: 'native', lanes: [['calculator']], reason: 'NO_PREDICTED_SAVING' },
  );

  assert.deepEqual(
    planLanes({
      clusters: [
        { id: 'billing', project: 'api', testPaths: ['test/billing.test.js'] },
        { id: 'search', project: 'web', testPaths: ['test/search.test.js'] },
        { id: 'sync', project: 'worker', testPaths: ['test/sync.test.js'] },
        { id: 'email', project: 'worker', testPaths: ['test/email.test.js'] },
      ],
      predictedNativeSeconds: 600,
      predictedLaneSeconds: 180,
      duplicatedSetupSeconds: 30,
    }),
    {
      mode: 'agent-lanes',
      lanes: [['billing'], ['search'], ['sync', 'email']],
      reason: 'PREDICTED_WALL_CLOCK_SAVING',
    },
  );

  assert.throws(
    () => planLanes({
      clusters: [
        { id: 'one', project: 'a', testPaths: ['test/shared.test.js'] },
        { id: 'two', project: 'b', testPaths: ['test/shared.test.js'] },
      ],
      predictedNativeSeconds: 600,
      predictedLaneSeconds: 100,
      duplicatedSetupSeconds: 10,
    }),
    (error) => error instanceof ProtocolError && error.code === 'OVERLAPPING_TEST_OWNERSHIP',
  );
});

test('preserves raw engine truth and marks incomplete evidence honestly', () => {
  const survived = normalizeMutationResult({
    engine: 'stryker-js',
    mutantId: '12',
    rawStatus: 'Survived',
    location: 'src/calculator.js:12:5',
    triage: { disposition: 'equivalent', rationale: 'Boundary is unreachable.' },
  });
  assert.equal(survived.raw.status, 'Survived');
  assert.equal(survived.triage.disposition, 'equivalent');
  assert.equal(survived.completion, 'actionable-survivor');

  for (const rawStatus of ['NoCoverage', 'TimedOut', 'CompileError', 'RuntimeError']) {
    const result = normalizeMutationResult({
      engine: 'stryker-js',
      mutantId: rawStatus,
      rawStatus,
      location: 'src/calculator.js:1:1',
    });
    assert.equal(result.completion, 'incomplete');
  }

  const exhausted = normalizeMutationResult({
    engine: 'stryker-js',
    mutantId: 'budget',
    rawStatus: 'Killed',
    location: 'src/calculator.js:1:1',
    budgetExhausted: true,
  });
  assert.equal(exhausted.completion, 'incomplete');

  const ignored = normalizeMutationResult({
    engine: 'stryker-js',
    mutantId: 'ignored',
    rawStatus: 'Ignored',
    location: 'src/calculator.js:1:1',
  });
  assert.equal(ignored.semanticStatus, 'skipped');
  assert.equal(ignored.completion, 'incomplete');

  assert.equal(mapEngineStatus('gremlins', 'LIVED'), 'survived');
  assert.equal(mapEngineStatus('gremlins', 'SKIPPED'), 'skipped');
  assert.equal(mapEngineStatus('cargo-mutants', 'caught'), 'killed');
  assert.equal(mapEngineStatus('cargo-mutants', 'missed'), 'survived');
  assert.equal(mapEngineStatus('stryker-js', 'Timeout'), 'timed-out');
  assert.equal(mapEngineStatus('mutmut', 'no tests'), 'no-coverage');
  assert.equal(mapEngineStatus('mutmut', 'not checked'), 'skipped');
  assert.equal(mapEngineStatus('mutmut', 'suspicious'), 'runtime-error');
  assert.equal(mapEngineStatus('mutmut', 'segfault'), 'runtime-error');
  assert.equal(mapEngineStatus('mutmut', 'caught by type check'), 'killed');
  for (const inheritedKey of ['__proto__', 'constructor', 'toString']) {
    assert.throws(
      () => mapEngineStatus('stryker-js', inheritedKey),
      (error) => error instanceof ProtocolError && error.code === 'UNKNOWN_RAW_STATUS',
    );
  }
  assert.throws(
    () => mapEngineStatus('__proto__', 'toString'),
    (error) => error instanceof ProtocolError && error.code === 'UNKNOWN_RAW_STATUS',
  );

  assert.throws(
    () => normalizeMutationResult({
      engine: 'stryker-js',
      mutantId: 'bad',
      rawStatus: 'Equivalent',
      location: 'src/calculator.js:1:1',
    }),
    (error) => error instanceof ProtocolError && error.code === 'UNKNOWN_RAW_STATUS',
  );
});

test('allows only regular test or fixture files and requires all other bytes to match', () => {
  const accepted = validateImportCandidate({
    allowPatterns: ['test/**', 'tests/**', '**/*.test.js', '**/fixtures/**'],
    entries: [
      { path: 'tests/calculator.test.js', type: 'file', before: 'old', after: 'new' },
      { path: 'src/calculator.js', type: 'file', before: 'same', after: 'same' },
    ],
  });
  assert.deepEqual(accepted, { ok: true, changed: ['tests/calculator.test.js'] });
  assert.deepEqual(validateImportCandidate({
    allowPatterns: ['**/*.test.js'],
    entries: [{ path: 'calculator.test.js', type: 'file', before: 'old', after: 'new' }],
  }), { ok: true, changed: ['calculator.test.js'] });
  assert.deepEqual(validateImportCandidate({
    allowPatterns: ['**/*.Tests.cs'],
    entries: [{ path: 'Calculator.Tests.cs', type: 'file', before: 'old', after: 'new' }],
  }), { ok: true, changed: ['Calculator.Tests.cs'] });
  assert.deepEqual(validateImportCandidate({
    allowPatterns: ['Project.Tests/**'],
    entries: [{ path: 'Project.Tests/CalculatorTests.cs', type: 'file', before: 'old', after: 'new' }],
  }), { ok: true, changed: ['Project.Tests/CalculatorTests.cs'] });

  for (const entry of [
    { path: 'src/calculator.js', type: 'file', before: 'old', after: 'new' },
    { path: 'package-lock.json', type: 'file', before: 'old', after: 'new' },
    { path: 'tests/link.test.js', type: 'symlink', before: '', after: '../src/calculator.js' },
    { path: 'tests/../src/calculator.js', type: 'file', before: 'old', after: 'new' },
    { path: 'tests/vitest.config.js', type: 'file', before: '', after: 'export default {}' },
    { path: 'tests/Cargo.toml', type: 'file', before: '', after: '[package]' },
    { path: 'tests/requirements.txt', type: 'file', before: '', after: 'pytest' },
    { path: 'tests/Test.csproj', type: 'file', before: '', after: '<Project />' },
    { path: 'tests/go.work', type: 'file', before: '', after: 'go 1.24' },
    { path: 'tests/requirements-dev.in', type: 'file', before: '', after: 'pytest' },
    { path: 'tests/constraints.txt', type: 'file', before: '', after: 'pytest==9' },
    { path: 'tests/packages.lock.json', type: 'file', before: '', after: '{}' },
    { path: 'tests/rust-toolchain.toml', type: 'file', before: '', after: '[toolchain]' },
    { path: 'tests/deno.json', type: 'file', before: '', after: '{}' },
    { path: 'tests/.gitattributes', type: 'file', before: '', after: '* text=auto' },
    { path: 'tests/.gitignore', type: 'file', before: '', after: 'output/' },
    { path: 'tests/.editorconfig', type: 'file', before: '', after: 'root=true' },
    { path: 'tests/.env.test', type: 'file', before: '', after: 'TOKEN=secret' },
    { path: 'tests/.eslintrc.json', type: 'file', before: '', after: '{}' },
    { path: 'tests/biome.json', type: 'file', before: '', after: '{}' },
    { path: 'tests/test.runsettings', type: 'file', before: '', after: '<RunSettings />' },
    { path: 'tests/mutation.testsettings', type: 'file', before: '', after: '<TestSettings />' },
    { path: 'tests/testconfig.json', type: 'file', before: '', after: '{}' },
    { path: 'Project.Tests/Calculator.testconfig.json', type: 'file', before: '', after: '{}' },
    { path: 'tests/evil\t.test.js', type: 'file', before: '', after: 'test' },
    { path: 'tests/con.test.js', type: 'file', before: '', after: 'test' },
    { path: 'tests/COM¹.test.js', type: 'file', before: '', after: 'test' },
    { path: 'tests/LPT².test.js', type: 'file', before: '', after: 'test' },
    { path: 'tests/trailing.test.js.', type: 'file', before: '', after: 'test' },
    { path: 'tests/trailing.test.js ', type: 'file', before: '', after: 'test' },
    { path: 'tests/bad:name.test.js', type: 'file', before: '', after: 'test' },
    { path: 'tests/cafe\u0301.test.js', type: 'file', before: '', after: 'test' },
    {
      path: 'tests/calculator.test.js', type: 'file', before: 'same', after: 'same',
      beforeMode: '100644', afterMode: '100755',
    },
    { path: 'tests/removed.test.js', type: 'deleted', status: 'D', before: 'old', after: null },
  ]) {
    assert.throws(
      () => validateImportCandidate({
        allowPatterns: ['tests/**'],
        entries: [entry],
      }),
      (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
    );
  }

  assert.throws(
    () => validateImportCandidate({ allowPatterns: ['tests/**'], entries: [] }),
    (error) => error instanceof ProtocolError && error.code === 'EMPTY_CANDIDATE',
  );
  assert.throws(
    () => validateImportCandidate({
      allowPatterns: ['**/*.test.js'],
      entries: [{ path: 'evil\n.test.js', type: 'file', before: '', after: 'test' }],
    }),
    (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
  );
  assert.throws(
    () => validateImportCandidate({
      allowPatterns: ['tests/**'],
      entries: [
        { path: 'tests/Case.test.js', type: 'file', before: '', after: 'one' },
        { path: 'tests/case.test.js', type: 'file', before: '', after: 'two' },
      ],
    }),
    (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
  );
  for (const [left, right] of [
    ['tests/straße.test.js', 'tests/STRASSE.test.js'],
    ['tests/σ.test.js', 'tests/ς.test.js'],
  ]) {
    assert.throws(
      () => validateImportCandidate({
        allowPatterns: ['tests/**'],
        entries: [
          { path: left, type: 'file', before: '', after: 'one' },
          { path: right, type: 'file', before: '', after: 'two' },
        ],
      }),
      (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
    );
  }
  for (const broadPattern of [
    '**/*test*/**', '**/*test*', '**/*test.js', '**/*tests.js', '**/*spec.js',
  ]) {
    assert.throws(
      () => validateImportCandidate({
        allowPatterns: [broadPattern],
        entries: [{ path: 'src/latest/calculator.js', type: 'file', before: 'old', after: 'new' }],
      }),
      (error) => error instanceof ProtocolError && error.code === 'INVALID_ALLOWLIST',
    );
  }
  assert.throws(
    () => validateImportCandidate({
      allowPatterns: ['**'],
      entries: [{ path: 'tests/calculator.test.js', type: 'file', before: 'old', after: 'new' }],
    }),
    (error) => error instanceof ProtocolError && error.code === 'INVALID_ALLOWLIST',
  );
});

test('validates exact PSTACK evidence and requests review when a source drifts', () => {
  const manifest = {
    upstream: {
      repository: 'https://github.com/getcursor/plugins',
      revision: 'e58dd043600587dbaf58ba315e7f2b38373eeb43',
    },
    principles: [
      {
        path: 'pstack/skills/principle-prove-it-works/SKILL.md',
        blob: '1c293b3c3ad0f7cb021858b17e7588d30a0a1acb',
        localInvariant: 'Require executable proof of the claimed behavior.',
      },
    ],
  };

  assert.deepEqual(
    validateProvenance(manifest, {
      'pstack/skills/principle-prove-it-works/SKILL.md': '1c293b3c3ad0f7cb021858b17e7588d30a0a1acb',
    }),
    { ok: true, reviewRequired: false, drifted: [] },
  );
  assert.deepEqual(
    validateProvenance(manifest, {
      'pstack/skills/principle-prove-it-works/SKILL.md': 'changed',
    }),
    {
      ok: false,
      reviewRequired: true,
      drifted: ['pstack/skills/principle-prove-it-works/SKILL.md'],
    },
  );
});

test('the checked-in PSTACK manifest has exact, internally valid source evidence', async () => {
  const manifest = JSON.parse(await readFile(join(skillRoot, 'references', 'provenance.json'), 'utf8'));
  const observed = {
    'pstack/skills/principle-test-behavior-not-implementation/SKILL.md': '094b9427aa64294afd64d83e9495a5ee303631e0',
    'pstack/skills/principle-prove-it-works/SKILL.md': '1c293b3c3ad0f7cb021858b17e7588d30a0a1acb',
    'pstack/skills/principle-build-the-lever/SKILL.md': '8f9b5a931b10839ad5ef71ce43d5411c2c7a1f6b',
    'pstack/skills/principle-sequence-verifiable-units/SKILL.md': '3998185a29f287f6f30f0909c98ac4e2af5ddb97',
    'pstack/skills/principle-boundary-discipline/SKILL.md': '95b2209ce7d15ddbca7c2bf6ef3626ffdc8d595e',
    'pstack/skills/principle-model-the-domain/SKILL.md': '88ba012f47bd51b2db0758c657610d56f871e1ba',
    'pstack/skills/principle-separate-before-serializing-shared-state/SKILL.md': '6a4c3b876b694097a12003996588f557d2b55d0e',
  };
  assert.deepEqual(
    validateProvenance(manifest, observed),
    { ok: true, reviewRequired: false, drifted: [] },
  );
  assert.match(manifest.reviewTrigger, /whenever the audited upstream revision or any recorded blob changes/i);
});

test('Git-backed import guard exercises a disposable worktree and fails closed', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'mutation-import-guard-'));
  const repository = join(scratch, 'repository');
  const git = (cwd, args, options = {}) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();

  try {
    await mkdir(join(repository, 'src'), { recursive: true });
    await mkdir(join(repository, 'tests'), { recursive: true });
    await writeFile(join(repository, 'src', 'calculator.js'), 'export const add = (a, b) => a + b;\n');
    await writeFile(join(repository, 'tests', 'calculator.test.js'), 'assert.equal(add(1, 2), 3);\n');
    git(repository, ['init', '-q']);
    git(repository, ['config', 'user.email', 'mutation-test@example.invalid']);
    git(repository, ['config', 'user.name', 'Mutation Test']);
    git(repository, ['add', '.']);
    git(repository, ['commit', '-qm', 'base']);
    const base = git(repository, ['rev-parse', 'HEAD']);

    const candidate = async (name, mutate, { indexPrepared = false } = {}) => {
      const worktree = join(scratch, name);
      git(repository, ['worktree', 'add', '-q', '-b', name, worktree, base]);
      await mutate(worktree);
      if (!indexPrepared) git(worktree, ['add', '-A']);
      git(worktree, ['commit', '-qm', name]);
      return { worktree, commit: git(worktree, ['rev-parse', 'HEAD']) };
    };

    const originalSource = await readFile(join(repository, 'src', 'calculator.js'), 'utf8');
    const valid = await candidate('candidate-valid', async (worktree) => {
      // The mutation is deliberately restored before the test-only candidate is committed.
      await writeFile(join(worktree, 'src', 'calculator.js'), 'export const add = (a, b) => a - b;\n');
      await writeFile(join(worktree, 'src', 'calculator.js'), originalSource);
      await writeFile(join(worktree, 'tests', 'boundary.test.js'), 'assert.equal(add(0, 0), 0);\n');
    });
    const validResult = validateGitImport({
      repository,
      approvedRef: base,
      candidateRef: valid.commit,
      allowPatterns: ['tests/**'],
    });
    assert.deepEqual(validResult.changed, ['tests/boundary.test.js']);

    const csharpRoot = await candidate('candidate-csharp-root', async (worktree) => {
      await writeFile(join(worktree, 'Calculator.Tests.cs'), 'public sealed class CalculatorTests {}\n');
    });
    assert.deepEqual(validateGitImport({
      repository,
      approvedRef: base,
      candidateRef: csharpRoot.commit,
      allowPatterns: ['**/*.Tests.cs'],
    }).changed, ['Calculator.Tests.cs']);

    const csharpDirectory = await candidate('candidate-csharp-directory', async (worktree) => {
      await mkdir(join(worktree, 'Project.Tests'), { recursive: true });
      await writeFile(
        join(worktree, 'Project.Tests', 'CalculatorTests.cs'),
        'public sealed class CalculatorTests {}\n',
      );
    });
    assert.deepEqual(validateGitImport({
      repository,
      approvedRef: base,
      candidateRef: csharpDirectory.commit,
      allowPatterns: ['Project.Tests/**'],
    }).changed, ['Project.Tests/CalculatorTests.cs']);

    const cli = JSON.parse(execFileSync(process.execPath, [
      join(skillRoot, 'scripts', 'mutation-protocol.mjs'),
      'git-import', '--repo', repository, '--approved', base, '--candidate', valid.commit,
      '--allow', 'tests/**',
    ], { encoding: 'utf8' }));
    assert.deepEqual(cli.changed, ['tests/boundary.test.js']);

    git(repository, ['checkout', '-qb', 'reviewed', base]);
    git(repository, ['cherry-pick', valid.commit]);
    const integrated = git(repository, ['rev-parse', 'HEAD']);
    assert.deepEqual(validateGitImport({
      repository,
      approvedRef: base,
      candidateRef: integrated,
      allowPatterns: ['tests/**'],
    }).changed, ['tests/boundary.test.js']);

    const production = await candidate('candidate-production', async (worktree) => {
      await writeFile(join(worktree, 'src', 'calculator.js'), 'export const add = (a, b) => a - b;\n');
    });
    const productionWithTestSubstring = await candidate('candidate-production-test-substring', async (worktree) => {
      await mkdir(join(worktree, 'src', 'latest'), { recursive: true });
      await writeFile(join(worktree, 'src', 'latest', 'calculator.js'), 'export const hidden = true;\n');
    });
    const suffixBypassCandidates = [];
    for (const [name, path] of [
      ['test', 'src/latest.js'],
      ['tests', 'src/contests.js'],
      ['spec', 'src/aspec.js'],
    ]) {
      suffixBypassCandidates.push({
        pattern: `**/*${name}.js`,
        candidate: await candidate(`candidate-suffix-${name}`, async (worktree) => {
          await writeFile(join(worktree, path), 'export const hidden = true;\n');
        }),
      });
    }
    const config = await candidate('candidate-config', async (worktree) => {
      await writeFile(join(worktree, 'tests', 'vitest.config.js'), 'export default {};\n');
    });
    const deleted = await candidate('candidate-deleted', async (worktree) => {
      await rm(join(worktree, 'tests', 'calculator.test.js'));
    });
    const renamed = await candidate('candidate-renamed', async (worktree) => {
      git(worktree, ['mv', 'tests/calculator.test.js', 'tests/renamed.test.js']);
    });
    const symlink = await candidate('candidate-symlink', async (worktree) => {
      const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: worktree,
        input: '../src/calculator.js',
        encoding: 'utf8',
      }).stdout.trim();
      git(worktree, ['update-index', '--add', '--cacheinfo', `120000,${blob},tests/link.test.js`]);
    }, { indexPrepared: true });
    const mode = await candidate('candidate-mode', async (worktree) => {
      git(worktree, ['update-index', '--chmod=+x', 'tests/calculator.test.js']);
    }, { indexPrepared: true });
    const manifestCandidates = [];
    for (const [name, path, contents] of [
      ['requirements', 'tests/requirements.txt', 'pytest\n'],
      ['cargo', 'tests/Cargo.toml', '[package]\nname = "hidden"\n'],
      ['csproj', 'tests/Test.csproj', '<Project />\n'],
      ['gowork', 'tests/go.work', 'go 1.24\n'],
      ['requirements-in', 'tests/requirements-dev.in', 'pytest\n'],
      ['constraints', 'tests/constraints.txt', 'pytest==9\n'],
      ['packages-lock', 'tests/packages.lock.json', '{}\n'],
      ['rust-toolchain', 'tests/rust-toolchain.toml', '[toolchain]\nchannel = "stable"\n'],
      ['deno', 'tests/deno.json', '{}\n'],
      ['gitattributes', 'tests/.gitattributes', '* text=auto\n'],
      ['gitignore', 'tests/.gitignore', 'output/\n'],
      ['editorconfig', 'tests/.editorconfig', 'root=true\n'],
      ['env', 'tests/.env.test', 'TOKEN=secret\n'],
      ['eslint', 'tests/.eslintrc.json', '{}\n'],
      ['biome', 'tests/biome.json', '{}\n'],
      ['runsettings', 'tests/test.runsettings', '<RunSettings />\n'],
      ['testsettings', 'tests/mutation.testsettings', '<TestSettings />\n'],
      ['testconfig', 'tests/testconfig.json', '{}\n'],
      ['app-testconfig', 'Project.Tests/Calculator.testconfig.json', '{}\n'],
    ]) {
      manifestCandidates.push(await candidate(`candidate-manifest-${name}`, async (worktree) => {
        await mkdir(dirname(join(worktree, path)), { recursive: true });
        await writeFile(join(worktree, path), contents);
      }));
    }

    for (const bad of [production, config, deleted, renamed, symlink, mode, ...manifestCandidates]) {
      assert.throws(
        () => validateGitImport({
          repository,
          approvedRef: base,
          candidateRef: bad.commit,
          allowPatterns: ['tests/**'],
        }),
        (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
      );
    }
    for (const broadPattern of ['**/*test*/**', '**/*test*']) {
      assert.throws(
        () => validateGitImport({
          repository,
          approvedRef: base,
          candidateRef: productionWithTestSubstring.commit,
          allowPatterns: [broadPattern],
        }),
        (error) => error instanceof ProtocolError && error.code === 'INVALID_ALLOWLIST',
      );
    }
    for (const bypass of suffixBypassCandidates) {
      assert.throws(
        () => validateGitImport({
          repository,
          approvedRef: base,
          candidateRef: bypass.candidate.commit,
          allowPatterns: [bypass.pattern],
        }),
        (error) => error instanceof ProtocolError && error.code === 'INVALID_ALLOWLIST',
      );
    }
    const hostilePaths = [
      ['newline', 'evil\n.test.js', '**/*.test.js'],
      ['tab', 'tests/evil\t.test.js', 'tests/**'],
      ['reserved', 'tests/con.test.js', 'tests/**'],
      ['reserved-superscript-com', 'tests/COM¹.test.js', 'tests/**'],
      ['reserved-superscript-lpt', 'tests/LPT².test.js', 'tests/**'],
      ['trailing-dot', 'tests/trailing.test.js.', 'tests/**'],
      ['trailing-space', 'tests/trailing.test.js ', 'tests/**'],
      ['invalid-character', 'tests/bad:name.test.js', 'tests/**'],
      ['non-nfc', 'tests/cafe\u0301.test.js', 'tests/**'],
    ];
    for (const [name, path, allowPattern] of hostilePaths) {
      const hostile = await candidate(`candidate-hostile-${name}`, async (worktree) => {
        const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], {
          cwd: worktree,
          input: 'test\n',
          encoding: 'utf8',
        }).stdout.trim();
        git(worktree, [
          '-c', 'core.protectNTFS=false', '-c', 'core.precomposeunicode=false',
          'update-index', '--add', '--cacheinfo',
          `100644,${blob},${path}`,
        ]);
      }, { indexPrepared: true });
      assert.throws(
        () => validateGitImport({
          repository,
          approvedRef: base,
          candidateRef: hostile.commit,
          allowPatterns: [allowPattern],
        }),
        (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
        name,
      );
    }

    const caseCollision = await candidate('candidate-case-collision', async (worktree) => {
      git(worktree, ['config', 'core.ignorecase', 'false']);
      for (const [path, contents] of [
        ['tests/Case.test.js', 'one\n'],
        ['tests/case.test.js', 'two\n'],
      ]) {
        const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], {
          cwd: worktree,
          input: contents,
          encoding: 'utf8',
        }).stdout.trim();
        git(worktree, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
      }
    }, { indexPrepared: true });
    assert.throws(
      () => validateGitImport({
        repository,
        approvedRef: base,
        candidateRef: caseCollision.commit,
        allowPatterns: ['tests/**'],
      }),
      (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
    );

    const caseCollisionWithBase = await candidate('candidate-case-collision-with-base', async (worktree) => {
      git(worktree, ['config', 'core.ignorecase', 'false']);
      const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: worktree,
        input: 'case collision\n',
        encoding: 'utf8',
      }).stdout.trim();
      git(worktree, [
        'update-index', '--add', '--cacheinfo',
        `100644,${blob},tests/Calculator.test.js`,
      ]);
    }, { indexPrepared: true });
    assert.throws(
      () => validateGitImport({
        repository,
        approvedRef: base,
        candidateRef: caseCollisionWithBase.commit,
        allowPatterns: ['tests/**'],
      }),
      (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
    );
    for (const [name, paths] of [
      ['unicode-case-collision-german', ['tests/straße.test.js', 'tests/STRASSE.test.js']],
      ['unicode-case-collision-sigma', ['tests/σ.test.js', 'tests/ς.test.js']],
    ]) {
      const unicodeCollision = await candidate(`candidate-${name}`, async (worktree) => {
        git(worktree, ['config', 'core.ignorecase', 'false']);
        for (const path of paths) {
          const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], {
            cwd: worktree,
            input: `${path}\n`,
            encoding: 'utf8',
          }).stdout.trim();
          git(worktree, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
        }
      }, { indexPrepared: true });
      assert.throws(
        () => validateGitImport({
          repository,
          approvedRef: base,
          candidateRef: unicodeCollision.commit,
          allowPatterns: ['tests/**'],
        }),
        (error) => error instanceof ProtocolError && error.code === 'IMPORT_REJECTED',
      );
    }
    assert.throws(
      () => validateGitImport({
        repository,
        approvedRef: base,
        candidateRef: base,
        allowPatterns: ['tests/**'],
      }),
      (error) => error instanceof ProtocolError && error.code === 'EMPTY_CANDIDATE',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
