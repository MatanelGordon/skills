#!/usr/bin/env node
/**
 * Repo validator — every failure class we have actually hit, checked on CI.
 *
 * Per skill: frontmatter keys/limits, name rules, description rules, balanced
 * code fences, no control characters, scripts parse (bash -n / node --check /
 * python3 py_compile), declared depends exist.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SKILLS = join(ROOT, 'skills');
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility']);

let failures = 0;
const fail = (skill, msg) => { failures++; console.error(`  ✖ ${skill}: ${msg}`); };
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
const HAVE = { bash: has('bash'), python3: has('python3') };

/** Fence balance with nesting: a longer fence opens inside a shorter one. */
function fencesBalanced(text) {
  const stack = [];
  for (const line of text.split('\n')) {
    const m = /^(`{3,})/.exec(line);
    if (!m) continue;
    const t = m[1];
    if (stack.length && t.length >= stack[stack.length - 1].length) stack.pop();
    else stack.push(t);
  }
  return stack.length === 0;
}

const dirs = (await readdir(SKILLS, { withFileTypes: true }))
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();
const names = new Set(dirs);

for (const dir of dirs) {
  const mdPath = join(SKILLS, dir, 'SKILL.md');
  if (!existsSync(mdPath)) { fail(dir, 'SKILL.md missing'); continue; }
  const text = await readFile(mdPath, 'utf8');

  // frontmatter
  const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fmMatch) { fail(dir, 'no YAML frontmatter'); continue; }
  const fm = fmMatch[1];

  const topKeys = [...fm.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]);
  for (const k of topKeys) if (!ALLOWED_KEYS.has(k)) fail(dir, `frontmatter key '${k}' — Claude Code rejects unknown keys`);

  const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim();
  if (!name) fail(dir, 'missing name');
  else {
    if (name !== dir) fail(dir, `name '${name}' does not match directory`);
    if (!/^[a-z0-9-]+$/.test(name) || name.length > 64 || /^-|-$|--/.test(name)) fail(dir, `name '${name}' breaks kebab-case rules`);
  }

  const descBlock = /description:\s*>-?\s*\n((?:\s{2,}.*\n?)+)/.exec(fm)?.[1];
  const desc = descBlock
    ? descBlock.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
    : /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim();
  if (!desc) fail(dir, 'missing description');
  else {
    if (desc.length > 1024) fail(dir, `description ${desc.length} chars (max 1024)`);
    if (/[<>]/.test(desc)) fail(dir, 'description contains angle brackets');
  }

  // declared dependencies must exist in this repo
  const depends = /^\s{2}depends:\s*(.+)$/m.exec(fm)?.[1] ?? '';
  for (const d of depends.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!names.has(d)) fail(dir, `depends on '${d}' which is not in this repo`);
  }
  const platform = /^\s{2}platform:\s*(.+)$/m.exec(fm)?.[1]?.trim();
  if (platform && !['darwin', 'linux', 'win32'].includes(platform)) fail(dir, `unknown platform '${platform}'`);

  // every markdown file: fences + control chars
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      const ext = extname(e.name);
      if (ext === '.md') {
        const t = await readFile(full, 'utf8');
        if (!fencesBalanced(t)) fail(dir, `${e.name}: unbalanced code fences`);
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(t)) fail(dir, `${e.name}: literal control characters (write \\u001B, not ESC)`);
      } else if (ext === '.sh' && HAVE.bash) {
        const r = spawnSync('bash', ['-n', full], { encoding: 'utf8' });
        if (r.status !== 0) fail(dir, `${e.name}: bash -n → ${r.stderr.trim().split('\n')[0]}`);
      } else if (ext === '.mjs' || ext === '.js') {
        const r = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
        if (r.status !== 0) fail(dir, `${e.name}: node --check → ${r.stderr.trim().split('\n')[0]}`);
      } else if (ext === '.py' && HAVE.python3) {
        const r = spawnSync('python3', ['-m', 'py_compile', full], { encoding: 'utf8' });
        if (r.status !== 0) fail(dir, `${e.name}: py_compile → ${r.stderr.trim().split('\n').pop()}`);
      }
    }
  };
  await walk(join(SKILLS, dir));
}

// the installer itself must parse
for (const f of ['install/index.mjs', 'install/validate.mjs']) {
  const r = spawnSync(process.execPath, ['--check', join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) fail(f, `node --check → ${r.stderr.trim().split('\n')[0]}`);
}

if (failures) {
  console.error(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log(`✔ ${dirs.length} skills valid (frontmatter, fences, control chars, scripts, dependencies)`);
