#!/usr/bin/env node

/** Deterministic gates shared by the mutation-testing skill and its smoke tests. */

import { spawnSync } from 'node:child_process';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

const ADAPTERS = [
  { id: 'javascript-typescript', match: (path) => posix.basename(path) === 'package.json' },
  { id: 'python', match: (path) => ['pyproject.toml', 'setup.py', 'setup.cfg'].includes(posix.basename(path)) },
  { id: 'csharp', match: (path) => /(?:^|\/)[^/]+\.(?:csproj|sln)$/.test(path) },
  { id: 'rust', match: (path) => posix.basename(path) === 'Cargo.toml' },
  { id: 'go', match: (path) => posix.basename(path) === 'go.mod' },
];

export function detectAdapter(paths) {
  if (!Array.isArray(paths)) {
    throw new ProtocolError('INVALID_PATHS', 'Adapter detection requires a path array.');
  }
  const matches = ADAPTERS.flatMap((adapter) => paths
    .filter((path) => adapter.match(path))
    .map((manifest) => ({ id: adapter.id, manifest })));
  if (matches.length === 0) {
    throw new ProtocolError('NO_ADAPTER', 'No supported project manifest was found.');
  }
  if (matches.length > 1) {
    throw new ProtocolError(
      'AMBIGUOUS_ADAPTER',
      `Multiple project manifests were detected: ${matches.map(({ id, manifest }) => `${id}:${manifest}`).join(', ')}. Select one project root explicitly.`,
    );
  }
  return matches[0];
}

function assertClusters(clusters) {
  if (!Array.isArray(clusters) || clusters.length === 0) {
    throw new ProtocolError('INVALID_CLUSTERS', 'At least one behavior cluster is required.');
  }
  const owned = new Map();
  for (const cluster of clusters) {
    if (!cluster?.id || !cluster?.project || !Array.isArray(cluster.testPaths)) {
      throw new ProtocolError('INVALID_CLUSTERS', 'Every cluster needs id, project, and testPaths.');
    }
    for (const path of cluster.testPaths) {
      if (owned.has(path) && owned.get(path) !== cluster.id) {
        throw new ProtocolError(
          'OVERLAPPING_TEST_OWNERSHIP',
          `${path} is assigned to both ${owned.get(path)} and ${cluster.id}. Merge or serialize those clusters.`,
        );
      }
      owned.set(path, cluster.id);
    }
  }
}

export function planLanes({
  clusters,
  predictedNativeSeconds,
  predictedLaneSeconds,
  duplicatedSetupSeconds,
}) {
  assertClusters(clusters);
  const numeric = [predictedNativeSeconds, predictedLaneSeconds, duplicatedSetupSeconds];
  if (numeric.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new ProtocolError('INVALID_ESTIMATE', 'Lane estimates must be non-negative finite numbers.');
  }

  const byProject = new Map();
  for (const cluster of clusters) {
    const existing = byProject.get(cluster.project) ?? [];
    existing.push(cluster.id);
    byProject.set(cluster.project, existing);
  }
  const predictedCost = predictedLaneSeconds + duplicatedSetupSeconds;
  if (byProject.size < 2 || predictedCost >= predictedNativeSeconds) {
    return {
      mode: 'native',
      lanes: [clusters.map(({ id }) => id)],
      reason: 'NO_PREDICTED_SAVING',
    };
  }

  const lanes = [];
  for (const clusterIds of byProject.values()) {
    if (lanes.length < 3) lanes.push([...clusterIds]);
    else lanes[lanes.length - 1].push(...clusterIds);
  }
  return { mode: 'agent-lanes', lanes, reason: 'PREDICTED_WALL_CLOCK_SAVING' };
}

const ENGINE_STATUS_MAPS = {
  'stryker-js': {
    Killed: 'killed', Survived: 'survived', NoCoverage: 'no-coverage',
    Timeout: 'timed-out', TimedOut: 'timed-out', CompileError: 'compile-error', RuntimeError: 'runtime-error',
    Ignored: 'skipped', Pending: 'skipped',
  },
  'stryker-net': {
    Killed: 'killed', Survived: 'survived', NoCoverage: 'no-coverage',
    Timeout: 'timed-out', TimedOut: 'timed-out', CompileError: 'compile-error',
    RuntimeError: 'runtime-error', Ignored: 'skipped', Pending: 'skipped',
  },
  gremlins: {
    KILLED: 'killed', LIVED: 'survived', 'NOT COVERED': 'no-coverage',
    NOT_COVERED: 'no-coverage', 'TIMED OUT': 'timed-out', TIMED_OUT: 'timed-out',
    'NOT VIABLE': 'compile-error', NOT_VIABLE: 'compile-error', SKIPPED: 'skipped',
  },
  'cargo-mutants': {
    caught: 'killed', missed: 'survived', timeout: 'timed-out',
    unviable: 'compile-error', skipped: 'skipped',
  },
  mutmut: {
    killed: 'killed', survived: 'survived', timeout: 'timed-out',
    'no tests': 'no-coverage', no_tests: 'no-coverage', untested: 'no-coverage',
    skipped: 'skipped', 'not checked': 'skipped', not_checked: 'skipped',
    'check was interrupted by user': 'skipped', check_was_interrupted_by_user: 'skipped',
    suspicious: 'runtime-error', segfault: 'runtime-error',
    'caught by type check': 'killed', caught_by_type_check: 'killed',
  },
};

export function mapEngineStatus(engine, rawStatus) {
  const statusMap = Object.hasOwn(ENGINE_STATUS_MAPS, engine) ? ENGINE_STATUS_MAPS[engine] : null;
  if (!statusMap || !Object.hasOwn(statusMap, rawStatus)) {
    throw new ProtocolError(
      'UNKNOWN_RAW_STATUS',
      `The ${engine} status '${rawStatus}' has no explicit semantic mapping.`,
    );
  }
  return statusMap[rawStatus];
}

const INCOMPLETE_STATUSES = new Set([
  'no-coverage', 'timed-out', 'compile-error', 'runtime-error', 'skipped',
]);

export function normalizeMutationResult({
  engine,
  mutantId,
  rawStatus,
  location,
  triage = null,
  budgetExhausted = false,
}) {
  if (!engine || !mutantId || !location) {
    throw new ProtocolError('INVALID_RESULT', 'Engine, mutantId, and location are required.');
  }
  const semanticStatus = mapEngineStatus(engine, rawStatus);
  let completion = 'verified';
  if (budgetExhausted || INCOMPLETE_STATUSES.has(semanticStatus)) completion = 'incomplete';
  else if (semanticStatus === 'survived') completion = 'actionable-survivor';

  return {
    raw: { engine, mutantId, status: rawStatus, location },
    semanticStatus,
    triage,
    budgetExhausted: Boolean(budgetExhausted),
    completion,
  };
}

function globToRegExp(glob) {
  let expression = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (char === '*') {
      expression += '[^/]*';
    } else if ('\\^$+?.()|{}[]'.includes(char)) {
      expression += `\\${char}`;
    } else {
      expression += char;
    }
  }
  return new RegExp(`^${expression}$`);
}

const FORBIDDEN_BASENAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'npm-shrinkwrap.json',
  'bun.lock',
  'bun.lockb',
  'cargo.toml',
  'cargo.lock',
  'go.mod',
  'go.sum',
  'go.work',
  'go.work.sum',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'pipfile',
  'pipfile.lock',
  'poetry.lock',
  'uv.lock',
  'global.json',
  'nuget.config',
  'packages.config',
  'directory.packages.props',
  'packages.lock.json',
  'deno.json',
  'deno.jsonc',
  'biome.json',
  'biome.jsonc',
  'rome.json',
  'renovate.json',
  'codecov.yml',
  'codecov.yaml',
  'lefthook.yml',
  'lefthook.yaml',
  'sonar-project.properties',
  'jsconfig.json',
  'rust-toolchain',
  'rust-toolchain.toml',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.nvmrc',
  '.node-version',
  '.python-version',
  '.tool-versions',
  'environment.yml',
  'environment.yaml',
  'makefile',
  'justfile',
  'dockerfile',
  'stryker.conf.json',
  'pytest.ini',
  'tox.ini',
  'conftest.py',
]);

const CONFIG_NAME = /(?:^|[._-])(?:config|configuration|vitest|jest|stryker|mutmut|gremlins|cargo-mutants|xunit|nunit|tunit|mstest)(?:[._-]|$)/i;
const MANIFEST_OR_DEPENDENCY_NAME = /^(?:requirements(?:[._-][^/]*)?\.(?:txt|in)|constraints(?:[._-][^/]*)?\.(?:txt|in)|directory\.build\..+|directory\.packages\..+|(?:ts|js)config(?:\.[^/]+)?\.json|(?:.*\.)?testconfig\.json|rust-toolchain(?:\.[^/]+)?|.*settings(?:\.[^/]+)?\.json|.*\.(?:runtimeconfig|deps)\.json|composer\.(?:json|lock)|gemfile(?:\.lock)?|.*\.(?:csproj|fsproj|vbproj|sln|props|targets|runsettings|testsettings|trx|coverage|sarif|lock|lockb|lockfile|lock\.json|toml|ini|cfg|gradle|gradle\.kts))$/i;
const SAFE_TEST_DIRECTORIES = new Set(['test', 'tests', 'fixture', 'fixtures', '__tests__']);

function isSafeAllowPattern(pattern) {
  const segments = pattern.split('/');
  if (segments.some((segment) => SAFE_TEST_DIRECTORIES.has(segment.toLowerCase()))) return true;
  return segments.some((segment) => /(?:^|[._-])(?:tests?|specs?)(?:[._-]|$)/i.test(segment));
}

function normalizeCandidatePath(path) {
  const parts = typeof path === 'string' ? path.split('/') : [];
  if (
    typeof path !== 'string'
    || path.length === 0
    || /[\x00-\x1f\x7f]/.test(path)
    || path.includes('\\')
    || path.startsWith('/')
    || /^[A-Za-z]:/.test(path)
    || parts.some((part) => (
      part === '..'
      || part === '.'
      || part === ''
      || /[<>:"|?*]/.test(part)
      || /[. ]$/.test(part)
      || /^(?:con|prn|aux|nul|com(?:[1-9¹²³])|lpt(?:[1-9¹²³]))(?:\.|$)/iu.test(part)
    ))
    || posix.normalize(path) !== path
    || path.normalize('NFC') !== path
  ) {
    throw new ProtocolError('IMPORT_REJECTED', `${String(path)}: unsafe or non-canonical path`);
  }
  return path;
}

function bytesEqual(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return left === right;
  const leftBytes = Buffer.isBuffer(left) ? left : Buffer.from(String(left));
  const rightBytes = Buffer.isBuffer(right) ? right : Buffer.from(String(right));
  return leftBytes.equals(rightBytes);
}

function portableCaseFold(path) {
  return path.normalize('NFKC').toUpperCase().toLowerCase();
}

export function validateImportCandidate({ allowPatterns, entries }) {
  if (!Array.isArray(allowPatterns) || allowPatterns.length === 0 || !Array.isArray(entries)) {
    throw new ProtocolError('INVALID_IMPORT', 'Import validation requires allowPatterns and entries.');
  }
  if (entries.length === 0) {
    throw new ProtocolError('EMPTY_CANDIDATE', 'A test-only candidate must contain at least one changed path.');
  }
  for (const pattern of allowPatterns) {
    if (
      typeof pattern !== 'string'
      || !isSafeAllowPattern(pattern)
      || pattern.includes('\\')
      || pattern.includes('..')
      || pattern.startsWith('/')
    ) {
      throw new ProtocolError('INVALID_ALLOWLIST', `Unsafe test/fixture allow pattern: ${String(pattern)}`);
    }
  }
  const matchers = allowPatterns.map(globToRegExp);
  const changed = [];
  const rejected = [];
  const seen = new Set();
  const seenCaseFolded = new Map();

  for (const entry of entries) {
    let path;
    try {
      path = normalizeCandidatePath(entry?.path ?? '');
    } catch (error) {
      rejected.push(error.message);
      continue;
    }
    if (seen.has(path)) {
      rejected.push(`${path}: duplicate or incomplete candidate enumeration`);
      continue;
    }
    seen.add(path);
    const caseFolded = portableCaseFold(path);
    if (seenCaseFolded.has(caseFolded) && seenCaseFolded.get(caseFolded) !== path) {
      rejected.push(`${path}: case-fold collision with ${seenCaseFolded.get(caseFolded)}`);
      continue;
    }
    seenCaseFolded.set(caseFolded, path);
    const basename = path.split('/').pop();
    const basenameLower = basename.toLowerCase();
    const hasHiddenSegment = path.split('/').some((part) => part.startsWith('.'));
    const differs = !bytesEqual(entry.before, entry.after) || entry.beforeMode !== entry.afterMode;
    const allowed = matchers.some((matcher) => matcher.test(path));
    if (entry.status === 'D' || entry.status?.startsWith('R')) {
      rejected.push(`${path}: deletions and renames must be recreated as explicit test additions or edits`);
    } else if (entry.type !== 'file') rejected.push(`${path}: non-regular file`);
    else if (entry.beforeMode && entry.afterMode && entry.beforeMode !== entry.afterMode) {
      rejected.push(`${path}: file mode changes are not importable`);
    } else if (
      hasHiddenSegment
      || FORBIDDEN_BASENAMES.has(basenameLower)
      || MANIFEST_OR_DEPENDENCY_NAME.test(basename)
      || CONFIG_NAME.test(basename)
      || path.startsWith('.github/')
    ) {
      rejected.push(`${path}: test-runner, dependency, or workflow configuration is not importable`);
    } else if (differs && !allowed) {
      rejected.push(`${path}: changed outside the test/fixture allowlist`);
    } else if (differs) changed.push(path);
  }
  if (rejected.length > 0) {
    throw new ProtocolError('IMPORT_REJECTED', rejected.join('; '));
  }
  return { ok: true, changed };
}

function git(repository, args, { encoding = 'utf8', allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', repository, ...args], {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFailure) {
    const detail = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    throw new ProtocolError('GIT_IMPORT_ERROR', detail?.trim() || `git ${args[0]} failed`);
  }
  return result;
}

function resolveCommit(repository, ref) {
  if (typeof ref !== 'string' || !ref || /[\0\r\n]/.test(ref) || ref.startsWith('-')) {
    throw new ProtocolError('INVALID_REF', `Unsafe Git ref: ${String(ref)}`);
  }
  return git(repository, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).stdout.trim();
}

function treeEntry(repository, commit, path) {
  const output = git(repository, ['ls-tree', '-z', '--full-tree', commit, '--', path], { encoding: 'buffer' }).stdout;
  if (output.length === 0) return null;
  const tab = output.indexOf(0x09);
  const header = output.subarray(0, tab).toString('utf8').split(' ');
  return { mode: header[0], type: header[1], object: header[2] };
}

function objectBytes(repository, entry) {
  if (!entry) return null;
  return git(repository, ['cat-file', '-p', entry.object], { encoding: 'buffer' }).stdout;
}

function changedPaths(repository, approved, candidate) {
  const output = git(repository, [
    'diff', '--name-status', '-z', '--find-renames', '--no-ext-diff', approved, candidate, '--',
  ], { encoding: 'buffer' }).stdout.toString('utf8');
  const tokens = output.split('\0').filter((token) => token.length > 0);
  const changes = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (/^[RC]/.test(status)) {
      const from = tokens[index++];
      const path = tokens[index++];
      changes.push({ status, from, path });
    } else {
      changes.push({ status, path: tokens[index++] });
    }
  }
  return changes;
}

function validateCandidateTreePaths(repository, candidate) {
  const output = git(repository, [
    'ls-tree', '-r', '-z', '--name-only', '--full-tree', candidate,
  ], { encoding: 'buffer' }).stdout;
  const decoded = output.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(output)) {
    throw new ProtocolError('IMPORT_REJECTED', 'Candidate tree contains a non-UTF-8 path.');
  }
  const seenCaseFolded = new Map();
  for (const rawPath of decoded.split('\0').filter((path) => path.length > 0)) {
    const path = normalizeCandidatePath(rawPath);
    const caseFolded = portableCaseFold(path);
    if (seenCaseFolded.has(caseFolded) && seenCaseFolded.get(caseFolded) !== path) {
      throw new ProtocolError(
        'IMPORT_REJECTED',
        `${path}: case-fold collision with ${seenCaseFolded.get(caseFolded)} in candidate tree`,
      );
    }
    seenCaseFolded.set(caseFolded, path);
  }
}

/** Enumerate and validate a real candidate tree against an approved Git tree. */
export function validateGitImport({ repository, approvedRef, candidateRef, allowPatterns }) {
  const approved = resolveCommit(repository, approvedRef);
  const candidate = resolveCommit(repository, candidateRef);
  validateCandidateTreePaths(repository, candidate);
  const changes = changedPaths(repository, approved, candidate);
  if (changes.length === 0) {
    throw new ProtocolError('EMPTY_CANDIDATE', 'Approved and candidate trees have no changed paths.');
  }
  const entries = changes.map(({ status, from, path }) => {
    const safePath = normalizeCandidatePath(path);
    const beforePath = from ?? safePath;
    const before = treeEntry(repository, approved, beforePath);
    const after = treeEntry(repository, candidate, safePath);
    return {
      path: safePath,
      status,
      type: after?.mode === '100644' || after?.mode === '100755' ? 'file' : after?.type ?? 'deleted',
      beforeMode: before?.mode ?? null,
      afterMode: after?.mode ?? null,
      before: objectBytes(repository, before),
      after: objectBytes(repository, after),
    };
  });
  const result = validateImportCandidate({ allowPatterns, entries });
  return { ...result, approved, candidate };
}

export function validateProvenance(manifest, observedBlobs) {
  if (!manifest?.upstream?.repository || !/^[0-9a-f]{40}$/.test(manifest?.upstream?.revision ?? '')) {
    throw new ProtocolError('INVALID_PROVENANCE', 'Provenance needs a repository and exact 40-character revision.');
  }
  if (!Array.isArray(manifest.principles) || manifest.principles.length === 0) {
    throw new ProtocolError('INVALID_PROVENANCE', 'At least one mapped upstream principle is required.');
  }
  const drifted = [];
  const paths = new Set();
  for (const principle of manifest.principles) {
    if (!principle?.path || !/^[0-9a-f]{40}$/.test(principle?.blob ?? '') || !principle?.localInvariant) {
      throw new ProtocolError('INVALID_PROVENANCE', 'Every principle needs path, exact blob, and localInvariant.');
    }
    if (paths.has(principle.path)) {
      throw new ProtocolError('INVALID_PROVENANCE', `Duplicate provenance path: ${principle.path}`);
    }
    paths.add(principle.path);
    if (!observedBlobs || !Object.hasOwn(observedBlobs, principle.path) || observedBlobs[principle.path] !== principle.blob) {
      drifted.push(principle.path);
    }
  }
  return {
    ok: drifted.length === 0,
    reviewRequired: drifted.length > 0,
    drifted,
  };
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function runCli(args) {
  const [command] = args;
  if (command !== 'git-import') {
    throw new ProtocolError(
      'UNKNOWN_COMMAND',
      'Usage: mutation-protocol.mjs git-import --repo PATH --approved REF --candidate REF --allow GLOB [--allow GLOB]',
    );
  }
  const allowPatterns = args.flatMap((value, index) => (
    value === '--allow' && args[index + 1] ? [args[index + 1]] : []
  ));
  const result = validateGitImport({
    repository: readFlag(args, '--repo'),
    approvedRef: readFlag(args, '--approved'),
    candidateRef: readFlag(args, '--candidate'),
    allowPatterns,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof ProtocolError ? error.code : 'UNEXPECTED_ERROR';
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exitCode = 1;
  }
}
