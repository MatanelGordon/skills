import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(skillRoot));
const MAX_DESCRIPTION_LENGTH = 300;
const MODE_HEADING = '## Pull-request review mode';
const MODE_CASE_IDS = [11, 12, 13, 14];
const MIN_ASSERTIONS = 2;
const MAX_ASSERTIONS = 5;

// Prose is hard-wrapped, Windows checkouts use CRLF, and bold markers carry no
// meaning, so every phrase check runs against text with whitespace runs
// collapsed to one space and `**` removed.
const flatten = (text) => text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

// assert.match prints the whole subject on failure, which for the README is the
// whole file. This names the missing phrase and where it was expected instead.
const assertPhrase = (text, pattern, where) => {
  assert(pattern.test(text), `${where} is missing ${pattern}`);
};

const frontmatterOf = (markdown) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? '';

const descriptionOf = (markdown) => {
  const frontmatter = frontmatterOf(markdown);
  const folded = /description:\s*>-?\s*\r?\n((?:\s{2,}.*\r?\n?)+)/.exec(frontmatter)?.[1];
  return flatten(folded ?? /^description:\s*(.+)$/m.exec(frontmatter)?.[1] ?? '');
};

const sectionOf = (markdown, heading) => {
  const start = markdown.indexOf(heading);
  if (start === -1) return '';
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? undefined : next);
};

const readContract = async () => {
  const [skill, readme, evalDocument] = await Promise.all([
    readFile(join(skillRoot, 'SKILL.md'), 'utf8'),
    readFile(join(repositoryRoot, 'README.md'), 'utf8'),
    readFile(join(skillRoot, 'evals', 'evals.json'), 'utf8').then(JSON.parse),
  ]);
  return {
    skill,
    evalDocument,
    mode: flatten(sectionOf(skill, MODE_HEADING)),
    readmeWorkflow: flatten(sectionOf(readme, '## The workflow')),
  };
};

test('description leads with its trigger and stays within the length limit', async () => {
  const { skill } = await readContract();
  const description = descriptionOf(skill);

  assert.match(description, /^Use when /);
  assert.match(description, /pull request/i);
  assert(
    description.length <= MAX_DESCRIPTION_LENGTH,
    `description is ${description.length} characters; the limit is ${MAX_DESCRIPTION_LENGTH}`,
  );
});

test('the mode sits between hardening and review, and planning points to it', async () => {
  const { skill, mode } = await readContract();
  const overview = flatten(skill.slice(0, skill.indexOf('## Mandatory core')));
  const hardening = skill.indexOf('## 4. Test hardening');
  const modeStart = skill.indexOf(MODE_HEADING);
  const review = skill.indexOf('## 5. Review convergence');

  assert.notEqual(mode, '', 'missing the pull-request review mode section');
  assert(hardening < modeStart && modeStart < review, 'the mode belongs between stage 4 and stage 5');
  assertPhrase(
    flatten(sectionOf(skill, '## 1. Plan')),
    /if the change will enter review convergence, settle pull-request review mode \(below\) with the plan: ask once/i,
    'stage 1',
  );
  assertPhrase(
    overview,
    /a draft pull request goes up after test hardening and before review, and nothing merges without the user's explicit permission/i,
    'the pipeline overview',
  );
});

test('the mode is opt-in and only a direct answer turns it on', async () => {
  const { mode } = await readContract();
  const where = 'the mode section';

  assertPhrase(mode, /pull-request review mode — opt-in/i, where);
  assertPhrase(
    mode,
    /the mode applies to any change that enters review convergence in a repository with a github remote/i,
    where,
  );
  assertPhrase(
    mode,
    /ask once, with the plan: "review this through a pull request\?" ask before implementation starts, or before the first review pass if that moment has passed/i,
    where,
  );
  assertPhrase(
    mode,
    /an answer the user already gave, in the conversation, the task brief, or standing instructions to the agent, counts: do not ask again/i,
    where,
  );
  assertPhrase(
    mode,
    /approving the plan is not a yes, a contribution policy is not an answer, and the answer covers this change only/i,
    where,
  );
});

test('with no answer the mode is off and nothing is pushed', async () => {
  const { mode } = await readContract();
  const where = 'the mode section';

  assertPhrase(
    mode,
    /no answer means no\. that covers a reply that does not answer the question and a run where nobody can answer \(unattended or non-interactive\): do not wait/i,
    where,
  );
  assertPhrase(
    mode,
    /with the mode off, say that it is off, review locally as stage 5 describes, and push nothing the user has not asked for, at any stage/i,
    where,
  );
  assertPhrase(mode, /visible to others and cannot be unsent/i, where);
});

test('the pull request opens as a draft after stage 4 and before the first review pass', async () => {
  const { mode } = await readContract();
  const where = 'the mode section';

  assertPhrase(mode, /when the mode is on: 1\. branch first\. a yes puts commits in scope/i, where);
  assertPhrase(
    mode,
    /work on a branch, never on the base branch; work already on the base branch moves to a new branch, and only that branch is pushed/i,
    where,
  );
  assertPhrase(
    mode,
    /open after test hardening and before the first review pass \(after implementation when hardening is skipped\)/i,
    where,
  );
  assertPhrase(
    mode,
    /check the diff for secrets, push the branch, and open a draft pull request against the base branch \(`gh pr create --draft --base <base-branch>`\)/i,
    where,
  );
  assertPhrase(mode, /give the user the url/i, where);
  assertPhrase(mode, /fails, report the error and wait; do not review as if it existed/i, where);
});

test('review fixes are new commits and stage 5 still governs the review', async () => {
  const { skill, mode } = await readContract();
  const where = 'the mode section';

  assertPhrase(mode, /stage 5 applies unchanged: its complete cumulative diff is the pull request diff/i, where);
  assertPhrase(mode, /each review fix is a new pushed commit, with no amend, rebase, or force-push/i, where);
  assertPhrase(flatten(sectionOf(skill, '## 5. Review convergence')), /at least two review passes/i, 'stage 5');
});

test('the pull request is marked ready only after verification, and left unmerged', async () => {
  const { mode } = await readContract();
  const where = 'the mode section';

  assertPhrase(mode, /stage 7's rules apply to every commit pushed here/i, where);
  assertPhrase(mode, /only after stage 6 passes, .{0,80}mark it ready \(`gh pr ready`\), and stop there/i, where);
  assertPhrase(mode, /report that it is unmerged and that merging waits for the user's permission/i, where);
  assertPhrase(mode, /a four-pass escalation leaves it a draft/i, where);
});

test('nothing merges or reaches the base branch without the user saying so', async () => {
  const { skill, mode } = await readContract();
  const where = 'the mode section';

  assertPhrase(
    mode,
    /never merge the pull request or enable auto-merge without the user's explicit permission for that pull request, and never push to the base branch unless the user's instructions say to/i,
    where,
  );
  assertPhrase(mode, /agreeing to the mode, green checks, and a clean review are not permission/i, where);
  assertPhrase(
    flatten(sectionOf(skill, '## Anti-patterns')),
    /\| merge a pull request, or push to the base branch, when the user has not said to \|/i,
    'the anti-pattern table',
  );
});

test('README mirrors the mode, its timing, its merge rule and its default', async () => {
  const { readmeWorkflow } = await readContract();
  const where = 'the README workflow section';

  assertPhrase(readmeWorkflow, /pull-request review mode/i, where);
  assertPhrase(readmeWorkflow, /it asks once, with the plan/i, where);
  assertPhrase(readmeWorkflow, /draft pull request after test hardening and before the first review pass/i, where);
  assertPhrase(readmeWorkflow, /pushes every review fix as a new commit/i, where);
  assertPhrase(readmeWorkflow, /marks the pull request ready after verification/i, where);
  assertPhrase(readmeWorkflow, /never merges without your explicit permission/i, where);
  assertPhrase(readmeWorkflow, /if nobody answers, the mode stays off, nothing is pushed/i, where);
});

test('evals assert asking, timing, new commits, the unanswered default, and not merging', async () => {
  const { evalDocument } = await readContract();
  const graded = evalDocument.evals
    .filter((evaluation) => MODE_CASE_IDS.includes(evaluation.id))
    .flatMap((evaluation) => evaluation.assertions ?? []);
  const required = {
    'asking about the mode': /asks the user whether the change should be reviewed through a pull request/i,
    'asking with the plan': /asks that question alongside the plan, before any implementation step/i,
    'opening between hardening and review': /opening of the pull request between test hardening and the first review pass/i,
    'opening as a draft': /pull request is opened as a draft/i,
    'fixes as new commits': /rules out force-pushing review fixes/i,
    'staying unmerged': /stays unmerged until the user gives explicit permission/i,
    'the unanswered default': /no pull request will be opened/i,
    'pushing nothing unanswered': /nothing will be pushed to github/i,
    'reporting the mode was off': /final report will state that review through a pull request was off/i,
    'not merging': /no step that merges the pull request/i,
    'waiting for permission to merge': /merging waits for the user's explicit permission/i,
  };

  for (const [behaviour, pattern] of Object.entries(required)) {
    assert(graded.some((assertion) => pattern.test(assertion)), `no graded assertion covers ${behaviour}`);
  }
});

test('eval cases for the mode follow the shared eval format', async () => {
  const { evalDocument } = await readContract();
  const modeCases = evalDocument.evals.filter((evaluation) => MODE_CASE_IDS.includes(evaluation.id));

  assert.equal(modeCases.length, MODE_CASE_IDS.length, 'a mode case is missing');
  for (const evaluation of modeCases) {
    const label = `eval ${evaluation.id}`;
    assert.match(evaluation.expected_output, /^The reply /, `${label} states an outcome of the reply`);
    assert(Array.isArray(evaluation.files), `${label} carries a files list`);
    assert(
      evaluation.assertions.length >= MIN_ASSERTIONS && evaluation.assertions.length <= MAX_ASSERTIONS,
      `${label} has ${evaluation.assertions.length} assertions`,
    );
    assert.deepEqual(evaluation.expectations, evaluation.assertions, `${label} keeps both graders' lists identical`);
    for (const assertion of evaluation.assertions) {
      assert.match(assertion, /^The reply('s)? /, `${label}: an assertion is a statement about the reply`);
    }
    assert.doesNotMatch(evaluation.prompt, /development-workflow|review mode/i, `${label} names the skill`);
  }
});
