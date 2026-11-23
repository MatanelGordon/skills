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
  const python = run('bash', ['-c', 'command -v python3']).stdout.trim();
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
  const runDirectory = join(dirname(worktree('any')), '_runs', 'quick-fixes');

  const created = script('wt.sh', ['rundir', 'quick-fixes'], { cwd: repo, env });
  assert.equal(created.status, EXIT.ok, created.stderr);
  assert.equal(created.stdout.trim(), runDirectory);
  for (const part of ['prompts', 'agents', 'logs']) assert.ok(existsSync(join(runDirectory, part)));
  assert.ok(!runDirectory.startsWith(repo));
  assert.equal(script('wt.sh', ['rundir', 'quick-fixes'], { cwd: repo, env }).stdout.trim(), runDirectory);
  assert.equal(script('wt.sh', ['rundir', 'a/b'], { cwd: repo, env }).status, EXIT.error);

  // A run directory must not get in the way of the worktree lifecycle or be swept by gc.
  script('wt.sh', ['new', 'p2-a'], { cwd: repo, env });
  commitFile(worktree('p2-a'), env, 'feature.txt', 'work\n', 'feat: work');
  assert.equal(script('wt.sh', ['merge', 'p2-a'], { cwd: repo, env }).status, EXIT.ok);
  assert.equal(script('wt.sh', ['gc'], { cwd: repo, env }).status, EXIT.ok);
  assert.ok(existsSync(join(runDirectory, 'logs')));
});

test('wt.sh rejects a slug with a path separator and an unknown command', options, (t) => {
  const { repo, env } = repository(t);
  assert.equal(script('wt.sh', ['new', 'a/b'], { cwd: repo, env }).status, EXIT.error);
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

  const found = script('codex-session.py', [worktree], { env: { HOME: home } });
  assert.equal(found.status, EXIT.ok, found.stderr);
  assert.equal(found.stdout.trim(), 'session-new');
  assert.equal(script('codex-session.py', [join(home, 'wt', 'p2-c')], { env: { HOME: home } }).status, EXIT.error);
  assert.equal(script('codex-session.py', [], { env: { HOME: home } }).status, EXIT.usage);
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
