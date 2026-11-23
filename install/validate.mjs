#!/usr/bin/env node
/** Repository validator: structure, executable syntax, eval schemas, and release docs. */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { retiredSkillProblems } from './retired-skill-references.mjs';
import { isEntryPoint } from './entry-point.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility']);

const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const HAVE = { bash: has('bash'), python3: has('python3') };

/** Fence balance with nesting: a longer fence opens inside a shorter one. */
function fencesBalanced(text) {
  const stack = [];
  for (const line of text.split('\n')) {
    const match = /^(`{3,})/.exec(line);
    if (!match) continue;
    const token = match[1];
    if (stack.length && token.length >= stack[stack.length - 1].length) stack.pop();
    else stack.push(token);
  }
  return stack.length === 0;
}

const idKeyCount = (text) => [...text.matchAll(/"id"\s*:/g)].length;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const repositoryPath = (root, path) => relative(root, path).replaceAll('\\', '/');
const extractFrontmatter = (text) => (
  /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1]?.replace(/\r\n?/g, '\n')
);

export async function validateRepository(root = DEFAULT_ROOT) {
  root = resolve(root);
  const skillsRoot = join(root, 'skills');
  const failures = [];
  const fail = (scope, message) => failures.push(`${scope}: ${message}`);

  if (!existsSync(skillsRoot)) {
    return { failures: ['repository: skills/ missing'], skills: [], agentCount: 0 };
  }

  const dirs = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const names = new Set(dirs);

  const walk = async (skill, dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(skill, full);
        continue;
      }
      const ext = extname(entry.name);
      if (ext === '.md') {
        const text = await readFile(full, 'utf8');
        if (!fencesBalanced(text)) fail(skill, `${entry.name}: unbalanced code fences`);
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) {
          fail(skill, `${entry.name}: literal control characters (write \\u001B, not ESC)`);
        }
      } else if (ext === '.sh' && HAVE.bash) {
        const result = spawnSync('bash', ['-n', full], { encoding: 'utf8' });
        if (result.status !== 0) fail(skill, `${entry.name}: bash -n → ${result.stderr.trim().split('\n')[0]}`);
      } else if (ext === '.mjs' || ext === '.js') {
        const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
        if (result.status !== 0) fail(repositoryPath(root, full), `node --check → ${result.stderr.trim().split('\n')[0]}`);
      } else if (ext === '.py' && HAVE.python3) {
        const result = spawnSync('python3', ['-m', 'py_compile', full], {
          encoding: 'utf8',
          env: { ...process.env, PYTHONPYCACHEPREFIX: join(root, '.pycache-validation') },
        });
        if (result.status !== 0) fail(skill, `${entry.name}: py_compile → ${result.stderr.trim().split('\n').pop()}`);
      }
    }
  };

  for (const dir of dirs) {
    const mdPath = join(skillsRoot, dir, 'SKILL.md');
    if (!existsSync(mdPath)) {
      fail(dir, 'SKILL.md missing');
      continue;
    }
    const text = await readFile(mdPath, 'utf8');
    const fm = extractFrontmatter(text);
    if (!fm) {
      fail(dir, 'no YAML frontmatter');
      continue;
    }
    const topKeys = [...fm.matchAll(/^([A-Za-z][\w-]*):/gm)].map((match) => match[1]);
    for (const key of topKeys) {
      if (!ALLOWED_KEYS.has(key)) fail(dir, `frontmatter key '${key}' — Claude Code rejects unknown keys`);
    }

    const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim();
    if (!name) fail(dir, 'missing name');
    else {
      if (name !== dir) fail(dir, `name '${name}' does not match directory`);
      if (!/^[a-z0-9-]+$/.test(name) || name.length > 64 || /^-|-$|--/.test(name)) {
        fail(dir, `name '${name}' breaks kebab-case rules`);
      }
    }

    const descBlock = /description:\s*>-?\s*\n((?:\s{2,}.*\n?)+)/.exec(fm)?.[1];
    const desc = descBlock
      ? descBlock.split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
      : /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim();
    if (!desc) fail(dir, 'missing description');
    else {
      if (desc.length > 1024) fail(dir, `description ${desc.length} chars (max 1024)`);
      if (/[<>]/.test(desc)) fail(dir, 'description contains angle brackets');
    }

    const depends = /^\s{2}depends:\s*(.+)$/m.exec(fm)?.[1] ?? '';
    for (const dependency of depends.split(',').map((value) => value.trim()).filter(Boolean)) {
      if (!names.has(dependency)) fail(dir, `depends on '${dependency}' which is not in this repo`);
    }
    const platform = /^\s{2}platform:\s*(.+)$/m.exec(fm)?.[1]?.trim();
    if (platform && !['darwin', 'linux', 'win32'].includes(platform)) fail(dir, `unknown platform '${platform}'`);

    await walk(dir, join(skillsRoot, dir));
  }

  for (const dir of dirs) {
    const evalPath = join(skillsRoot, dir, 'evals', 'evals.json');
    if (!existsSync(evalPath)) {
      fail(dir, 'evals/evals.json missing — every skill needs a verification suite');
      continue;
    }
    let raw;
    let doc;
    try {
      raw = await readFile(evalPath, 'utf8');
      doc = JSON.parse(raw);
    } catch (error) {
      fail(dir, `evals.json: invalid JSON — ${error.message}`);
      continue;
    }
    if (doc.skill_name !== dir) fail(dir, `evals skill_name '${doc.skill_name}' does not match directory`);
    if (!Array.isArray(doc.evals) || doc.evals.length === 0) {
      fail(dir, 'evals array empty');
      continue;
    }
    if (idKeyCount(raw) !== doc.evals.length) fail(dir, 'evals.json: duplicate id key');
    const ids = new Set();
    for (const evaluation of doc.evals) {
      if (!evaluation.prompt?.trim()) fail(dir, `eval ${evaluation.id}: empty prompt`);
      if (!evaluation.expected_output?.trim()) fail(dir, `eval ${evaluation.id}: empty expected_output`);
      if (!Array.isArray(evaluation.expectations) || !evaluation.expectations.length) {
        fail(dir, `eval ${evaluation.id}: no expectations`);
      }
      if (ids.has(evaluation.id)) fail(dir, `duplicate eval id ${evaluation.id}`);
      ids.add(evaluation.id);
    }
  }

  const agentsRoot = join(root, 'agents');
  let agentCount = 0;
  if (existsSync(agentsRoot)) {
    for (const file of (await readdir(agentsRoot)).filter((name) => name.endsWith('.md'))) {
      agentCount++;
      const label = `agents/${file}`;
      const text = await readFile(join(agentsRoot, file), 'utf8');
      const fm = extractFrontmatter(text);
      if (!fm) {
        fail(label, 'no YAML frontmatter');
        continue;
      }
      const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim();
      if (name !== file.replace(/\.md$/, '')) fail(label, `name '${name}' does not match filename`);
      if (!/^description:/m.test(fm)) fail(label, 'missing description');
      if (!fencesBalanced(text)) fail(label, 'unbalanced code fences');
      const evalPath = join(agentsRoot, file.replace(/\.md$/, '.evals.json'));
      if (!existsSync(evalPath)) {
        fail(label, 'missing paired .evals.json');
      } else {
        try {
          const raw = await readFile(evalPath, 'utf8');
          const doc = JSON.parse(raw);
          if (!Array.isArray(doc.evals) || !doc.evals.length) fail(label, 'agent evals empty');
          else if (idKeyCount(raw) !== doc.evals.length) fail(label, 'evals JSON has duplicate id key');
        } catch (error) {
          fail(label, `evals JSON invalid — ${error.message}`);
        }
      }
    }
  }

  const readmePath = join(root, 'README.md');
  if (!existsSync(readmePath)) fail('README.md', 'missing');
  else {
    const readme = await readFile(readmePath, 'utf8');
    for (const dir of dirs) {
      const target = `skills/${dir}/SKILL.md`;
      const formattedName = new RegExp(`(?:\\*\\*|\\\`)${escapeRegex(dir)}(?:\\*\\*|\\\`)`);
      if (!readme.includes(target) && !formattedName.test(readme)) {
        fail('README.md', `missing registry entry for ${dir}`);
      }
    }
  }

  const packagePath = join(root, 'package.json');
  const changelogPath = join(root, 'CHANGELOG.md');
  if (!existsSync(packagePath)) fail('package.json', 'missing');
  if (!existsSync(changelogPath)) fail('CHANGELOG.md', 'missing');
  if (existsSync(packagePath) && existsSync(changelogPath)) {
    try {
      const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
      const changelog = await readFile(changelogPath, 'utf8');
      const latest = /^##\s+(\d+\.\d+\.\d+)\b/m.exec(changelog)?.[1];
      if (latest !== pkg.version) {
        fail('CHANGELOG.md', `latest version '${latest ?? 'missing'}' does not match package.json ${pkg.version}`);
      }
      const lockPath = join(root, 'package-lock.json');
      if (existsSync(lockPath)) {
        const lock = JSON.parse(await readFile(lockPath, 'utf8'));
        if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
          fail('package-lock.json', `version metadata does not match package.json ${pkg.version}`);
        }
      }
    } catch (error) {
      fail('release metadata', error.message);
    }
  }

  // A skill removed or renamed under skills/ must not still be named by a current file.
  for (const { scope, message } of await retiredSkillProblems(root, dirs)) fail(scope, message);

  const installRoot = join(root, 'install');
  if (existsSync(installRoot)) {
    for (const file of ['install/index.mjs', 'install/validate.mjs', 'install/run-evals.mjs', 'install/entry-point.mjs']) {
      const path = join(root, file);
      if (!existsSync(path)) {
        fail(file, 'missing');
        continue;
      }
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (result.status !== 0) fail(file, `node --check → ${result.stderr.trim().split('\n')[0]}`);
    }
  }

  const toolsRoot = join(root, 'tools');
  if (existsSync(toolsRoot)) {
    // Tools are executable repository code too; reuse the skill walker for
    // consistent JS/shell/Python syntax checks while excluding dependencies.
    await walk('tools', toolsRoot);
  }

  return { failures, skills: dirs, agentCount };
}

const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) {
  const result = await validateRepository();
  for (const failure of result.failures) console.error(`  ✖ ${failure}`);
  if (result.failures.length) {
    console.error(`\n${result.failures.length} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(`✔ ${result.skills.length} skills + ${result.agentCount} agents valid (frontmatter, fences, scripts, dependencies, evals, docs)`);
  }
}
