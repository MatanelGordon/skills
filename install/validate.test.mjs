import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
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
    evals: [{ id: 1, prompt: 'Do it', expected_output: 'Done', files: [], expectations: ['It is done'] }],
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
    evals: [{ id: 1, prompt: 'Do it', expected_output: 'Done', expectations: ['It is done'] }],
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

const descriptionOf = (length) => 'Use when '.padEnd(length, 'x');

async function writeSkill(root, name, descriptionLines) {
  await mkdir(join(root, 'skills', name, 'evals'), { recursive: true });
  await writeFile(join(root, 'skills', name, 'SKILL.md'), [
    '---',
    `name: ${name}`,
    'description: >',
    ...descriptionLines.map((line) => `  ${line}`),
    'license: MIT',
    '---',
    `# ${name}`,
    '',
  ].join('\n'));
  await writeFile(join(root, 'skills', name, 'evals', 'evals.json'), JSON.stringify({
    skill_name: name,
    evals: [{ id: 1, prompt: 'Do it', expected_output: 'Done', files: [], expectations: ['It is done'] }],
  }));
  await writeFile(join(root, 'README.md'), `[${name}](skills/${name}/SKILL.md)\n`, { flag: 'a' });
}

test('validator allows a description of 300 characters and rejects 301', async () => {
  const atLimit = await writeValidRepo();
  await writeSkill(atLimit, 'valid-skill', [descriptionOf(300)]);
  const accepted = await validateRepository(atLimit);
  assert.equal(accepted.failures.length, 0, accepted.failures.join('\n'));

  const overLimit = await writeValidRepo();
  await writeSkill(overLimit, 'valid-skill', [descriptionOf(301)]);
  const rejected = await validateRepository(overLimit);
  assert.equal(rejected.failures.length, 1, rejected.failures.join('\n'));
  assert.match(rejected.failures[0], /^valid-skill: description 301 chars \(max 300\)/);
});

test('validator measures a folded description after joining its lines', async () => {
  // Two folded lines become one line with a single space between them.
  const atLimit = await writeValidRepo();
  await writeSkill(atLimit, 'valid-skill', [descriptionOf(150), 'y'.repeat(149)]);
  const accepted = await validateRepository(atLimit);
  assert.equal(accepted.failures.length, 0, accepted.failures.join('\n'));

  const overLimit = await writeValidRepo();
  await writeSkill(overLimit, 'valid-skill', [descriptionOf(150), 'y'.repeat(150)]);
  const rejected = await validateRepository(overLimit);
  assert(rejected.failures.some((line) => line.startsWith('valid-skill: description 301 chars (max 300)')), rejected.failures.join('\n'));
});

test('validator keeps all descriptions together under 7,500 characters', async () => {
  const writeSkills = async (lastLength) => {
    const root = await writeValidRepo();
    await writeSkill(root, 'valid-skill', [descriptionOf(lastLength)]);
    for (let index = 1; index <= 24; index++) {
      await writeSkill(root, `skill-${String(index).padStart(2, '0')}`, [descriptionOf(300)]);
    }
    return root;
  };

  const underBudget = await validateRepository(await writeSkills(299));
  assert.equal(underBudget.failures.length, 0, underBudget.failures.join('\n'));

  const atBudget = await validateRepository(await writeSkills(300));
  assert.equal(atBudget.failures.length, 1, atBudget.failures.join('\n'));
  assert.match(atBudget.failures[0], /^skills: descriptions total 7500 chars \(must stay under 7500\)/);
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
