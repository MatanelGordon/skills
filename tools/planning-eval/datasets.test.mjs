import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compilePattern } from './score.mjs';

const SKILLS_ROOT = fileURLToPath(new URL('../../skills', import.meta.url));

async function datasets() {
  const skills = (await readdir(SKILLS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const loaded = [];
  for (const skill of skills) {
    const path = join(SKILLS_ROOT, skill, 'evals', 'evals.json');
    if (existsSync(path)) loaded.push({ skill, cases: JSON.parse(await readFile(path, 'utf8')).evals });
  }
  return loaded;
}

const replyPatterns = (evalCase) => (evalCase.checks ?? [])
  .filter((check) => check.type === 'output_matches')
  .map((check) => check.pattern);
const tracePatterns = (evalCase) => (evalCase.trajectory_checks ?? []).map((check) => check.pattern);
const label = (skill, evalCase) => `${skill} case ${evalCase.id}`;

test('every check pattern in the repository compiles for the scorer', async () => {
  for (const { skill, cases } of await datasets()) {
    for (const evalCase of cases) {
      for (const pattern of [...replyPatterns(evalCase), ...tracePatterns(evalCase)]) {
        assert.doesNotThrow(() => compilePattern(pattern), `${label(skill, evalCase)}: ${pattern}`);
      }
    }
  }
});

test('some skill carries planted-fact cases', async () => {
  const planted = (await datasets()).flatMap(({ cases }) => cases.filter((evalCase) => evalCase.trajectory_checks));

  assert.ok(planted.length > 0, 'no case has trajectory_checks; the tests below would pass on nothing');
});

test('a planted-fact case names the fact with a reply check', async () => {
  for (const { skill, cases } of await datasets()) {
    for (const evalCase of cases.filter((candidate) => candidate.trajectory_checks)) {
      assert.ok(replyPatterns(evalCase).length > 0, `${label(skill, evalCase)} has trajectory_checks and no reply check`);
      for (const check of evalCase.trajectory_checks) {
        assert.equal(typeof check.name, 'string', `${label(skill, evalCase)}: a trajectory check needs a name`);
      }
    }
  }
});

test('the prompt of a planted-fact case does not give the fact away', async () => {
  for (const { skill, cases } of await datasets()) {
    for (const evalCase of cases.filter((candidate) => candidate.trajectory_checks)) {
      for (const pattern of replyPatterns(evalCase)) {
        assert.equal(
          compilePattern(pattern).test(evalCase.prompt),
          false,
          `${label(skill, evalCase)}: a reply that repeats the prompt would pass /${pattern}/`,
        );
      }
    }
  }
});
