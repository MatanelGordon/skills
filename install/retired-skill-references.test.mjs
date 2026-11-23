import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { findRetiredSkillReferences, retiredSkillNames, scanText } from './retired-skill-references.mjs';
import { validateRepository } from './validate.mjs';

const makeTemp = () => mkdtemp(join(tmpdir(), 'skills-retired-refs-test-'));

const git = (root, ...args) => {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com',
    '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
};

const put = async (root, path, text) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
};

const skillText = (name) => `---\nname: ${name}\ndescription: >\n  A fixture skill.\n---\n# ${name}\n`;

/** A git repository whose history once held skills/<name> for every name in `retired`. */
async function repoWithHistory({ current = ['keep-me'], retired = ['old-thing'] } = {}) {
  const root = await makeTemp();
  git(root, 'init', '-q');
  for (const name of [...current, ...retired]) await put(root, `skills/${name}/SKILL.md`, skillText(name));
  await put(root, 'README.md', '# fixture\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'start');
  for (const name of retired) git(root, 'rm', '-q', '-r', `skills/${name}`);
  if (retired.length) git(root, 'commit', '-q', '-m', 'retire');
  return root;
}

const hitsOf = (refs) => refs.map(({ file, line, name }) => `${file}:${line}:${name}`).sort();

test('scanText finds a single-word retired name only where it is formatted as a name', () => {
  const text = [
    'Use `oldword` for that.',
    'Rank them, then oldword each claim.',
    'See skills/oldword/SKILL.md.',
    '| **oldword** | gone |',
    '[oldword](https://example.com)',
    'The `oldwords` and `new-oldword` skills are different.',
    'A path like skills/oldword-two/ is another skill.',
  ].join('\n');
  assert.deepEqual(scanText(text, ['oldword']).map((hit) => hit.line), [1, 3, 4, 5]);
});

test('scanText finds a hyphenated retired name in plain prose, but not inside a longer name', () => {
  const text = 'Builds on old-thing.\r\nold-thing-two is fine\r\nso is new-old-thing\r\nand ~/.claude/skills/old-thing too\r\n';
  assert.deepEqual(scanText(text, ['old-thing']), [
    { line: 1, name: 'old-thing' },
    { line: 4, name: 'old-thing' },
  ]);
  assert.deepEqual(scanText(text, []), []);
});

test('a removed skill named in a current file is reported with file and line', async () => {
  const root = await repoWithHistory();
  await put(root, 'README.md', '# fixture\n\n| [old-thing](skills/old-thing/SKILL.md) | gone |\n');
  await put(root, 'skills/keep-me/SKILL.md', `${skillText('keep-me')}\nBuilds on \`old-thing\`.\n`);
  await put(root, 'assets/hero.svg', '<svg><text x="1">old-thing</text></svg>\n');
  await put(root, 'notes/new-untracked.md', 'old-thing is still here\n');

  const refs = await findRetiredSkillReferences(root, ['keep-me']);
  assert.deepEqual(hitsOf(refs), [
    'README.md:3:old-thing',
    'assets/hero.svg:1:old-thing',
    'notes/new-untracked.md:1:old-thing',
    'skills/keep-me/SKILL.md:8:old-thing',
  ]);
});

test('history files, ignored files and binary files are exempt', async () => {
  const root = await repoWithHistory();
  await put(root, 'CHANGELOG.md', '## 1.0.0\n- Removed `old-thing`.\n');
  await put(root, 'skills/keep-me/CHANGELOG.md', '- Merged old-thing into keep-me.\n');
  await put(root, '.plan/merge/plan.md', 'Delete skills/old-thing/.\n');
  await put(root, '.adr/0001-merge.md', 'We retired `old-thing`.\n');
  await put(root, '.gitignore', 'scratch/\n');
  await put(root, 'scratch/notes.md', 'old-thing\n');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'icon.bin'), Buffer.from([0x00, ...Buffer.from(' old-thing ')]));

  assert.deepEqual(await findRetiredSkillReferences(root, ['keep-me']), []);
});

test('a removal not yet committed already retires the name', async () => {
  const root = await repoWithHistory({ current: ['keep-me', 'about-to-go'], retired: [] });
  await rm(join(root, 'skills', 'about-to-go'), { recursive: true });
  await put(root, 'README.md', '# fixture\n- `about-to-go`\n');

  assert.deepEqual(retiredSkillNames(root, ['keep-me']), ['about-to-go']);
  assert.deepEqual(hitsOf(await findRetiredSkillReferences(root, ['keep-me'])), ['README.md:2:about-to-go']);
});

test('a rename retires the old name, including inside the moved skill, and leaves the new one alone', async () => {
  const root = await repoWithHistory({ current: ['old-name'], retired: [] });
  git(root, 'mv', 'skills/old-name', 'skills/new-name');
  git(root, 'commit', '-q', '-m', 'rename');
  await put(root, 'README.md', '# fixture\n- `new-name`\n- `old-name`\n');

  assert.deepEqual(retiredSkillNames(root, ['new-name']), ['old-name']);
  // The moved SKILL.md still says `name: old-name` and `# old-name`: a rename half done.
  assert.deepEqual(hitsOf(await findRetiredSkillReferences(root, ['new-name'])), [
    'README.md:3:old-name',
    'skills/new-name/SKILL.md:2:old-name',
    'skills/new-name/SKILL.md:6:old-name',
  ]);
  await put(root, 'skills/new-name/SKILL.md', skillText('new-name'));
  assert.deepEqual(hitsOf(await findRetiredSkillReferences(root, ['new-name'])), ['README.md:3:old-name']);
});

test('outside a git repository there is no history, so nothing is reported', async () => {
  const root = await makeTemp();
  await put(root, 'README.md', '`old-thing`\n');
  assert.deepEqual(retiredSkillNames(root, []), []);
  assert.deepEqual(await findRetiredSkillReferences(root, []), []);
});

test('npm run validate fails on a current file that names a removed skill', async () => {
  const root = await repoWithHistory();
  await put(root, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  await put(root, 'CHANGELOG.md', '# Changelog\n\n## 1.0.0 — 2026-11-24\n\n- Removed `old-thing`.\n');
  await put(root, 'README.md', '# fixture\n[keep-me](skills/keep-me/SKILL.md)\nSee also `old-thing`.\n');
  await put(root, 'skills/keep-me/evals/evals.json', JSON.stringify({
    skill_name: 'keep-me',
    evals: [{ id: 1, prompt: 'Do it', expected_output: 'Done', files: [], assertions: ['It is done'], expectations: ['It is done'] }],
  }));

  const { failures } = await validateRepository(root);
  const retired = failures.filter((line) => line.includes("'old-thing'"));
  assert.deepEqual(retired, ["README.md: line 3 names 'old-thing', which is no longer a skill under skills/"]);
});

test('CI validates with full history, which the retired-skill check needs', async () => {
  // Windows CI checks the repository out with CRLF line endings.
  const workflow = (await readFile(resolve('.github/workflows/validate.yml'), 'utf8')).replace(/\r\n/g, '\n');
  const validateJob = /\n {2}validate:\n([\s\S]*?)(?=\n {2}[\w-]+:\n)/.exec(workflow)?.[1] ?? '';
  assert.match(validateJob, /uses: actions\/checkout@v\d+\n\s+with:\n\s+fetch-depth: 0(?!\d)/);
});
