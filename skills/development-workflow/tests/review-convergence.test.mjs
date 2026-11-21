import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(skillRoot));

const readContract = async () => {
  const [skill, readme, evalDocument, lightScale, darkScale] = await Promise.all([
    readFile(join(skillRoot, 'SKILL.md'), 'utf8'),
    readFile(join(repositoryRoot, 'README.md'), 'utf8'),
    readFile(join(skillRoot, 'evals', 'evals.json'), 'utf8').then(JSON.parse),
    readFile(join(repositoryRoot, 'assets', 'readme', 'workflow-scale-light.svg'), 'utf8'),
    readFile(join(repositoryRoot, 'assets', 'readme', 'workflow-scale-dark.svg'), 'utf8'),
  ]);
  return { skill, readme, evalDocument, lightScale, darkScale };
};

test('review convergence requires fresh full-diff review at least twice', async () => {
  const { skill } = await readContract();

  assert.match(skill, /## 5\. Review convergence/);
  assert.match(skill, /at least two review passes/i);
  assert.match(skill, /complete cumulative diff/i);
  assert.match(skill, /acceptance criteria[\s\S]*prior findings and fixes/i);
  assert.match(skill, /fresh\s+eyes or a fresh context/i);
});

test('review-driven production changes invalidate approval and loop through tests', async () => {
  const { skill } = await readContract();

  assert.match(
    skill,
    /review-driven production change[\s\S]*invalidates[\s\S]*rerun[\s\S]*tests[\s\S]*another review\s+pass/i,
  );
  assert.match(skill, /latest pass has no unresolved CRITICAL or HIGH findings/i);
  assert.match(skill, /relevant and repository tests are green/i);
  assert.match(skill, /MEDIUM and LOW finding[\s\S]*explicit disposition/i);
});

test('the fourth unsuccessful pass fails closed instead of looping forever', async () => {
  const { skill } = await readContract();

  assert.match(skill, /fourth review pass[\s\S]*stop and escalate/i);
  assert.match(skill, /Do not claim completion/i);
  assert.match(skill, /do not start a fifth pass without a new\s+user decision/i);
});

test('README graph, stage guide, and registry summary mirror the convergence gate', async () => {
  const { readme, lightScale, darkScale } = await readContract();
  const graph = /```mermaid\n([\s\S]*?)\n```/.exec(readme)?.[1] ?? '';

  assert.match(graph, /Review.*--.*Production fix.*-->.*Fix/i);
  assert.match(graph, /Fix.*-->.*TestFix/i);
  assert.match(graph, /TestFix.*-->.*Review/i);
  assert.match(graph, /Gate.*--.*Yes.*-->.*Clear/i);
  assert.match(graph, /Clear.*-\.->.*Mutation/i);
  assert.doesNotMatch(graph, /Review\s+-\.->\s+Mutation/i);
  assert.match(readme, /two fresh full-diff passes/i);
  assert.match(readme, /fourth unsuccessful pass[\s\S]*stop and escalate/i);
  assert.match(
    readme,
    /\| \[development-workflow\]\(skills\/development-workflow\/SKILL\.md\) \|[^\n]*bounded review convergence/i,
  );
  for (const scale of [lightScale, darkScale]) {
    assert.match(scale, /bounded review convergence/i);
    assert.equal((scale.match(/>2\+ passes</g) ?? []).length, 2);
  }
});

test('evals cover a review fix and failure to converge by the cap', async () => {
  const { evalDocument } = await readContract();

  assert(
    evalDocument.evals.some((evaluation) => (
      /first review/i.test(evaluation.prompt)
      && /fix/i.test(evaluation.prompt)
      && /second/i.test(evaluation.expected_output)
    )),
    'missing first-review fix and mandatory second-pass eval',
  );
  assert(
    evalDocument.evals.some((evaluation) => (
      /first review pass is clean/i.test(evaluation.prompt)
      && /second fresh full-diff review/i.test(evaluation.expected_output)
    )),
    'missing clean-first-pass minimum-two-review eval',
  );
  assert(
    evalDocument.evals.some((evaluation) => (
      /fourth review pass/i.test(evaluation.prompt)
      && /stop and escalate/i.test(evaluation.expected_output)
    )),
    'missing bounded failure eval',
  );
});
