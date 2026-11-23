# Plan: workflow-pr-mode

**Status:** executing
**Created:** 2026-11-23   **Base branch:** `origin/codex/review-convergence-loop` (`8e6e4fc`, PR #4)

## Goal

Add an opt-in pull-request review mode to `development-workflow`. In the mode,
the branch is pushed and a draft pull request is opened when implementation is
complete and before the first review pass, review fixes arrive as new commits,
and nothing merges without the user's explicit permission. The skill asks the
user once whether to use the mode, and states what happens when nobody answers.

The observable signal: a new contract test passes, the repository suite and
validator pass, and the three evaluation gates under "Evaluation" hold on
`qwen/qwen3-coder-30b-a3b-instruct`.

## Out of scope

- Changing PR #4's review convergence rules (pass count, cap, severities).
- A GitHub Action, a script, or any automation that opens or merges a PR.
- Hosts other than GitHub (the wording uses `gh` as its example).
- The Mermaid graph and the two scale SVGs in the README.
- Any skill other than `development-workflow`.

## Background

PR #4 leaves the skill as stages 0 to 7 with stage 5 a bounded convergence
gate: two or more fresh passes over the complete cumulative diff, re-review
after any review-driven production change, a four-pass cap. Stage 3 already
commits "at coherent green points when commits are in scope" and stage 4
records a frozen green commit, so commits before review are not new. Nothing in
the skill mentions pushing, pull requests or merging. `parallel-build` merges
local worktrees; that is a different operation and stays untouched.

The mode fits without altering stage 5: the "complete cumulative diff" a pass
must review is exactly the pull request diff.

Research (stage 0): this is a policy text change with no utility to reuse. The
repository was searched for existing PR or merge handling in the skill (none).
`gh pr create --draft` and `gh pr ready` are the two commands the mode names.

Constraints found in the code:

- `skills/development-workflow/tests/review-convergence.test.mjs` pins phrases
  in stage 5 and the README row for the skill. Those lines stay as they are.
- `skills/mutation-testing/tests/mutation-protocol.test.mjs` requires every
  `expected_output` in this skill's evals to start with "The reply ".
- `install/validate.mjs` requires `expectations` on every case, counts `"id":`
  keys in the raw file (so a case may not nest an object with an `id`), and
  requires equal versions in `package.json`, `package-lock.json` and the top
  of `CHANGELOG.md`.
- `.gitignore` ignores `.plan`; earlier plans were committed with `git add -f`.
- The description rule for this run: 300 characters at most, trigger first.
  The current description is 309 characters and has no "Use when".

## Decisions

1. **When to ask: once, with the plan (stage 1).** The answer changes what
   happens next there: which branch the work goes on and whether commits are
   in scope. It is also the moment the user is most likely still present. If
   the skill is entered after that point, the question is asked before the
   first review pass at the latest. An answer the user already gave, in the
   conversation, the task brief or standing instructions to the agent, counts
   and is not asked again. Approving the plan is not a yes, a contribution
   policy is not an answer, and the answer covers this change only. Changes
   that skip review convergence (typo, rename) are not asked, and neither is
   work in a repository with no GitHub remote.
2. **Default when nobody answers: the mode is off.** "Nobody answers" means
   nobody can: an unattended or non-interactive run. In a live session the
   question goes out with the plan and the reply to the plan answers it. With
   nobody there the skill does not wait: nothing is pushed, review runs
   locally as stage 5 describes, and the report says the mode was off. A push and a pull request
   are visible to other people, trigger CI and notifications, and cannot be
   unsent. The local branch loses nothing: it can become a pull request later.
   So the unanswered case takes the reversible path. This is the job owner's
   choice, as the brief asked; it is listed for the user to overturn.
3. **Where the PR opens: after stage 4's green freeze (after stage 3 when
   hardening is skipped), before the first review pass.** That is the user's
   "between finish implementing and reviewing". Hardening adds tests to the
   implementation, so it belongs before the PR, and the frozen green commit is
   what gets pushed.
4. **Draft first, ready at the end.** The PR opens as a draft and is marked
   ready after stage 6 verification. A four-pass escalation leaves it a draft.
   This matches the interim process the other five jobs follow.
5. **Merge rule, with the mode on or off.** Never merge a pull request, enable
   auto-merge, or push to the base branch without the user's explicit
   permission for that change. Agreeing to the mode, green checks and a clean
   review are not permission. The rule is not limited to the mode because the
   30B model, told only what the mode forbids, planned to commit on the base
   branch and push at the end of an unattended run with the mode off.
6. **Failure to push or open the PR:** report the error and wait. The user
   chose the mode to read the change on GitHub, so reviewing without the PR
   would silently drop what they asked for.
7. **Comments on the PR, and posting review findings to it, are out of
   scope.** An earlier draft had the agent record each pass on the PR and
   treat the user's comments as findings. Review pass 1 showed four cases
   that sentence left open (nobody told to read them, a comment during the
   pass that opens the gate, a comment at pass four, and no way to tell the
   agent's comments from the user's under one account). Neither behaviour was
   asked for, so both were cut. The commits and their why-messages are how the
   user follows the review.
8. **A yes puts commits in scope and the branch comes first.** Stage 3 commits
   "when commits are in scope"; the mode needs commits before review, so the
   yes settles that. Work that already sits on the base branch moves to a new
   branch and only that branch is pushed.
9. **Stage 7 does not move.** Its why-message and decision-record rules apply
   to every commit pushed in the mode. The PR is marked ready only after
   stage 6 passes.
10. **Secrets are checked before the push.** The mode publishes the diff
    before any review pass has read it.

Decisions 2, 4, 6 and 8 to 10 are choices made in this job, not the user's words.

No ADR: a reversible workflow-policy addition.

## Approach

One short unnumbered section, "Pull-request review mode", placed between
stage 4 and stage 5 where it applies in time, plus a one-line pointer in
stage 1 where the question is asked, a note under the pipeline diagram, and
one anti-pattern row. Stage 5's text is not edited. The README gets one
paragraph and a clause in the skill's registry row.

## File map

| Path | Change | Phase | Owner |
|---|---|---|---|
| `.plan/workflow-pr-mode/plan.md` | new: this plan | 1 | J6 |
| `skills/development-workflow/tests/pr-review-mode.test.mjs` | new: contract tests, written first | 1 | J6 |
| `skills/development-workflow/SKILL.md` | description; stage 1 pointer; mode section; diagram note; anti-pattern row | 2 | J6 |
| `skills/development-workflow/evals/evals.json` | four new cases (ids 11 to 14) in the run's eval format | 2 | J6 |
| `README.md` | one paragraph in the workflow section; clause in the skill's registry row | 2 | J6 |
| `CHANGELOG.md`, `package.json`, `package-lock.json` | 1.22.3 entry and version | 3 | J6 |

## Phases

### Phase 1: contract first

Write `pr-review-mode.test.mjs` and watch it fail against PR #4's text.

### Phase 2: skill, evals, README

Write the mode, the description, the eval cases and the README paragraph until
the new test and the existing ones pass.

### Phase 3: release metadata, PR, review, evaluation

Bump to 1.22.3, open a draft PR against `codex/review-convergence-loop`, run
two or more fresh review passes over the PR diff, push fixes as new commits,
run the evaluation, put the before/after table in the PR body, mark it ready.
Do not merge.

## Test strategy

### Critical-path tests

```bash
node --test skills/development-workflow/tests/pr-review-mode.test.mjs
node --test skills/development-workflow/tests/review-convergence.test.mjs
npm test
npm run validate
git diff --check origin/codex/review-convergence-loop...HEAD
```

### What the contract test checks

Each check matches a whole clause, not a keyword, so that inverting or
removing the rule fails the test. Twenty such rewordings were tried on a
scratch copy and all twenty failed it.

- The description is 300 characters or fewer and starts with "Use when".
- The mode section exists, sits between stage 4 and stage 5, and stage 1 says
  to ask once with the plan.
- Only a direct answer turns the mode on: plan approval is not a yes, a
  contribution policy is not an answer, the answer covers one change.
- With nobody to answer: no waiting, nothing pushed, local review, reported.
- A yes puts commits in scope; work stays off the base branch.
- The PR opens as a draft after stage 4 and before the first review pass,
  after a check for secrets; a failed push or PR is reported, not worked around.
- Stage 5 applies unchanged; review fixes are new commits with no amend,
  rebase or force-push.
- The PR is marked ready only after stage 6; a four-pass escalation leaves it
  a draft.
- With the mode on or off, no pull request is merged, no auto-merge enabled
  and nothing pushed to the base branch without explicit permission for that
  change; agreeing to the mode, green checks and a clean review are named as
  not permission.
- The README mentions the mode, its timing, its merge rule and its default.
- The graded assertions of cases 11 to 14 cover asking, opening before review
  and after hardening, the draft, new commits, the unanswered default, not
  merging, and waiting for permission. Those four cases follow the run's eval
  format.

### Edge cases

| Case | Axis | Status |
|---|---|---|
| Nobody answers the question | absence | covered: mode off, nothing pushed, stated in the report; eval 14 |
| The answer was already given (conversation, brief, standing instructions) | state | covered: not asked again |
| The user approves the plan without addressing the question | ambiguity | covered: not a yes |
| A yes given for an earlier change | scope | covered: the answer covers one change |
| The repository has a "changes go through pull requests" policy | ambiguity | covered: not an answer |
| Trivial change | boundary | covered: not asked, since it skips review convergence |
| No GitHub remote | dependency | covered: the mode does not apply, so it is not asked |
| Skill entered after implementation | ordering | covered: asked before the first review pass |
| Work already on the base branch when the yes arrives | state | covered: moves to a new branch; only that branch is pushed |
| Mode on, push or PR creation fails | failure | covered: report and wait |
| A secret in the diff | security | covered: checked before the push |
| Review fix while the PR is open | state transition | covered: new pushed commit, pinned by the contract test; eval 12 asserts fixes are never amended or force-pushed |
| Four-pass cap reached with the PR open | boundary | covered: stays a draft, escalates as stage 5 says |
| Gate open, checks green, user away | permission | covered: mark ready, do not merge; eval 13 |
| "Yes" to the mode read as permission to merge | permission | covered: named as not permission |
| The base branch moves or the PR conflicts | concurrency | not covered: the merge rule now names the pull request, so merging the base into the branch is not forbidden, but no step describes it |
| Comments left on the PR | input | out of scope (decision 7) |
| GitLab or another host | dependency | out of scope |

### Coverage

The Node test covers the wording contract in `SKILL.md`, README parity and
eval presence. The eval cases cover what a model does with the text. The root
suite and validator cover discovery, schemas and release metadata.

### Evaluation (before = PR #4's skill text with this branch's eval cases)

`$RUN` is `/Users/matanelgordon/Desktop/Projects/skills-improvement-run`, the
shared folder of this improvement run. It is outside the repository; the
wrappers in `$RUN/bin/` hold the model settings and the spend guard.

1. SkillEvaluator Tier 1, no model, before and after, each on an isolated copy
   of the skill folder:

   ```bash
   $RUN/bin/se.sh tier1 $RUN/data/j6/before/skills/development-workflow --no-llm -r cli,json,html -o $RUN/data/j6/before-tier1
   $RUN/bin/se.sh tier1 $RUN/data/j6/after/skills/development-workflow --no-llm -r cli,json,html -o $RUN/data/j6/after-tier1
   ```

2. agent-skills-eval on the 30B model. The wrapper has no attempts flag, so
   three attempts are three runs per arm, at temperature 0.7 in both arms
   (at 0 the attempts would repeat each other):

   ```bash
   for arm in before after; do for n in 1 2 3; do
     ASE_TEMPERATURE=0.7 $RUN/bin/ase.sh $RUN/data/j6/$arm/skills $RUN/data/j6/ase/$arm/run$n
   done; done
   ```

   Both arms are built first by `zsh $RUN/data/j6/tools/prepare-arms.sh`,
   which exports the skill from each commit into `$RUN/data/j6/before/` and
   `$RUN/data/j6/after/` and gives both the same `evals/`. For the ten older
   cases it copies `expectations` into `assertions`, because this evaluator
   grades only `assertions`; the repository file is not changed.
   `python3 -I $RUN/data/j6/tools/ase-summary.py $RUN/data/j6/ase/before $RUN/data/j6/ase/after`
   prints the tables.

3. A single attempt of the four new cases in each arm runs first, to check the
   cases and measure cost. If six full runs would pass the $0.20 share, the
   ten older cases keep three attempts per arm and the PR says which runs
   were cut.

**Gates**, on the with-skill replies. Pass rate means assertions passed over
assertions graded, pooled over the cases and attempts named, not a mean of
per-case rates. An empty reply is invalid and is rerun:

- **G1, the new cases pass with the mode:** over cases 11 to 14 and three
  attempts, the after arm's pass rate is at least 0.80.
- **G2, the new cases need the mode:** on the same cases the after arm is at
  least 0.15 above the before arm.
- **G3, the older cases pass no less often:** over cases 1 to 10 and three
  attempts, the after arm's pass rate is no more than 0.10 below the before
  arm's. With about 90 graded assertions per arm the standard error of the
  difference is about 0.07, so a smaller gap is not a change. Any single case
  that falls by more than 0.33 has its replies read and is reported.

Tier 3 is not planned: the J6 budget share is $0.20 and a container has no
GitHub remote to push to, so the mode's actions cannot complete there.

## Definition of done

- The mode section is in `SKILL.md`, under forty lines, and stage 5 is untouched.
- The description is 300 characters or fewer and starts with its trigger.
- The contract test, `npm test` and `npm run validate` pass.
- Four eval cases cover the mode in the run's eval format.
- Gates G1, G2 and G3 hold, or the PR and the report say which did not.
- A draft PR against `codex/review-convergence-loop` is open, reviewed in two
  or more fresh passes, carries the before/after table, and is marked ready.
- Nothing is merged.

## Risks and unknowns

- The eval format standard (`$RUN/eval-format.md`) is not published yet. The
  cases are written last; if it is still missing, the fallback in the run
  README applies and the status file says so.
- A one-reply evaluator cannot see a push or a PR. The cases ask for the next
  steps in words, so they measure what the model says it will do.
- The existing ten cases may shift by noise. Three attempts per arm; gate G3
  says how large a gap counts.
- The six PRs of this run collide on the version line. Expected; sorted at merge.

## Amendments

- 2026-11-23: `plan-reviewer` returned REVISE with three blockers: no numeric
  gate for "pass no less often", evaluation commands not quoted, and user
  comments on the PR claimed as covered with no decision or assertion behind
  them. All three are fixed above (gates G1 to G3, the quoted commands,
  decision 7 and its assertion). Decision 2 now says what "nobody answers"
  means, as the review asked.
- 2026-11-23: the contract test, the skill text, the README paragraph and the
  release metadata were written while that review was running, before its
  verdict. Nothing was committed until the blockers were fixed.
- 2026-11-23: the eval format standard was published during the work. The new
  cases follow it: `assertions` and `expectations` identical, one condition
  per assertion, and prompts that describe the request in the user's words
  instead of naming the mode. The ten older cases are left as they are; their
  format is normalised by the job that owns the format.
- 2026-11-23: `plan-reviewer` approved the revision. Its two remaining notes
  are applied: the stale 0.15 tolerance under "Risks" now points to G3, and
  the step that builds the two arms is quoted.
- 2026-11-23: review pass 1 on the pull request (a fresh reviewer, complete
  diff): no CRITICAL or HIGH, nine MEDIUM, six LOW. Accepted and fixed: when
  to branch; what counts as an answer; stage 7 and commits in scope; the
  merge rule's object; no remote, mode-off push and secrets; tests that
  matched keywords instead of clauses; eval coverage read from prompts
  instead of graded assertions; eval cases that passed without the mode or
  asserted actions a reply cannot perform. Cut instead of fixed: findings on
  the PR and user comments (decision 7). Left open and listed above: what to
  do when the base branch moves.
- 2026-11-23: the preliminary evaluation (four new cases, one attempt per
  arm) cost about $0.011, so six full runs fit the share and nothing is cut.
- 2026-11-23: a second one-attempt run of the four rewritten cases (before
  2 of 13 assertions, after 9 of 13) showed three places where the 30B model
  misread the text, all fixed before review pass 2: with the mode off it took
  "push nothing" to mean "not yet" and planned a push after verification, and
  read the branch rule as applying only with the mode on, so it planned to
  commit on the base branch; it described the opening point as "after stage 4
  (implement)"; and it ended with the pull request waiting for the user to
  mark it ready. The text now says "push nothing at any stage", states the
  merge and base-branch rule for the mode on or off, names the stage (test
  hardening) instead of only numbering it, and ends step 4 with "stop there,
  unmerged". Two case-12 assertions no longer require the opening point to be
  inside the numbered list.
