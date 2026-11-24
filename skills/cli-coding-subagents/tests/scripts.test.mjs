/** Behaviour of the bundled scripts and of the Setup block in SKILL.md. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync,
  realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = fileURLToPath(new URL('..', import.meta.url));
const SCRIPTS = join(SKILL_DIR, 'scripts');
const HELPERS = ['precheck.sh', 'wt.sh', 'codex-session.py', 'ori-precheck.sh', 'ori-models.sh', 'ori-codex-home.sh'];

// The scripts are bash and python3. On Windows they run under WSL or Git Bash, not here.
const has = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
const UNSUPPORTED = process.platform === 'win32' || !has('bash') || !has('python3') || !has('git');
const options = { skip: UNSUPPORTED ? 'needs bash, python3 and git on a POSIX host' : false };

const EXIT = Object.freeze({ ok: 0, error: 1, conflict: 2, notAttempted: 3, noGit: 4, notLoggedIn: 10, exhausted: 30, unavailable: 40, usage: 64 });

const scratch = (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cli-subagents-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

// Keep the user's git configuration (signing, hooks, default branch) out of the tests.
const gitEnv = (home) => ({
  HOME: home,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CEILING_DIRECTORIES: dirname(home),
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
});

const run = (command, args, { cwd, env = {} } = {}) => spawnSync(command, args, {
  cwd, encoding: 'utf8', env: { ...process.env, ...env },
});
const script = (name, args, context) => run(name.endsWith('.py') ? 'python3' : 'bash', [join(SCRIPTS, name), ...args], context);

const git = (cwd, env, ...args) => {
  const result = run('git', args, { cwd, env });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};

const commitFile = (cwd, env, file, content, message) => {
  writeFileSync(join(cwd, file), content);
  git(cwd, env, 'add', '-A');
  git(cwd, env, 'commit', '-q', '-m', message);
};

/** A repository with one commit, and a worktree root beside it. */
const repository = (t) => {
  const root = scratch(t);
  const repo = join(root, 'repo');
  mkdirSync(repo);
  const env = { ...gitEnv(root), PARALLEL_WT_ROOT: join(root, 'worktrees') };
  git(repo, env, 'init', '-q', '-b', 'main');
  commitFile(repo, env, 'shared.txt', 'base\n', 'chore: base');
  return { repo, env, worktree: (slug) => join(root, 'worktrees', slug) };
};

const branchExists = (repo, env, branch) => (
  run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repo, env }).status === 0
);

/** A directory holding only the named fake commands plus the real python3. */
const fakeBin = (root, commands) => {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of Object.entries(commands)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  // The interpreter itself, not a pyenv or asdf shim, which would need its manager on PATH.
  const python = run('python3', ['-c', 'import sys; print(sys.executable)']).stdout.trim();
  symlinkSync(python, join(bin, 'python3'));
  return `${bin}:/usr/bin:/bin`;
};

test('every helper the skill names is present and executable', options, () => {
  for (const helper of HELPERS) {
    const mode = lstatSync(join(SCRIPTS, helper)).mode;
    assert.ok(mode & 0o111, `${helper} is not executable`);
  }
});

test('wt.sh reports a directory that is not a git repository with exit 4', options, (t) => {
  const dir = scratch(t);
  for (const args of [['new', 'p2-a'], ['list']]) {
    const result = script('wt.sh', args, { cwd: dir, env: gitEnv(dir) });
    assert.equal(result.status, EXIT.noGit, result.stderr);
    assert.match(result.stderr, /not a git repository/);
  }
});

test('wt.sh creates, merges and removes a worktree', options, (t) => {
  const { repo, env, worktree } = repository(t);

  const created = script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  assert.equal(created.status, EXIT.ok, created.stderr);
  assert.equal(created.stdout.trim(), worktree('p2-a'));
  assert.ok(branchExists(repo, env, 'sa/p2-a'));
  assert.equal(script('wt.sh', ['path', 'p2-a'], { cwd: repo, env }).stdout.trim(), worktree('p2-a'));

  commitFile(worktree('p2-a'), env, 'feature.txt', 'work\n', 'feat: work');
  const listed = script('wt.sh', ['list'], { cwd: repo, env }).stdout;
  assert.match(listed, /p2-a\s+sa\/p2-a\s+clean\s+unmerged ahead=1/);

  const merged = script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env });
  assert.equal(merged.status, EXIT.ok, merged.stderr);
  assert.ok(existsSync(join(repo, 'feature.txt')));
  assert.ok(!existsSync(worktree('p2-a')));
  assert.ok(!branchExists(repo, env, 'sa/p2-a'));
  assert.equal(script('wt.sh', ['path', 'p2-a'], { cwd: repo, env }).status, EXIT.error);
});

test('wt.sh merge refuses a worktree with uncommitted work', options, (t) => {
  const { repo, env, worktree } = repository(t);
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  writeFileSync(join(worktree('p2-a'), 'draft.txt'), 'unsaved\n');

  const merged = script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env });
  assert.equal(merged.status, EXIT.error);
  assert.match(merged.stderr, /uncommitted changes/);
  assert.ok(existsSync(join(worktree('p2-a'), 'draft.txt')));
});

test('wt.sh merge does not start when the main tree is dirty', options, (t) => {
  const { repo, env, worktree } = repository(t);
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  commitFile(worktree('p2-a'), env, 'feature.txt', 'work\n', 'feat: work');
  writeFileSync(join(repo, 'shared.txt'), 'edited by the lead\n');

  const merged = script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env });
  assert.equal(merged.status, EXIT.notAttempted);
  assert.ok(existsSync(worktree('p2-a')));
  assert.ok(!existsSync(join(repo, 'feature.txt')));
});

test('wt.sh merge stops on a conflict and keeps the worktree', options, (t) => {
  const { repo, env, worktree } = repository(t);
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  commitFile(worktree('p2-a'), env, 'shared.txt', 'from the worker\n', 'feat: worker');
  commitFile(repo, env, 'shared.txt', 'from the lead\n', 'feat: lead');

  const merged = script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env });
  assert.equal(merged.status, EXIT.conflict);
  assert.match(merged.stderr, /MAIN working tree/);
  assert.ok(existsSync(worktree('p2-a')));
  assert.ok(branchExists(repo, env, 'sa/p2-a'));
});

test('wt.sh drop discards an unmerged worktree and its branch', options, (t) => {
  const { repo, env, worktree } = repository(t);
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  commitFile(worktree('p2-a'), env, 'feature.txt', 'work\n', 'feat: work');

  assert.equal(script('wt.sh', ['drop', 'p2-a'], { cwd: repo, env }).status, EXIT.ok);
  assert.ok(!existsSync(worktree('p2-a')));
  assert.ok(!branchExists(repo, env, 'sa/p2-a'));
  assert.ok(!existsSync(join(repo, 'feature.txt')));
});

test('wt.sh rundir creates a run directory beside the worktrees, outside the repository', options, (t) => {
  const { repo, env, worktree } = repository(t);
  const runDirectory = join(dirname(worktree('any')), '.runs', 'quick-fixes');

  const created = script('wt.sh', ['rundir', 'quick-fixes'], { cwd: repo, env });
  assert.equal(created.status, EXIT.ok, created.stderr);
  assert.equal(created.stdout.trim(), runDirectory);
  for (const part of ['prompts', 'agents', 'logs']) assert.ok(existsSync(join(runDirectory, part)));
  assert.ok(!runDirectory.startsWith(repo));
  assert.equal(script('wt.sh', ['rundir', 'quick-fixes'], { cwd: repo, env }).stdout.trim(), runDirectory);
  assert.equal(script('wt.sh', ['rundir', 'a/b'], { cwd: repo, env }).status, EXIT.error);
  // No worktree slug can name the run-directory root.
  assert.equal(script('wt.sh', ['new', '.runs'], { cwd: repo, env }).status, EXIT.error);

  // A run directory must not get in the way of the worktree lifecycle or be swept by gc.
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  commitFile(worktree('p2-a'), env, 'feature.txt', 'work\n', 'feat: work');
  assert.equal(script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env }).status, EXIT.ok);
  assert.equal(script('wt.sh', ['gc'], { cwd: repo, env }).status, EXIT.ok);
  assert.ok(existsSync(join(runDirectory, 'logs')));
});

test('wt.sh rundir outside a git repository uses .sa-runs in the project', options, (t) => {
  const project = scratch(t);
  const created = script('wt.sh', ['rundir', 'date-fix'], { cwd: project, env: gitEnv(project) });
  assert.equal(created.status, EXIT.ok, created.stderr);
  assert.equal(created.stdout.trim(), join(project, '.sa-runs', 'date-fix'));
  for (const part of ['prompts', 'agents', 'logs']) assert.ok(existsSync(join(project, '.sa-runs', 'date-fix', part)));
});

test('wt.sh uses a worktree root beside the repository by default', options, (t) => {
  const { repo, env } = repository(t);
  const { PARALLEL_WT_ROOT: _unused, ...defaults } = env;
  const root = join(dirname(repo), '.wt-repo');

  const created = script('wt.sh', ['new', 'p2-a'], { cwd: repo, env: { ...defaults, PARALLEL_WT_ROOT: '' } });
  assert.equal(created.status, EXIT.ok, created.stderr);
  assert.equal(created.stdout.trim(), join(root, 'p2-a'));
  const runs = script('wt.sh', ['rundir', 'fixes'], { cwd: repo, env: { ...defaults, PARALLEL_WT_ROOT: '' } });
  assert.equal(runs.stdout.trim(), join(root, '.runs', 'fixes'));
  assert.ok(!runs.stdout.trim().startsWith(`${repo}/`));
});

test('wt.sh merge -F uses the given message, and gc removes merged worktrees only when clean', options, (t) => {
  const { repo, env, worktree } = repository(t);
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  commitFile(worktree('p2-a'), env, 'feature.txt', 'work\n', 'feat: work');
  const message = join(dirname(repo), 'message.txt');
  writeFileSync(message, 'merge: p2-a, for the reason in the plan\n');
  assert.equal(script('wt.sh', ['merge', 'p2-a', '-F', message], { cwd: repo, env }).status, EXIT.ok);
  assert.match(git(repo, env, 'log', '-1', '--format=%B'), /for the reason in the plan/);

  for (const slug of ['p2-b', 'p2-c']) {
    script('wt.sh', ['new', slug], { cwd: repo, env });
    commitFile(worktree(slug), env, `${slug}.txt`, 'work\n', `feat: ${slug}`);
    git(repo, env, 'merge', '-q', '--no-ff', '-m', `merge ${slug}`, `sa/${slug}`);
  }
  writeFileSync(join(worktree('p2-c'), 'draft.txt'), 'unsaved\n');
  const swept = script('wt.sh', ['gc'], { cwd: repo, env });
  assert.equal(swept.status, EXIT.error, 'gc must report the worktree it skipped');
  assert.ok(!existsSync(worktree('p2-b')));
  assert.ok(existsSync(join(worktree('p2-c'), 'draft.txt')));
});

test('wt.sh merge does not start during another merge or over an untracked file', options, (t) => {
  const { repo, env, worktree } = repository(t);
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  commitFile(worktree('p2-a'), env, 'feature.txt', 'work\n', 'feat: work');
  writeFileSync(join(repo, 'feature.txt'), 'the lead\'s untracked copy\n');
  const blocked = script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env });
  assert.equal(blocked.status, EXIT.notAttempted);
  assert.match(blocked.stderr, /untracked file/);
  rmSync(join(repo, 'feature.txt'));

  script('wt.sh', ['new', 'p2-b'], { cwd: repo, env });
  commitFile(worktree('p2-b'), env, 'shared.txt', 'from p2-b\n', 'feat: p2-b');
  commitFile(repo, env, 'shared.txt', 'from the lead\n', 'feat: lead');
  assert.equal(script('wt.sh', ['merge', 'p2-b'], { cwd: repo, env }).status, EXIT.conflict);
  const during = script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env });
  assert.equal(during.status, EXIT.notAttempted);
  assert.match(during.stderr, /already in progress/);
});

test('wt.sh says git is missing when it is, rather than "not a git repository"', options, (t) => {
  const dir = scratch(t);
  mkdirSync(join(dir, 'empty-bin'));
  const result = run('/bin/bash', [join(SCRIPTS, 'wt.sh'), 'list'], { cwd: dir, env: { PATH: join(dir, 'empty-bin'), HOME: dir } });
  assert.equal(result.status, EXIT.error);
  assert.match(result.stderr, /git is not installed/);
});

test('wt.sh rejects a slug with a path separator and an unknown command', options, (t) => {
  const { repo, env } = repository(t);
  assert.equal(script('wt.sh', ['new', 'a/b'], { cwd: repo, env }).status, EXIT.error);
  assert.equal(script('wt.sh', ['new', '-x'], { cwd: repo, env }).status, EXIT.error);
  assert.equal(script('wt.sh', ['rundir', '--help'], { cwd: repo, env }).status, EXIT.error);
  assert.equal(script('wt.sh', ['teleport'], { cwd: repo, env }).status, EXIT.usage);
});

test('ori-codex-home.sh links the shared files and leaves a correct link alone', options, (t) => {
  const home = scratch(t);
  assert.equal(script('ori-codex-home.sh', [], { env: { HOME: home } }).status, EXIT.error);

  mkdirSync(join(home, '.codex', 'rules'), { recursive: true });
  mkdirSync(join(home, '.codex', 'skills'));
  writeFileSync(join(home, '.codex', 'AGENTS.md'), '# agents\n');
  const first = script('ori-codex-home.sh', [], { env: { HOME: home } });
  assert.equal(first.status, EXIT.ok, first.stderr);
  for (const item of ['AGENTS.md', 'rules', 'skills']) {
    assert.equal(readlinkSync(join(home, '.ori-codex', item)), join(home, '.codex', item));
  }

  const link = join(home, '.ori-codex', 'skills');
  const before = lstatSync(link, { bigint: true });
  assert.equal(script('ori-codex-home.sh', [], { env: { HOME: home } }).status, EXIT.ok);
  const after = lstatSync(link, { bigint: true });
  assert.deepEqual([after.ino, after.ctimeNs], [before.ino, before.ctimeNs], 'a correct link was replaced');
});

test('ori-codex-home.sh repairs a link that points somewhere else', options, (t) => {
  const home = scratch(t);
  mkdirSync(join(home, '.codex', 'rules'), { recursive: true });
  mkdirSync(join(home, '.ori-codex'));
  symlinkSync(join(home, 'elsewhere'), join(home, '.ori-codex', 'rules'));

  assert.equal(script('ori-codex-home.sh', [], { env: { HOME: home } }).status, EXIT.ok);
  assert.equal(readlinkSync(join(home, '.ori-codex', 'rules')), join(home, '.codex', 'rules'));
});

test('ori-precheck.sh separates a missing CLI, a missing credential and a usable one', options, (t) => {
  const root = scratch(t);
  const auth = '{"data":{"authenticated":true,"userId":"user_private_1","source":{"kind":"workspace","location":"/w/.ori/store.json"}}}';

  const missing = script('ori-precheck.sh', [], { env: { PATH: fakeBin(join(root, 'a'), {}) } });
  assert.equal(missing.status, EXIT.unavailable);

  const loggedOut = script('ori-precheck.sh', [], { env: { PATH: fakeBin(join(root, 'b'), { ori: 'exit 1' }) } });
  assert.equal(loggedOut.status, EXIT.notLoggedIn);
  assert.match(loggedOut.stdout, /ori login/);

  const path = fakeBin(join(root, 'c'), { ori: `echo '${auth}'` });
  const ready = script('ori-precheck.sh', [], { env: { PATH: path } });
  assert.equal(ready.status, EXIT.ok, ready.stderr);
  assert.match(ready.stdout, /credential source: workspace/);
  assert.match(ready.stdout, /workspace-scoped credential/);
  assert.doesNotMatch(ready.stdout, /user_private_1/);

  const asJson = JSON.parse(script('ori-precheck.sh', ['--json'], { env: { PATH: path } }).stdout);
  assert.equal(asJson.exit_code, EXIT.ok);
  assert.doesNotMatch(JSON.stringify(asJson), /user_private_1/);

  const unauthenticated = script('ori-precheck.sh', [], {
    env: { PATH: fakeBin(join(root, 'd'), { ori: `echo '{"data":{"authenticated":false}}'` }) },
  });
  assert.equal(unauthenticated.status, EXIT.notLoggedIn);
  const garbled = script('ori-precheck.sh', [], { env: { PATH: fakeBin(join(root, 'e'), { ori: 'echo not-json' }) } });
  assert.equal(garbled.status, EXIT.unavailable);
});

/** A fake curl that serves the models list and the key record from files. */
const FAKE_CURL = `out=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift 2 ;; -H|--max-time) shift 2 ;; -*) shift ;; *) url="$1"; shift ;; esac
done
case "$url" in */models) cp "$FAKE_MODELS" "$out" ;; */key) cp "$FAKE_KEY" "$out" ;; *) exit 22 ;; esac`;

const MODELS = { data: [
  { id: 'google/lyria-3-pro-preview', context_length: 1048576, pricing: { prompt: '0', completion: '0' },
    architecture: { output_modalities: ['audio'] }, supported_parameters: [] },
  { id: 'vendor-a/coder:free', context_length: 1048576, pricing: { prompt: '0', completion: '0' },
    architecture: { output_modalities: ['text'] }, supported_parameters: ['tools'] },
  { id: 'vendor-b/reviewer:free', context_length: 262144, pricing: { prompt: '0', completion: '0' },
    architecture: { output_modalities: ['text'] }, supported_parameters: ['tools'] },
  { id: 'vendor-c/cheap', context_length: 1048576, pricing: { prompt: '0.0000001', completion: '0.0000002' },
    architecture: { output_modalities: ['text'] }, supported_parameters: ['tools'] },
] };

test('ori-models.sh decides from capability fields and checks the wallet before paid models', options, (t) => {
  const root = scratch(t);
  const files = { FAKE_MODELS: join(root, 'models.json'), FAKE_KEY: join(root, 'key.json') };
  writeFileSync(files.FAKE_MODELS, JSON.stringify(MODELS));
  const env = { HOME: root, PATH: fakeBin(root, { curl: FAKE_CURL }), ...files };

  const free = script('ori-models.sh', ['--free-only', '--json', '--all'], { env });
  assert.equal(free.status, EXIT.ok, free.stderr);
  const listing = JSON.parse(free.stdout);
  assert.deepEqual(listing.author_tier.models.map((m) => m.id), ['vendor-a/coder:free']);
  assert.deepEqual(listing.review_tier.models.map((m) => m.id).sort(), ['vendor-a/coder:free', 'vendor-b/reviewer:free']);
  const lyria = listing.rejected.find((m) => m.id === 'google/lyria-3-pro-preview');
  assert.match(lyria.reason, /not text/);

  writeFileSync(files.FAKE_KEY, JSON.stringify({ data: { limit_remaining: 0, is_free_tier: true } }));
  const broke = script('ori-models.sh', ['--json'], { env: { ...env, OPENROUTER_API_KEY: 'test-key' } });
  assert.equal(broke.status, EXIT.notLoggedIn, 'an empty wallet must stop paid recommendations');
  assert.equal(JSON.parse(broke.stdout).wallet.blocks_paid_models, true);
  assert.doesNotMatch(broke.stdout, /test-key/);

  writeFileSync(files.FAKE_KEY, JSON.stringify({ data: { limit_remaining: 5, is_free_tier: false } }));
  const funded = script('ori-models.sh', ['--json'], { env: { ...env, OPENROUTER_API_KEY: 'test-key' } });
  assert.equal(funded.status, EXIT.ok, funded.stderr);
  assert.ok(JSON.parse(funded.stdout).author_tier.models.some((m) => m.id === 'vendor-c/cheap'));
});

test('precheck.sh reads "Not logged in" as logged out, and a spent window as exhausted', options, (t) => {
  const root = scratch(t);
  const loggedOut = script('precheck.sh', ['codex'], {
    env: { HOME: root, PATH: fakeBin(join(root, 'out'), { codex: 'echo "Not logged in"' }) },
  });
  assert.equal(loggedOut.status, EXIT.notLoggedIn);

  const path = fakeBin(join(root, 'in'), { codex: 'echo "Logged in using ChatGPT"' });
  const fresh = script('precheck.sh', ['codex'], { env: { HOME: root, PATH: path } });
  assert.equal(fresh.status, EXIT.ok, fresh.stderr);
  assert.match(fresh.stdout, /no local usage history/);

  const sessions = join(root, '.codex', 'sessions', '2026', '11', '23');
  mkdirSync(sessions, { recursive: true });
  const limits = { payload: { rate_limits: { primary: { used_percent: 100, window_minutes: 10080 } } } };
  writeFileSync(join(sessions, 'rollout-a.jsonl'), `${JSON.stringify(limits)}\n`);
  const spent = script('precheck.sh', ['codex', '--json'], { env: { HOME: root, PATH: path } });
  assert.equal(spent.status, EXIT.exhausted);
  assert.equal(JSON.parse(spent.stdout).worst_code, EXIT.exhausted);

  assert.equal(script('precheck.sh', ['gemini'], { env: { HOME: root, PATH: path } }).status, EXIT.usage);
});

test('precheck.sh asks before copilot bills paid overage, and stops when overage is not allowed', options, (t) => {
  const root = scratch(t);
  mkdirSync(join(root, '.copilot'));
  writeFileSync(join(root, '.copilot', 'config.json'), JSON.stringify({ loggedInUsers: [{ login: 'someone' }] }));
  const quota = join(root, 'quota.json');
  const path = fakeBin(root, { node: 'echo v24.3.0', copilot: 'exit 0', gh: `cat "${quota}"` });
  const snapshot = (fields) => JSON.stringify({
    copilot_plan: 'pro', quota_reset_date: '2026-12-01',
    quota_snapshots: { premium_interactions: { entitlement: 300, credits_used: 300, ...fields } },
  });
  const check = () => script('precheck.sh', ['copilot'], { env: { HOME: root, PATH: path } });

  writeFileSync(quota, snapshot({ percent_remaining: 0, overage_count: 12, overage_entitlement: 100, overage_permitted: true }));
  const overage = check();
  assert.equal(overage.status, 20, overage.stderr);
  assert.match(overage.stdout, /PAID OVERAGE/);
  assert.match(overage.stdout, /12\/100/);

  writeFileSync(quota, snapshot({ percent_remaining: 0, overage_permitted: false }));
  assert.equal(check().status, EXIT.exhausted);

  writeFileSync(quota, snapshot({ credits_used: 120, percent_remaining: 60 }));
  assert.equal(check().status, EXIT.ok);

  writeFileSync(quota, 'not json');
  assert.equal(check().status, 20, 'an unreadable quota must ask, not assume headroom');
});

test('codex-session.py picks the newest session recorded for a worktree', options, (t) => {
  const home = scratch(t);
  const sessions = join(home, '.codex', 'sessions', '2026', '11', '23');
  const worktree = join(home, 'wt', 'p2-a');
  mkdirSync(sessions, { recursive: true });
  mkdirSync(worktree, { recursive: true });
  const rollout = (name, sessionId, cwd, modified) => {
    const file = join(sessions, `rollout-${name}.jsonl`);
    writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { session_id: sessionId, cwd } })}\n`);
    utimesSync(file, modified, modified);
  };
  rollout('old', 'session-old', worktree, 1_000);
  rollout('new', 'session-new', worktree, 2_000);
  rollout('other', 'session-other', join(home, 'wt', 'p2-b'), 3_000);

  const found = script('codex-session.py', [worktree], { env: { HOME: home, CODEX_HOME: '' } });
  assert.equal(found.status, EXIT.ok, found.stderr);
  assert.equal(found.stdout.trim(), 'session-new');
  assert.equal(script('codex-session.py', [join(home, 'wt', 'p2-c')], { env: { HOME: home } }).status, EXIT.error);
  assert.equal(script('codex-session.py', [], { env: { HOME: home } }).status, EXIT.usage);
});

test('codex-session.py reads the sessions of the CODEX_HOME the worker ran under', options, (t) => {
  const home = scratch(t);
  const worktree = join(home, 'wt', 'or-fix');
  const sessions = join(home, '.ori-codex', 'sessions', '2026', '11', '23');
  mkdirSync(sessions, { recursive: true });
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(sessions, 'rollout-or.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { session_id: 'session-ori', cwd: worktree } })}\n`);

  const env = { HOME: home, CODEX_HOME: join(home, '.ori-codex') };
  const found = script('codex-session.py', [worktree], { env });
  assert.equal(found.status, EXIT.ok, found.stderr);
  assert.equal(found.stdout.trim(), 'session-ori');
  assert.equal(script('codex-session.py', [worktree], { env: { HOME: home, CODEX_HOME: '' } }).status, EXIT.error);
});

/** The first bash block under "## Setup" in SKILL.md: what an agent is told to run. */
const setupBlock = () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const section = /^## Setup\n([\s\S]*?)(?=^## )/m.exec(skill)?.[1] ?? '';
  return /```bash\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
};

const installCopy = (home, agentDir, helpers) => {
  const scripts = join(home, agentDir, 'skills', 'cli-coding-subagents', 'scripts');
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(scripts, '..', 'SKILL.md'), '# copy\n');
  for (const helper of helpers) {
    writeFileSync(join(scripts, helper), '#!/bin/sh\n');
    chmodSync(join(scripts, helper), 0o755);
  }
  return join(home, agentDir, 'skills', 'cli-coding-subagents');
};

test('the Setup block skips an incomplete copy and prints the complete one', options, (t) => {
  const block = setupBlock();
  assert.ok(block.includes('cli-coding-subagents'), 'SKILL.md has no bash block under "## Setup"');

  const home = scratch(t);
  const env = { HOME: home, CODEX_HOME: '' };
  installCopy(home, '.claude', ['precheck.sh', 'wt.sh', 'codex-session.py']);
  const none = run('bash', ['-c', block], { env });
  assert.equal(none.status, EXIT.unavailable, 'a copy without the ori helpers was accepted');
  assert.match(none.stderr, /reinstall/i);

  const complete = installCopy(home, '.copilot', HELPERS);
  const found = run('bash', ['-c', block], { env });
  assert.equal(found.status, EXIT.ok, found.stderr);
  assert.equal(found.stdout.trim().split('\n').pop(), complete);
});
