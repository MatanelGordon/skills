#!/usr/bin/env node

/** Reachable protocol gates for mutation result semantics, provenance, and test-only Git imports. */

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

const ENGINE_STATUS_MAPS = {
  'stryker-js': {
    Killed: 'detected', Timeout: 'detected', TimedOut: 'detected',
    Survived: 'undetected', NoCoverage: 'undetected',
    CompileError: 'excluded', RuntimeError: 'excluded',
    Ignored: 'out-of-scope', Pending: 'pending',
  },
  'stryker-net': {
    Killed: 'detected', Timeout: 'detected', TimedOut: 'detected',
    Survived: 'undetected', NoCoverage: 'undetected',
    CompileError: 'excluded', RuntimeError: 'excluded',
    Ignored: 'out-of-scope', Pending: 'pending',
  },
  gremlins: {
    KILLED: 'detected', 'TIMED OUT': 'detected', TIMED_OUT: 'detected',
    LIVED: 'undetected', 'NOT COVERED': 'undetected', NOT_COVERED: 'undetected',
    'NOT VIABLE': 'excluded', NOT_VIABLE: 'excluded', SKIPPED: 'out-of-scope',
  },
  'cargo-mutants': {
    CaughtMutant: 'detected', caught: 'detected', Timeout: 'detected', timeout: 'detected',
    MissedMutant: 'undetected', missed: 'undetected',
    Unviable: 'excluded', unviable: 'excluded', skipped: 'out-of-scope',
  },
  mutmut: {
    killed: 'detected', timeout: 'detected', 'caught by type check': 'detected',
    caught_by_type_check: 'detected', survived: 'undetected', 'no tests': 'undetected',
    no_tests: 'undetected', untested: 'undetected', suspicious: 'excluded', segfault: 'excluded',
    skipped: 'out-of-scope', 'not checked': 'pending', not_checked: 'pending',
    'check was interrupted by user': 'pending', check_was_interrupted_by_user: 'pending',
  },
};

const RESOLVING_TRIAGE = new Set(['equivalent', 'unreachable']);
const TIMEOUT_LABELS = new Set(['Timeout', 'TimedOut', 'TIMED OUT', 'TIMED_OUT', 'timeout']);

/** Preserve the raw label while deriving the engine meaning and workflow decision. */
export function classifyMutationResult({
  engine,
  mutantId,
  rawStatus,
  location,
  reportSha256,
  triage = null,
  budgetExhausted = false,
}) {
  if (!engine || !mutantId || !rawStatus || !location) {
    throw new ProtocolError('INVALID_RESULT', 'engine, mutantId, rawStatus, and location are required.');
  }
  const statuses = ENGINE_STATUS_MAPS[engine];
  if (!statuses || !Object.hasOwn(statuses, rawStatus)) {
    throw new ProtocolError('UNKNOWN_RAW_STATUS', `${engine} status '${rawStatus}' has no audited mapping.`);
  }
  const nativeMeaning = statuses[rawStatus];
  let workflowDecision;
  if (budgetExhausted || nativeMeaning === 'pending') workflowDecision = 'incomplete';
  else if (nativeMeaning === 'detected') workflowDecision = 'verified';
  else if (nativeMeaning === 'undetected') workflowDecision = 'actionable-survivor';
  else workflowDecision = 'resolved';

  if (triage?.disposition === 'returned-to-implementation') {
    workflowDecision = 'returned-to-implementation';
  } else if (nativeMeaning === 'undetected' && RESOLVING_TRIAGE.has(triage?.disposition)) {
    if (!triage?.rationale || !triage?.reviewer) {
      throw new ProtocolError(
        'INVALID_TRIAGE',
        `${triage.disposition} triage requires a rationale and independent reviewer.`,
      );
    }
    workflowDecision = triage.disposition === 'equivalent' ? 'equivalent' : 'resolved';
  }

  return {
    raw: {
      engine,
      mutantId,
      status: rawStatus,
      location,
      ...(reportSha256 ? { reportSha256 } : {}),
    },
    nativeMeaning,
    workflowDecision,
    triage,
    budgetExhausted: Boolean(budgetExhausted),
    needsSpotCheck: TIMEOUT_LABELS.has(rawStatus),
    blocksCompletion: ['actionable-survivor', 'incomplete', 'returned-to-implementation'].includes(workflowDecision),
  };
}

const FIXTURE_SEGMENTS = new Set(['fixture', 'fixtures', 'testdata', '__snapshots__', '__mocks__']);
const TEST_SEGMENTS = new Set(['test', 'tests', '__tests__', 'e2e', 'cypress', 'benches', ...FIXTURE_SEGMENTS]);
const FORBIDDEN_EXACT_NAMES = new Set([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock',
  'bun.lock', 'bun.lockb', 'cargo.toml', 'cargo.lock', 'go.mod', 'go.sum', 'go.work',
  'go.work.sum', 'pyproject.toml', 'setup.py', 'setup.cfg', 'pipfile', 'pipfile.lock',
  'poetry.lock', 'uv.lock', 'global.json', 'nuget.config', 'packages.config',
  'directory.packages.props', 'packages.lock.json', 'deno.json', 'deno.jsonc',
  'makefile', 'justfile', 'dockerfile', 'pytest.ini', 'tox.ini', 'conftest.py',
  'mocha.opts', 'noxfile.py', 'pom.xml', 'cmakelists.txt', 'docker-compose.yml',
  'docker-compose.yaml', '.gitattributes', '.gitignore', '.editorconfig',
]);

function isRunnerOrDependencyName(name) {
  const lower = name.toLowerCase();
  return FORBIDDEN_EXACT_NAMES.has(lower)
    || /(?:^|\.)(?:config|conf)\.(?:js|cjs|mjs|ts|cts|mts|json|ya?ml)$/.test(lower)
    || /^(?:requirements|constraints)(?:[._-].*)?\.(?:txt|in)$/.test(lower)
    || /\.(?:csproj|fsproj|vbproj|sln|props|targets|runsettings|testsettings)$/.test(lower);
}

function isSafeAllowPattern(pattern) {
  if (
    typeof pattern !== 'string'
    || pattern.length === 0
    || pattern.endsWith('/')
    || pattern.startsWith('/')
    || pattern.startsWith('./')
    || pattern.includes('\\')
    || /[\x00-\x1f\x7f?\[\]{}]/.test(pattern)
    || pattern.split('/').some((segment) => segment === '..' || segment === '.')
  ) return false;

  const segments = pattern.split('/');
  if (segments.some((segment) => TEST_SEGMENTS.has(segment.toLowerCase()))) return true;
  if (segments.some((segment) => /(?:^|[._-])tests?(?:[._-]|$)/i.test(segment) && !segment.includes('*'))) {
    return true;
  }
  const basename = segments.at(-1);
  return /^(?:\*+_test\.go|\*+Tests\.cs|\*+Test\.java|test_\*+\.py|\*+_test\.py|\*+\.(?:test|spec|cy)\.[A-Za-z0-9*]+|\*+\.(?:snap|feature))$/.test(basename);
}

/** Linear-space glob matching for the intentionally small '*'/'**' dialect. */
function globMatches(pattern, path) {
  let current = new Uint8Array(path.length + 1);
  current[0] = 1;
  for (let patternIndex = 0; patternIndex < pattern.length;) {
    const doubled = pattern[patternIndex] === '*' && pattern[patternIndex + 1] === '*';
    const token = doubled ? '**' : pattern[patternIndex];
    patternIndex += doubled ? 2 : 1;
    const next = new Uint8Array(path.length + 1);
    if (token === '**') {
      next.set(current);
      for (let pathIndex = 1; pathIndex <= path.length; pathIndex += 1) {
        if (next[pathIndex - 1] || current[pathIndex]) next[pathIndex] = 1;
      }
    } else if (token === '*') {
      next.set(current);
      for (let pathIndex = 1; pathIndex <= path.length; pathIndex += 1) {
        if (path[pathIndex - 1] !== '/' && (next[pathIndex - 1] || current[pathIndex])) next[pathIndex] = 1;
      }
    } else {
      for (let pathIndex = 1; pathIndex <= path.length; pathIndex += 1) {
        if (path[pathIndex - 1] === token && current[pathIndex - 1]) next[pathIndex] = 1;
      }
    }
    current = next;
  }
  return current[path.length] === 1;
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
    || parts.some((part) => part === '..' || part === '.' || part === '' || /[<>:"|?*]/.test(part) || /[. ]$/.test(part))
    || posix.normalize(path) !== path
    || path.normalize('NFC') !== path
  ) {
    throw new ProtocolError('IMPORT_REJECTED', `${String(path)}: unsafe or non-canonical path`);
  }
  return path;
}

function portableCaseFold(path) {
  return path.normalize('NFKC').toUpperCase().toLowerCase();
}

export function validateImportCandidate({ allowPatterns, entries }) {
  if (!Array.isArray(allowPatterns) || allowPatterns.length === 0 || !Array.isArray(entries)) {
    throw new ProtocolError('INVALID_IMPORT', 'Import validation requires allowPatterns and entries.');
  }
  for (const pattern of allowPatterns) {
    if (!isSafeAllowPattern(pattern)) {
      throw new ProtocolError('INVALID_ALLOWLIST', `Unsupported or unsafe test allow pattern: ${String(pattern)}`);
    }
  }
  if (entries.length === 0) {
    throw new ProtocolError('EMPTY_CANDIDATE', 'A test-only candidate must contain at least one changed path.');
  }

  const changed = [];
  const rejected = [];
  const seen = new Set();
  for (const entry of entries) {
    let path;
    try {
      path = normalizeCandidatePath(entry?.path);
    } catch (error) {
      rejected.push(error.message);
      continue;
    }
    if (seen.has(path)) {
      rejected.push(`${path}: duplicate candidate entry`);
      continue;
    }
    seen.add(path);
    const segments = path.split('/');
    const basename = segments.at(-1);
    const fixture = segments.some((segment) => FIXTURE_SEGMENTS.has(segment.toLowerCase()));
    const allowed = allowPatterns.some((pattern) => globMatches(pattern, path));
    const beforeMode = entry.beforeMode ?? '000000';
    const afterMode = entry.afterMode ?? '000000';

    if (!allowed) rejected.push(`${path}: changed outside the test/fixture allowlist`);
    else if (entry.status === 'D' || afterMode === '000000') rejected.push(`${path}: deletion is not importable`);
    else if (entry.status === 'T' || ['120000', '160000'].includes(beforeMode) || ['120000', '160000'].includes(afterMode)) {
      rejected.push(`${path}: symlinks, submodules, and type changes are not importable`);
    } else if (beforeMode !== '000000' && beforeMode !== afterMode) rejected.push(`${path}: file mode change is not importable`);
    else if (afterMode === '100755' && beforeMode === '000000') rejected.push(`${path}: new executable is not importable`);
    else if (!['100644', '100755'].includes(afterMode)) rejected.push(`${path}: non-regular file mode ${afterMode}`);
    else if (segments.some((segment) => segment.startsWith('.') || segment.toLowerCase() === 'node_modules')) {
      rejected.push(`${path}: hidden or dependency path is not importable`);
    } else if (!fixture && isRunnerOrDependencyName(basename)) {
      rejected.push(`${path}: runner, dependency, or build configuration is not importable`);
    } else changed.push(path);
  }
  if (rejected.length > 0) throw new ProtocolError('IMPORT_REJECTED', rejected.join('; '));
  return { ok: true, changed: changed.sort() };
}

function isolatedGitEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
}

function git(repository, args, { encoding = 'utf8' } = {}) {
  const result = spawnSync('git', ['--no-replace-objects', '-C', repository, ...args], {
    encoding,
    env: isolatedGitEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new ProtocolError(
      result.error.code === 'ENOENT' ? 'GIT_UNAVAILABLE' : 'GIT_IMPORT_ERROR',
      `git could not run: ${result.error.code ?? result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    throw new ProtocolError('GIT_IMPORT_ERROR', stderr?.trim() || `git ${args[0]} failed with ${result.status}`);
  }
  return result.stdout;
}

function repositoryRoot(repository) {
  if (typeof repository !== 'string' || !repository) {
    throw new ProtocolError('CLI_USAGE', 'Missing required option --repo.');
  }
  return git(repository, ['rev-parse', '--show-toplevel']).trim();
}

function resolveCommit(repository, ref, flag) {
  if (typeof ref !== 'string' || !ref || /[\0\r\n]/.test(ref) || ref.startsWith('-')) {
    throw new ProtocolError('INVALID_REF', `${flag} must be a safe Git ref.`);
  }
  return git(repository, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
}

function decodeUtf8(bytes, context) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ProtocolError('IMPORT_REJECTED', `${context} contains a non-UTF-8 path.`);
  }
}

function changedEntries(repository, approved, candidate) {
  const output = git(repository, [
    'diff-tree', '-r', '--raw', '-z', '--no-commit-id', '--no-renames',
    '--ignore-submodules=none', approved, candidate, '--',
  ], { encoding: 'buffer' });
  const tokens = [];
  let start = 0;
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] === 0) {
      tokens.push(output.subarray(start, index));
      start = index + 1;
    }
  }
  const entries = [];
  for (let index = 0; index < tokens.length - 1; index += 2) {
    const metadata = decodeUtf8(tokens[index], 'Git diff metadata');
    const path = decodeUtf8(tokens[index + 1], 'Candidate');
    const match = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])$/.exec(metadata);
    if (!match) throw new ProtocolError('GIT_IMPORT_ERROR', `Unexpected git diff-tree record: ${metadata}`);
    entries.push({
      path,
      status: match[5],
      beforeMode: match[1],
      afterMode: match[2],
      beforeObject: match[3],
      afterObject: match[4],
    });
  }
  return entries;
}

function candidatePaths(repository, candidate) {
  const output = git(repository, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', candidate], { encoding: 'buffer' });
  const paths = [];
  let start = 0;
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] === 0) {
      paths.push(decodeUtf8(output.subarray(start, index), 'Candidate tree'));
      start = index + 1;
    }
  }
  return paths;
}

function validateChangedPathCollisions(entries, treePaths) {
  const foldedPrefixes = new Map();
  for (const treePath of treePaths) {
    const parts = treePath.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      const prefix = parts.slice(0, index).join('/');
      const folded = portableCaseFold(prefix);
      const existing = foldedPrefixes.get(folded);
      if (!existing) foldedPrefixes.set(folded, prefix);
      else if (existing !== prefix) foldedPrefixes.set(folded, null);
    }
  }
  for (const { path } of entries) {
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      const prefix = parts.slice(0, index).join('/');
      if (foldedPrefixes.get(portableCaseFold(prefix)) === null) {
        throw new ProtocolError('IMPORT_REJECTED', `${path}: portable case-fold collision at ${prefix}`);
      }
    }
  }
}

/** Validate an importable candidate: one direct child of the exact frozen integration target. */
export function validateGitImport({ repository, approvedRef, integrationRef, candidateRef, allowPatterns }) {
  const root = repositoryRoot(repository);
  const approved = resolveCommit(root, approvedRef, '--approved');
  const integration = resolveCommit(root, integrationRef, '--integration');
  const candidate = resolveCommit(root, candidateRef, '--candidate');
  if (integration !== approved) {
    throw new ProtocolError(
      'STALE_INTEGRATION_TARGET',
      `Integration target ${integration} no longer equals frozen approved commit ${approved}. Regenerate the candidate.`,
    );
  }
  const parents = git(root, ['rev-list', '--parents', '-n', '1', candidate]).trim().split(/\s+/).slice(1);
  if (parents.length !== 1 || parents[0] !== approved) {
    throw new ProtocolError(
      'HISTORY_NOT_IMPORTABLE',
      `Candidate ${candidate} must be one non-merge commit directly on ${approved}; never replay candidate history.`,
    );
  }
  const entries = changedEntries(root, approved, candidate);
  const result = validateImportCandidate({ allowPatterns, entries });
  validateChangedPathCollisions(entries, candidatePaths(root, candidate));
  return {
    ...result,
    repository: root,
    approved,
    integration,
    candidate,
    importMethod: 'git-restore-paths',
  };
}

function parseGitHubRepository(url) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url ?? '');
  if (!match) throw new ProtocolError('INVALID_PROVENANCE', 'Upstream repository must be a GitHub HTTPS URL.');
  return { owner: match[1], repository: match[2] };
}

function validateProvenanceManifest(manifest) {
  parseGitHubRepository(manifest?.upstream?.repository);
  if (!/^[0-9a-f]{40}$/.test(manifest?.upstream?.revision ?? '') || !manifest?.upstream?.trackingRef) {
    throw new ProtocolError('INVALID_PROVENANCE', 'Provenance needs an exact revision and trackingRef.');
  }
  if (!Array.isArray(manifest.principles) || manifest.principles.length === 0) {
    throw new ProtocolError('INVALID_PROVENANCE', 'Provenance needs at least one pinned upstream path.');
  }
  const seen = new Set();
  for (const principle of manifest.principles) {
    if (!principle?.path || !/^[0-9a-f]{40}$/.test(principle?.blob ?? '') || seen.has(principle.path)) {
      throw new ProtocolError('INVALID_PROVENANCE', 'Every upstream path needs one unique 40-character blob pin.');
    }
    seen.add(principle.path);
  }
}

/** Compare pinned blobs with the upstream tracking ref through the GitHub API. */
export async function checkProvenance(manifest, {
  fetchImpl = globalThis.fetch,
  apiBase = 'https://api.github.com',
  token = process.env.GITHUB_TOKEN,
} = {}) {
  validateProvenanceManifest(manifest);
  if (typeof fetchImpl !== 'function') throw new ProtocolError('PROVENANCE_CHECK_FAILED', 'fetch is unavailable.');
  const { owner, repository } = parseGitHubRepository(manifest.upstream.repository);
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'mutation-testing-provenance-check' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const observed = {};
  for (const principle of manifest.principles) {
    const encodedPath = principle.path.split('/').map(encodeURIComponent).join('/');
    const url = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}?ref=${encodeURIComponent(manifest.upstream.trackingRef)}`;
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new ProtocolError('PROVENANCE_CHECK_FAILED', `Upstream returned HTTP ${response.status} for ${principle.path}.`);
    }
    observed[principle.path] = (await response.json()).sha;
  }
  const drifted = manifest.principles
    .filter((principle) => observed[principle.path] !== principle.blob)
    .map((principle) => principle.path);
  return {
    ok: drifted.length === 0,
    reviewRequired: drifted.length > 0,
    repository: manifest.upstream.repository,
    pinnedRevision: manifest.upstream.revision,
    trackingRef: manifest.upstream.trackingRef,
    observed,
    drifted,
  };
}

const USAGE = `Usage:
  mutation-protocol.mjs git-import --repo PATH --approved REF --integration REF --candidate REF --allow GLOB [--allow GLOB]
  mutation-protocol.mjs classify --engine ID --status LABEL --mutant ID --location PATH [--triage DISPOSITION --rationale TEXT --reviewer ID] [--budget-exhausted]
  mutation-protocol.mjs provenance-check --manifest PATH [--api-base URL]
`;

function parseOptions(args, options, required, repeatable = new Set()) {
  let parsed;
  try {
    parsed = parseArgs({ args, strict: true, allowPositionals: false, options, tokens: true });
  } catch (error) {
    throw new ProtocolError('CLI_USAGE', error.message);
  }
  const counts = new Map();
  for (const token of parsed.tokens.filter((item) => item.kind === 'option')) {
    counts.set(token.name, (counts.get(token.name) ?? 0) + 1);
  }
  for (const [name, count] of counts) {
    if (count > 1 && !repeatable.has(name)) {
      throw new ProtocolError('CLI_USAGE', `Option --${name} may be provided only once.`);
    }
  }
  const missing = required.filter((name) => parsed.values[name] === undefined);
  if (missing.length > 0) throw new ProtocolError('CLI_USAGE', `Missing required option(s): ${missing.map((name) => `--${name}`).join(', ')}.`);
  return parsed.values;
}

async function runCli(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(USAGE);
    return;
  }
  const [command, ...rest] = args;
  if (rest.includes('--help') || rest.includes('-h')) {
    process.stdout.write(USAGE);
    return;
  }
  if (command === 'git-import') {
    const values = parseOptions(rest, {
      repo: { type: 'string' }, approved: { type: 'string' }, integration: { type: 'string' },
      candidate: { type: 'string' }, allow: { type: 'string', multiple: true },
    }, ['repo', 'approved', 'integration', 'candidate', 'allow'], new Set(['allow']));
    const result = validateGitImport({
      repository: values.repo,
      approvedRef: values.approved,
      integrationRef: values.integration,
      candidateRef: values.candidate,
      allowPatterns: values.allow,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'classify') {
    const values = parseOptions(rest, {
      engine: { type: 'string' }, status: { type: 'string' }, mutant: { type: 'string' },
      location: { type: 'string' }, 'report-sha256': { type: 'string' }, triage: { type: 'string' },
      rationale: { type: 'string' }, reviewer: { type: 'string' }, 'budget-exhausted': { type: 'boolean' },
    }, ['engine', 'status', 'mutant', 'location']);
    const triage = values.triage ? {
      disposition: values.triage, rationale: values.rationale, reviewer: values.reviewer,
    } : null;
    const result = classifyMutationResult({
      engine: values.engine,
      rawStatus: values.status,
      mutantId: values.mutant,
      location: values.location,
      reportSha256: values['report-sha256'],
      triage,
      budgetExhausted: values['budget-exhausted'],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'provenance-check') {
    const values = parseOptions(rest, {
      manifest: { type: 'string' }, 'api-base': { type: 'string' },
    }, ['manifest']);
    const manifest = JSON.parse(await readFile(values.manifest, 'utf8'));
    const result = await checkProvenance(manifest, { apiBase: values['api-base'] });
    if (!result.ok) {
      throw new ProtocolError('PROVENANCE_DRIFT', `Upstream changed: ${result.drifted.join(', ')}`);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new ProtocolError('UNKNOWN_COMMAND', `Unknown command '${command}'.\n${USAGE}`);
}

function invokedAsMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedAsMain()) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof ProtocolError ? error.code : 'UNEXPECTED_ERROR';
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exitCode = 1;
  }
}
