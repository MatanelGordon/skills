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
  const withEvals = skills.filter((skill) => existsSync(join(SKILLS_ROOT, skill, 'evals', 'evals.json')));
  return Promise.all(withEvals.map(async (skill) => ({
    skill,
    cases: JSON.parse(await readFile(join(SKILLS_ROOT, skill, 'evals', 'evals.json'), 'utf8')).evals,
    skillText: await readFile(join(SKILLS_ROOT, skill, 'SKILL.md'), 'utf8'),
  })));
}

const replyPatterns = (evalCase) => (evalCase.checks ?? [])
  .filter((check) => check.type === 'output_matches')
  .map((check) => check.pattern);
/** Every reply check of a case as { shown, passes(text) }, for both check types the scorer reads. */
const replyMatchers = (evalCase) => (evalCase.checks ?? []).flatMap((check) => {
  if (check.type === 'output_matches') return [{ shown: `/${check.pattern}/`, passes: (text) => compilePattern(check.pattern).test(text) }];
  if (check.type === 'output_contains') return [{ shown: JSON.stringify(check.text), passes: (text) => text.includes(check.text) }];
  return [];
});
const tracePatterns = (evalCase) => (evalCase.trajectory_checks ?? []).map((check) => check.pattern);
const label = (skill, evalCase) => `${skill} case ${evalCase.id}`;

// These tests cover planted-fact cases only: the ones that carry `trajectory_checks`.
// Other cases and other skills are free to use checks this scorer does not read.

test('some skill carries planted-fact cases', async () => {
  const planted = (await datasets()).flatMap(({ cases }) => cases.filter((evalCase) => evalCase.trajectory_checks));

  assert.ok(planted.length > 0, 'no case has trajectory_checks; the tests below would pass on nothing');
});

test('every pattern of a planted-fact case compiles for the scorer', async () => {
  for (const { skill, cases } of await datasets()) {
    for (const evalCase of cases.filter((candidate) => candidate.trajectory_checks)) {
      for (const pattern of [...replyPatterns(evalCase), ...tracePatterns(evalCase)]) {
        assert.doesNotThrow(() => compilePattern(pattern), `${label(skill, evalCase)}: ${pattern}`);
      }
    }
  }
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
      for (const matcher of replyMatchers(evalCase)) {
        assert.equal(
          matcher.passes(evalCase.prompt),
          false,
          `${label(skill, evalCase)}: a reply that repeats the prompt would pass ${matcher.shown}`,
        );
      }
    }
  }
});

test('the skill text does not give a planted fact away either', async () => {
  for (const { skill, cases, skillText } of await datasets()) {
    for (const evalCase of cases.filter((candidate) => candidate.trajectory_checks)) {
      for (const matcher of replyMatchers(evalCase)) {
        assert.equal(
          matcher.passes(skillText),
          false,
          `${label(skill, evalCase)}: the with-skill arm reads ${skill}/SKILL.md, which already passes ${matcher.shown}`,
        );
      }
    }
  }
});
