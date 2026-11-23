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
5. **Merge rule.** Never merge the pull request or enable auto-merge without
   the user's explicit permission for that pull request, and never push to the
   base branch unless the user's instructions say to. Agreeing to the mode,
   green checks and a clean review are not permission. With the mode off,
   nothing is pushed that the user has not asked for, and the anti-pattern row
   ("Merge a pull request, or push to the base branch, when the user has not
   said to") holds in every run. An earlier wording required per-change
   permission for any push to the base branch, mode on or off; review pass 2
   showed it overrode standing instructions such as "commit and push", so the
   base-branch half now defers to the user's instructions.
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

Decisions 2, 4, 6 and 8 to 10, and the parts of decision 5 beyond "wait for my
permission before merging", are choices made in this job, not the user's words.

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
removing the rule fails the test. Thirty-two such rewordings were tried on a
scratch copy and all thirty-two failed it
(`$RUN/data/j6/tools/mutation-check.py <worktree> <scratch-dir>`).

- The description is 300 characters or fewer and starts with "Use when".
- The mode section exists, sits between stage 4 and stage 5, and stage 1 says
  to ask once with the plan.
- Only a direct answer turns the mode on: plan approval is not a yes, a
  contribution policy is not an answer, the answer covers one change.
- No answer, whether a reply that skips the question or nobody there: no
  waiting, nothing pushed that the user has not asked for, local review, and
  the report says the mode was off.
- A yes puts commits in scope; work stays off the base branch.
- The PR opens as a draft against the base branch after stage 4 and before
  the first review pass, after a check for secrets; the user gets the URL; a
  failed push or PR is reported, not worked around.
- Stage 5 applies unchanged; review fixes are new commits with no amend,
  rebase or force-push.
- The PR is marked ready only after stage 6, the report says it is unmerged,
  and a four-pass escalation leaves it a draft.
- The pull request is not merged and auto-merge is not enabled without
  explicit permission for that pull request; nothing is pushed to the base
  branch unless the user's instructions say to; agreeing to the mode, green
  checks and a clean review are named as not permission.
- The README mentions the mode, when it asks, its timing, new commits, ready
  after verification, its merge rule and its default.
- The graded assertions of cases 11 to 14 cover asking with the plan, opening
  between hardening and review, the draft, no force-push, staying unmerged,
  the unanswered default (no PR, no push, reported), not merging, and waiting
  for permission. Those four cases follow the run's eval format.

### Edge cases

| Case | Axis | Status |
|---|---|---|
| Nobody answers the question | absence | covered: mode off, nothing pushed, stated in the report; eval 14 |
| The user replies to the plan but skips the question | absence | covered: no answer, so the mode is off and the report says so |
| Stacked work whose base is not the default branch | state | covered: the pull request is opened against the base branch (`--base`) |
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
| Review fix while the PR is open | state transition | covered: new pushed commit, pinned by the contract test; eval 12 asserts force-pushing is ruled out |
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

2. agent-skills-eval at the 30B size, on the free pair: model under test
   `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, grader
   `nvidia/nemotron-3-ultra-550b-a55b:free` (see amendment "budget"). The
   wrapper has no attempts flag, so three attempts are three runs per arm, at
   temperature 0.7 in both arms (at 0 the attempts would repeat each other).
   Free runs go through the shared lock:

   ```bash
   export ASE_TARGET=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
   export ASE_JUDGE=nvidia/nemotron-3-ultra-550b-a55b:free
   export ASE_TEMPERATURE=0.7 ASE_CONCURRENCY=4
   for arm in before after; do for n in 1 2 3; do
     $RUN/bin/with-lock.sh free 3 $RUN/bin/ase.sh $RUN/data/j6/$arm/skills $RUN/data/j6/ase-free/$arm/run$n
   done; done
   ```

   Both arms are built first by `zsh $RUN/data/j6/tools/prepare-arms.sh`,
   which exports the skill from each commit into `$RUN/data/j6/before/` and
   `$RUN/data/j6/after/` and gives both the same `evals/`. For the ten older
   cases it copies `expectations` into `assertions`, because this evaluator
   grades only `assertions`; the repository file is not changed.
   `python3 -I $RUN/data/j6/tools/ase-summary.py $RUN/data/j6/ase-free/before $RUN/data/j6/ase-free/after`
   prints the tables. An empty reply (the reasoning model spent its allowance)
   is invalid and its case is rerun.

3. The earlier paid measurement on `qwen/qwen3-coder-30b-a3b-instruct`, graded
   by `qwen/qwen3.8-flash`, is kept in `$RUN/data/j6/ase/` and reported beside
   the free pair. It is not mixed with it: different model and grader, and the
   four new cases were reworded after it ran.

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

Tier 3 is not planned: a container has no GitHub remote to push to, so the
mode's actions cannot complete there, and the single-reply cases already ask
what the agent would do at each point.

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
- 2026-11-23: correction to the previous entry. With the mode off, reading the
  branch rule as applying only when the mode is on was a correct reading, not
  a misreading: the branch rule sits under "When the mode is on". What was
  wrong was the planned push, and that is what the text now rules out. Local
  commits on the base branch with the mode off are left to stage 3 as before.
- 2026-11-23: three-attempt paid run at `7eebf22` (cases 11 to 14 as worded
  then), qwen3-coder-30b graded by qwen3.8-flash, with-skill pass rates:
  new cases before 0.21 (8/39), after 0.77 (30/39), so G2 held and G1 missed
  by 0.03; older cases before 0.55 (51/93), after 0.49 (46/93), so G3 held.
  Case 10 fell from 8/9 to 3/9 assertions: the after replies answered "mark
  this complete" with "I cannot mark it complete or merge without your
  permission" instead of asking for a second fresh full-diff pass. Two
  scratch variants (the merge rule scoped to the pull request, and the mode
  section moved after stage 7) also scored 3/9 on case 10 over three
  attempts each, so neither placement nor the "mode on or off" wording
  explains it. Reported, not fixed.
- 2026-11-23, budget: the shared key passed the $4.50 guard, so paid runs
  stopped. This job's paid runs (22 runs, 224 graded replies) cost about
  $0.11 in visible tokens; the grader's hidden reasoning tokens are not
  counted, so the true figure is higher, and the key's total cannot be split
  by job. The final measurement moves to the free pair (step 2 above).
- 2026-11-23: review pass 2 (a second fresh reviewer, complete diff at
  `7eebf22`): no CRITICAL or HIGH, five MEDIUM, six LOW. Fixed in the skill:
  "push nothing at any stage" contradicted the merge rule's own exception and
  left the attended no-answer case unreported, so "no answer" now covers a
  reply that skips the question and pushes nothing the user has not asked
  for; the mode-on-or-off base-branch rule overrode standing instructions, so
  it now defers to them (decision 5); the pull request now names its base.
  Fixed in tests: the opt-in clauses, the answer clause, "only that branch is
  pushed", the stage 1 condition and "give the user the URL" are pinned, bold
  markers are stripped before matching, and the README check pins when it
  asks, new commits and ready after verification. Fixed in evals: case 14 no
  longer hands over its answer ("what, if anything, you will push"), case 11's
  second assertion now separates the arms, case 12 has one assertion for the
  opening point and one condition per assertion, and `expected_output` of
  cases 12 to 14 says what the reply says rather than what it does.
