import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateRepository } from './validate.mjs';

const makeTemp = () => mkdtemp(join(tmpdir(), 'skills-validator-test-'));

async function writeValidRepo({ malformed = false, changelogVersion = '1.0.0', readmeSkill = true } = {}) {
  const root = await makeTemp();
  await mkdir(join(root, 'skills', 'valid-skill', 'evals'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  await writeFile(join(root, 'README.md'), readmeSkill
    ? '# fixture\n[valid-skill](skills/valid-skill/SKILL.md)\n'
    : '# fixture\n');
  await writeFile(join(root, 'CHANGELOG.md'), `# Changelog\n\n## ${changelogVersion} — 2026-11-19\n`);
  await writeFile(join(root, 'skills', 'valid-skill', 'SKILL.md'), [
    '---',
    'name: valid-skill',
    'description: >',
    '  A valid fixture skill with a folded description.',
    'license: MIT',
    'metadata:',
    '  requires: Node >= 18',
    '---',
    '# Valid',
    '',
  ].join('\n'));
  await writeFile(join(root, 'skills', 'valid-skill', 'evals', 'evals.json'), JSON.stringify({
    skill_name: 'valid-skill',
    evals: [{ id: 1, prompt: 'Do it', expected_output: 'Done', files: [], assertions: ['It is done'], expectations: ['It is done'] }],
  }));
  if (malformed) await mkdir(join(root, 'skills', 'broken-skill'));
  return root;
}

test('validator accepts a valid skill repository', async () => {
  const root = await writeValidRepo();
  const result = await validateRepository(root);
  assert.equal(result.failures.length, 0, result.failures.join('\n'));
  assert.deepEqual(result.skills, ['valid-skill']);
});

test('validator accepts CRLF frontmatter for skills and agents', async () => {
  const root = await writeValidRepo();
  await writeFile(join(root, 'skills', 'valid-skill', 'SKILL.md'), [
    '---',
    'name: valid-skill',
    'description: >',
    '  A valid fixture skill with a folded description.',
    'license: MIT',
    'metadata:',
    '  requires: Node >= 18',
    '---',
    '# Valid',
    '',
  ].join('\r\n'));
  await mkdir(join(root, 'agents'), { recursive: true });
  await writeFile(join(root, 'agents', 'valid-agent.md'), [
    '---',
    'name: valid-agent',
    'description: A valid agent fixture.',
    '---',
    '# Valid Agent',
    '',
  ].join('\r\n'));
  await writeFile(join(root, 'agents', 'valid-agent.evals.json'), JSON.stringify({
    evals: [{ id: 1, prompt: 'Do it', expected_output: 'Done', files: [], assertions: ['It is done'], expectations: ['It is done'] }],
  }));
  const result = await validateRepository(root);
  assert.equal(result.failures.length, 0, result.failures.join('\n'));
  assert.equal(result.agentCount, 1);
});

test('validator requires a newline after the closing frontmatter delimiter', async () => {
  const root = await writeValidRepo();
  await writeFile(
    join(root, 'skills', 'valid-skill', 'SKILL.md'),
    '---\nname: valid-skill\ndescription: A valid fixture skill.\n---',
  );
  const result = await validateRepository(root);
  assert(result.failures.some((line) => line.includes('no YAML frontmatter')));
});

test('validator still catches a malformed ordinary skill directory', async () => {
  const root = await writeValidRepo({ malformed: true });
  const result = await validateRepository(root);
  assert(result.failures.some((line) => line.includes('broken-skill: SKILL.md missing')));
});

test('validator checks README coverage and changelog/package version agreement', async () => {
  const missingReadme = await writeValidRepo({ readmeSkill: false });
  const readmeResult = await validateRepository(missingReadme);
  assert(readmeResult.failures.some((line) => line.includes('README.md') && line.includes('valid-skill')));

  const staleChangelog = await writeValidRepo({ changelogVersion: '0.9.0' });
  const changelogResult = await validateRepository(staleChangelog);
  assert(changelogResult.failures.some((line) => line.includes('CHANGELOG.md') && line.includes('1.0.0')));
});

// Description tests look only at description failures, so checks added
// elsewhere in the validator cannot turn them red.
const descriptionOf = (length) => 'Use when '.padEnd(length, 'x');
const folded = (...lines) => ['description: >', ...lines.map((line) => `  ${line}`)];
const descriptionFailures = async (root) => (await validateRepository(root)).failures
  .filter((line) => /description/.test(line));

// A further skill is a copy of the fixture's valid-skill with a new name and
// description, so it follows whatever the fixture has to contain.
async function writeSkill(root, name, descriptionYaml) {
  const fixture = join(root, 'skills', 'valid-skill');
  const target = join(root, 'skills', name);
  if (name !== 'valid-skill') {
    await cp(fixture, target, { recursive: true });
    const evalsPath = join(target, 'evals', 'evals.json');
    const evals = JSON.parse(await readFile(evalsPath, 'utf8'));
    await writeFile(evalsPath, JSON.stringify({ ...evals, skill_name: name }));
    await writeFile(join(root, 'README.md'), `[${name}](skills/${name}/SKILL.md)\n`, { flag: 'a' });
  }
  const skillPath = join(target, 'SKILL.md');
  const [, frontmatter, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(await readFile(skillPath, 'utf8'));
  const kept = frontmatter.replace(/^description:.*\n(?:[ \t]+.*\n)*/m, '').replace(/^name:.*$/m, `name: ${name}`);
  await writeFile(skillPath, `---\n${[...descriptionYaml, kept].join('\n')}\n---\n${body}`);
}

test('validator allows a description of 300 characters and rejects 301', async () => {
  const atLimit = await writeValidRepo();
  await writeSkill(atLimit, 'valid-skill', folded(descriptionOf(300)));
  assert.deepEqual(await descriptionFailures(atLimit), []);

  const overLimit = await writeValidRepo();
  await writeSkill(overLimit, 'valid-skill', folded(descriptionOf(301)));
  const rejected = await descriptionFailures(overLimit);
  assert.equal(rejected.length, 1, rejected.join('\n'));
  assert.match(rejected[0], /^valid-skill: description 301 chars \(max 300\)/);
});

test('validator measures a folded description after joining its lines', async () => {
  // Two folded lines become one line with a single space between them.
  const atLimit = await writeValidRepo();
  await writeSkill(atLimit, 'valid-skill', folded(descriptionOf(150), 'y'.repeat(149)));
  assert.deepEqual(await descriptionFailures(atLimit), []);

  const overLimit = await writeValidRepo();
  await writeSkill(overLimit, 'valid-skill', folded(descriptionOf(150), 'y'.repeat(150)));
  assert.match((await descriptionFailures(overLimit)).join('\n'), /^valid-skill: description 301 chars \(max 300\)/m);
});

test('validator measures every YAML form a description can take', async () => {
  const forms = {
    'one-line value': [`description: ${descriptionOf(301)}`],
    'quoted value': [`description: "${descriptionOf(301)}"`],
    'literal block': ['description: |', `  ${descriptionOf(301)}`],
    'block with chomping indicator': ['description: >-', `  ${descriptionOf(301)}`],
    'block with keep indicator': ['description: >+', `  ${descriptionOf(301)}`],
    'block with a comment': ['description: > # trigger first', `  ${descriptionOf(301)}`],
    'plain multi-line value': ['description:', `  ${descriptionOf(150)}`, `  ${'y'.repeat(150)}`],
    'value continued on the next line': [`description: ${descriptionOf(150)}`, `  ${'y'.repeat(150)}`],
  };
  for (const [form, yaml] of Object.entries(forms)) {
    const root = await writeValidRepo();
    await writeSkill(root, 'valid-skill', yaml);
    const failures = await descriptionFailures(root);
    assert.equal(failures.length, 1, `${form}:\n${failures.join('\n')}`);
    assert.match(failures[0], /^valid-skill: description 301 chars \(max 300\)/, form);
  }
});

test('validator reports an empty description as missing, not as the next key', async () => {
  const root = await writeValidRepo();
  await writeSkill(root, 'valid-skill', ['description:']);
  assert.deepEqual(await descriptionFailures(root), ['valid-skill: missing description']);
});

test('validator keeps all descriptions together under 7,500 characters', async () => {
  const writeSkills = async (lastLength) => {
    const root = await writeValidRepo();
    await writeSkill(root, 'valid-skill', folded(descriptionOf(lastLength)));
    for (let index = 1; index <= 24; index++) {
      await writeSkill(root, `skill-${String(index).padStart(2, '0')}`, folded(descriptionOf(300)));
    }
    return root;
  };

  assert.deepEqual(await descriptionFailures(await writeSkills(299)), []);

  const atBudget = await descriptionFailures(await writeSkills(300));
  assert.equal(atBudget.length, 1, atBudget.join('\n'));
  assert.match(atBudget[0], /^skills: descriptions total 7500 chars \(must stay under 7500\)/);

  // A description over its own limit still counts toward the total.
  const overLimit = await descriptionFailures(await writeSkills(301));
  assert.equal(overLimit.length, 2, overLimit.join('\n'));
  assert.match(overLimit.join('\n'), /^skills: descriptions total 7501 chars/m);
});

test('validator detects duplicate id keys hidden by JSON.parse', async () => {
  const root = await writeValidRepo();
  await writeFile(join(root, 'skills', 'valid-skill', 'evals', 'evals.json'), `{
    "skill_name": "valid-skill",
    "evals": [{ "id": 1, "id": 2, "prompt": "Do it", "expected_output": "Done", "expectations": ["Done"] }]
  }`);
  const result = await validateRepository(root);
  assert(result.failures.some((line) => line.includes('duplicate id key')));
});

test('validator fails an eval file the external runners cannot grade or stage', async () => {
  const root = await writeValidRepo();
  await writeFile(join(root, 'skills', 'valid-skill', 'evals', 'evals.json'), JSON.stringify({
    skill_name: 'valid-skill',
    evals: [
      { id: 1, prompt: 'Do it', expected_output: 'Done', files: [], expectations: ['It is done'] },
      { id: 2, prompt: 'Do it', expected_output: 'Done', files: ['evals/files/2/gone.txt'], assertions: ['Done'], expectations: ['Done'] },
    ],
  }));
  const result = await validateRepository(root);
  assert(result.failures.some((line) => line === 'valid-skill: eval 1: assertions must be a non-empty list of sentences'), result.failures.join('\n'));
  assert(result.failures.some((line) => line.includes('valid-skill: eval 2: files[0] "evals/files/2/gone.txt" does not exist')), result.failures.join('\n'));
});

test('validator accepts SkillEvaluator files beside evals.json and a per-case trajectory_checks list', async () => {
  const root = await writeValidRepo();
  const evals = join(root, 'skills', 'valid-skill', 'evals');
  await mkdir(join(evals, 'environment', 'fixture', 'project'), { recursive: true });
  await mkdir(join(evals, 'files', 'shared'), { recursive: true });
  await writeFile(join(evals, 'evals.json'), JSON.stringify({
    skill_name: 'valid-skill',
    evals: [{
      id: 1, prompt: 'Do it', expected_output: 'Done', files: ['evals/files/shared/notes.md'],
      assertions: ['It is done', 'It says so'], expectations: ['It is done', 'It says so'],
      trajectory_checks: [{ name: 'read the notes', pattern: 'notes\\.md' }],
    }],
  }));
  await writeFile(join(evals, 'files', 'shared', 'notes.md'), '# Notes\n');
  await writeFile(join(evals, 'config.yml'), 'harbor:\n  agent_workdir: /srv/project\n');
  await writeFile(join(evals, 'grader.py'), 'print("graded")\n');
  await writeFile(join(evals, 'environment', 'Dockerfile'), 'FROM node:22\n');
  await writeFile(join(evals, 'environment', 'fixture', 'project', 'index.js'), 'const answer = 42;\n');
  const result = await validateRepository(root);
  assert.equal(result.failures.length, 0, result.failures.join('\n'));
});

test('validator reports eval-set shortfalls as warnings without failing', async () => {
  const root = await writeValidRepo();
  const result = await validateRepository(root);
  assert.equal(result.failures.length, 0, result.failures.join('\n'));
  assert(result.warnings.some((line) => line.startsWith('valid-skill: 1 case;')), result.warnings.join('\n'));
  assert(result.warnings.some((line) => line.startsWith('valid-skill: no negative case')), result.warnings.join('\n'));
});

test('validator syntax-checks repository tools without entering node_modules', async () => {
  const root = await writeValidRepo();
  await mkdir(join(root, 'tools', 'browser-capture', 'node_modules', 'ignored-package'), { recursive: true });
  await writeFile(join(root, 'tools', 'browser-capture', 'broken.mjs'), 'export const broken = ;\n');
  await writeFile(join(root, 'tools', 'browser-capture', 'node_modules', 'ignored-package', 'broken.mjs'), 'export const ignored = ;\n');

  const result = await validateRepository(root);
  const toolFailures = result.failures.filter((line) => line.startsWith('tools/'));
  assert.equal(toolFailures.length, 1, toolFailures.join('\n'));
  const marker = ': node --check → ';
  const markerIndex = toolFailures[0].indexOf(marker);
  assert.notEqual(markerIndex, -1, toolFailures[0]);
  const label = toolFailures[0].slice(0, markerIndex);
  const nativeStderr = toolFailures[0].slice(markerIndex + marker.length);
  assert.equal(label, 'tools/browser-capture/broken.mjs');
  assert.doesNotMatch(label, /\\/);
  assert.ok(nativeStderr.length > 0, 'node --check stderr must remain in the diagnostic');
});

test('validator CLI runs when its directory is reached through a symlink', async () => {
  const linkedInstall = join(await makeTemp(), 'install');
  await symlink(dirname(fileURLToPath(import.meta.url)), linkedInstall, process.platform === 'win32' ? 'junction' : 'dir');

  const result = spawnSync(process.execPath, [join(linkedInstall, 'validate.mjs')], { encoding: 'utf8' });
  // Either verdict proves the CLI ran; printing nothing is the regression.
  assert.match(result.stdout + result.stderr, /agents valid|problem\(s\)/);
});
