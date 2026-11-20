import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateRepository } from './validate.mjs';

const makeTemp = () => mkdtemp(join(tmpdir(), 'skills-validator-test-'));

async function writeValidRepo({ malformed = false, changelogVersion = '1.0.0', readmeSkill = true } = {}) {
  const root = await makeTemp();
  await mkdir(join(root, 'skills', 'valid-skill', 'evals'), { recursive: true });
  await mkdir(join(root, 'skills', 'rank-workspace', 'skill-snapshot'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  await writeFile(join(root, 'README.md'), readmeSkill
    ? '# fixture\n[valid-skill](skills/valid-skill/SKILL.md)\n'
    : '# fixture\n');
  await writeFile(join(root, 'CHANGELOG.md'), `# Changelog\n\n## ${changelogVersion} — 2026-11-19\n`);
  await writeFile(join(root, 'skills', 'valid-skill', 'SKILL.md'), [
    '---',
    'name: valid-skill',
    'description: A valid fixture skill.',
    '---',
    '# Valid',
    '',
  ].join('\n'));
  await writeFile(join(root, 'skills', 'valid-skill', 'evals', 'evals.json'), JSON.stringify({
    skill_name: 'valid-skill',
    evals: [{ id: 1, prompt: 'Do it', expected_output: 'Done', files: [], expectations: ['It is done'] }],
  }));
  await writeFile(join(root, 'skills', 'rank-workspace', 'skill-snapshot', 'SKILL.md'), 'ignored');
  if (malformed) await mkdir(join(root, 'skills', 'broken-skill'));
  return root;
}

test('validator ignores sanctioned *-workspace directories without inspecting their contents', async () => {
  const root = await writeValidRepo();
  const result = await validateRepository(root);
  assert.equal(result.failures.length, 0, result.failures.join('\n'));
  assert.deepEqual(result.skills, ['valid-skill']);
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
