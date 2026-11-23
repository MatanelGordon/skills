import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(skillRoot));
const MAX_DESCRIPTION_LENGTH = 300;
const MODE_HEADING = '## Pull-request review mode';
const FIRST_MODE_CASE_ID = 11;
const MIN_ASSERTIONS = 2;
const MAX_ASSERTIONS = 5;

// Prose is hard-wrapped and Windows checkouts use CRLF, so every phrase check
// runs against text with whitespace runs collapsed to one space.
const flatten = (text) => text.replace(/\s+/g, ' ').trim();

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
  const hardening = skill.indexOf('## 4. Test hardening');
  const modeStart = skill.indexOf(MODE_HEADING);
  const review = skill.indexOf('## 5. Review convergence');

  assert.notEqual(mode, '', 'missing the pull-request review mode section');
  assert(hardening < modeStart && modeStart < review, 'the mode belongs between stage 4 and stage 5');
  assert.match(flatten(sectionOf(skill, '## 1. Plan')), /pull-request review mode/i);
});

test('the mode is asked once and is off when nobody answers', async () => {
  const { mode } = await readContract();

  assertPhrase(mode, /opt-in/i, 'the mode section');
  assertPhrase(mode, /ask once/i, 'the mode section');
  assertPhrase(mode, /do not ask again/i, 'the mode section');
  assertPhrase(mode, /no answer means no/i, 'the mode section');
  assertPhrase(mode, /nobody can answer \(an unattended or non-interactive run\), do not wait/i, 'the mode section');
  assertPhrase(mode, /cannot be unsent/i, 'the mode section');
});

test('the pull request opens as a draft after stage 4 and before the first review pass', async () => {
  const { mode } = await readContract();

  assertPhrase(mode, /after stage 4.*before the first review pass/i, 'the mode section');
  assertPhrase(mode, /gh pr create --draft/, 'the mode section');
  assertPhrase(mode, /report the error and wait/i, 'the mode section');
  assertPhrase(mode, /gh pr ready/, 'the mode section');
});

test('review fixes are new commits and stage 5 still governs the review', async () => {
  const { skill, mode } = await readContract();

  assertPhrase(mode, /new pushed commit/i, 'the mode section');
  assertPhrase(mode, /no amend, rebase,? or force-push/i, 'the mode section');
  assertPhrase(mode, /complete cumulative diff is the pull request diff/i, 'the mode section');
  assertPhrase(mode, /comments the user leaves there before it is ready are findings for the next pass/i, 'the mode section');
  assert.match(flatten(sectionOf(skill, '## 5. Review convergence')), /at least two review passes/i);
});

test('nothing merges without explicit permission', async () => {
  const { skill, mode } = await readContract();

  assertPhrase(mode, /never merge without the user's explicit permission/i, 'the mode section');
  assertPhrase(mode, /auto-merge/i, 'the mode section');
  assertPhrase(mode, /agreeing to the mode.*green checks.*clean review.*not permission/i, 'the mode section');
  assert.match(sectionOf(skill, '## Anti-patterns'), /merge[^\n|]*without[^\n|]*permission/i);
});

test('README mirrors the mode and its merge rule', async () => {
  const { readmeWorkflow } = await readContract();
  const where = 'the README workflow section';

  assertPhrase(readmeWorkflow, /pull-request review mode/i, where);
  assertPhrase(readmeWorkflow, /draft pull request.{0,80}before the first review pass/i, where);
  assertPhrase(readmeWorkflow, /never merges without your explicit permission/i, where);
});

test('evals cover asking, timing, the unanswered default, and not merging', async () => {
  const { evalDocument } = await readContract();
  const hasCase = (promptPattern, expectedPattern) => evalDocument.evals.some((evaluation) => (
    promptPattern.test(evaluation.prompt) && expectedPattern.test(evaluation.expected_output)
  ));

  assert(
    hasCase(/before you write any code/i, /asks once.*pull request/i),
    'missing the case where the skill asks about the mode',
  );
  assert(
    hasCase(/as a pull request while it is being reviewed/i, /draft pull request.*before the first review pass/i),
    'missing the case that opens the pull request at the right moment',
  );
  assert(
    hasCase(/nobody will answer/i, /does not push the branch or open a pull request/i),
    'missing the unanswered-default case',
  );
  assert(
    hasCase(/finish up/i, /does not merge/i),
    'missing the case that refuses to merge without permission',
  );
});

test('eval cases for the mode follow the shared eval format', async () => {
  const { evalDocument } = await readContract();
  const modeCases = evalDocument.evals.filter((evaluation) => evaluation.id >= FIRST_MODE_CASE_ID);

  assert(modeCases.length >= 4, `expected the four mode cases, found ${modeCases.length}`);
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
      assert.match(assertion, /^The reply /, `${label}: an assertion is a statement about the reply`);
    }
    assert.doesNotMatch(evaluation.prompt, /development-workflow|review mode/i, `${label} names the skill`);
  }
});
