---
name: development-workflow
description: >
  Use when implementing a feature, bug fix, or refactor, or when a change should
  be reviewed through a pull request. Scales one pipeline to the change:
  research, plan, test-first, test hardening, bounded review convergence, verify,
  why-commit. Mutation testing is opt-in.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  depends: research-first, confidence-ranker, deep-plan, test-hardening, mutation-testing, adr
---

# Development workflow

Code is the fourth step, not the first. Earlier stages are cheaper places to
find a reused solution, a missing seam, or a test that cannot fail.

```text
0 research → 1 plan → 2 test-first → 3 implement → 4 test-harden
                                                   5 review ⇄ fix/test
                                              (2+ passes, 4-pass cap)
                                                     ↓ optional mutate
                                              6 verify → 7 commit
```

In opt-in **pull-request review mode**, a draft pull request goes up after test
hardening and before review, and nothing merges without the user's explicit
permission.

## Mandatory core

For every change:

1. **Inspect** relevant code, tests, and current behavior.
2. **Define done** as an observable outcome and named check.
3. **Implement** the smallest coherent change in scope.
4. **Verify** with the named checks and final diff.
5. **Report omissions** and anything unverified.

Optional stages scale with risk. A trivial edit compresses this core to seconds.

## 0. Research and reuse

Run `research-first`: inspect the ecosystem registry, GitHub prior art, and the
codebase. Prefer a proven solution that covers about 80% or more of the need.
Use `confidence-ranker` for uncertain claims that control consequential work.

## 1. Plan

For work wider than a couple of files, run `deep-plan`: clarify the goal and
success signal, inspect real code, assign disjoint file ownership, enumerate
edge cases, and quote test commands. Consult targeted history and repository
decision records. Big enough to split? `parallel-build` may execute the plan.

Small changes still get a short plan in the conversation.

If the change will enter review convergence, settle **pull-request review mode**
(below) with the plan: ask once, unless the answer was already given.

## 2. Tests first

1. **RED:** write the smallest behavior test and watch it fail for the reason
   being fixed.
2. **GREEN:** implement the minimum that passes.
3. **REFACTOR:** clean up and rerun.

Aim for meaningful coverage of changed code: logic unit tests, integration at
seams, and end-to-end tests for critical flows. Suspect implementation before a
later-failing test; change a test only when its contract was wrong.

## 3. Implement

Follow the plan and record amendments when reality changes it. Match repository
conventions. Commit at coherent green points when commits are in scope.

## 4. Test hardening — default for executable features

After planned behavior is green, use `test-hardening` with the acceptance
criteria, final diff, plan edge cases, and existing tests. It adds bounded,
observable test/fixture coverage only. A production defect returns as a failing
regression. A host without subagents runs the same protocol after a context
reset and reports that independent eyes were unavailable.

Integrate green additions, verify production was not changed, and record the
frozen green commit.

## Pull-request review mode — opt-in

The user reads the change on GitHub while review runs. The mode applies to any
change that enters review convergence in a repository with a GitHub remote.

**Ask once, with the plan:** "Review this through a pull request?" Ask before
implementation starts, or before the first review pass if that moment has
passed. An answer the user already gave, in the conversation, the task brief,
or standing instructions to the agent, counts: do not ask again. Approving the
plan is not a yes, a contribution policy is not an answer, and the answer
covers this change only. **No answer means no.** If nobody can answer (an
unattended or non-interactive run), do not wait: the mode is off. Push nothing
at any stage, review locally as stage 5 describes, and report that the mode
was off. A push and a pull request are visible to others and cannot be unsent;
a local branch can still become a pull request later.

When the mode is on:

1. **Branch first.** A yes puts commits in scope. From then on, work on a
   branch, never on the base branch; work already on the base branch moves to
   a new branch, and only that branch is pushed.
2. **Open after test hardening and before the first review pass** (after
   implementation when hardening is skipped). Check the diff for secrets, push
   the branch, and open a draft pull request (`gh pr create --draft`): title in
   commit form; body with what changed and why, how to review it, the checks
   run, and "Review: in progress". Give the user the URL. If the push or the
   pull request fails, report the error and wait; do not review as if it
   existed.
3. **Review on the pull request.** Stage 5 applies unchanged: its complete
   cumulative diff is the pull request diff. Each review fix is a new pushed
   commit, with no amend, rebase, or force-push, so the user can follow it.
4. **Finish.** Stage 7's rules apply to every commit pushed here. Only after
   stage 6 passes, update the body with the results and anything unverified,
   mark it ready (`gh pr ready`), and stop there, unmerged. A four-pass
   escalation leaves it a draft.

**Mode on or off, never merge a pull request, enable auto-merge, or push to the
base branch without the user's explicit permission for that change.** Agreeing
to the mode, green checks, and a clean review are not permission.

## 5. Review convergence, with mutation testing only when justified

Every non-trivial change passes a bounded review convergence gate. Run **at
least two review passes**, even when the first is clean. Each pass must use fresh
eyes or a fresh context and review the **complete cumulative diff** against the
acceptance criteria, relevant tests, and all prior findings and fixes. Prefer a
different subagent, platform reviewer, or `parallel-build` reviewer for each
pass. If none exists, reset context before each self-review and state that truly
independent eyes were unavailable.

For each pass:

1. Record every finding with severity and a concrete disposition.
2. Fix accepted findings and rerun the affected tests. CRITICAL and HIGH
   findings block completion; every MEDIUM and LOW finding needs an explicit
   disposition, even when deferred or rejected with rationale.
3. Any **review-driven production change** invalidates prior approval. Rerun the
   relevant tests, then submit the complete cumulative diff to another review
   pass. Never review only the latest patch or assume the fix is correct because
   it addressed the previous finding.

The gate opens only after all of these are true:

- at least two review passes are complete;
- the latest pass has no unresolved CRITICAL or HIGH findings;
- relevant and repository tests are green; and
- every MEDIUM and LOW finding has an explicit disposition.

The loop has a hard cap of four total passes. If the fourth review pass still
finds a blocking issue, leaves a gate condition unmet, or requires another
production change, stop and escalate the unresolved findings and residual risk
to the user. Do not claim completion and do not start a fifth pass without a new
user decision.

Mutation testing is separate and opt-in. Run `mutation-testing` only when:

- the user explicitly requests it; or
- a compatible engine is already configured **and** the scoped run fits an
  approved budget **and** the change affects plan-marked critical decision
  logic where stronger sensitivity evidence is worth the cost.

Skip it for ordinary low-risk features, unsupported ecosystems/runners, slow
unscopable suites, prototypes, generated code, or when isolation/setup cost
outweighs the decision value. Record the reason; skipping is a valid outcome.
When selected, discovery may overlap review, but test remediation waits for
review clearance. Follow `mutation-testing` for worktree/clone fallbacks and
its single definition of actionable, equivalent, excluded, and incomplete.

## 6. Verify

Always rerun the clean relevant/repository suites and inspect the final diff.
If mutation testing was selected, rerun affected targeted proofs and the agreed
scoped engine command after test import.

An optional mutation result marked `FINAL: incomplete` is reported to the user
for a decision and is not presented or committed as a completed mutation stage.
It does not retroactively turn clean tests or review into failures; the user may
accept the residual risk, rerun/narrow the scope, or stop the optional stage.

## 7. Commit and record

Commit messages explain why: use a conventional subject and a body naming the
trigger, constraint, or rejected alternative. Durable one-way architecture
calls belong in the repository's decision-record convention when it has one.

## Proportionality

| Change | Default pipeline | Mutation testing |
|---|---|---|
| Typo, rename, comment | Mandatory core only | Skip |
| Small bug fix | Reproducing red test → fix → verify → why-commit; add review convergence when non-trivial or risk-bearing | Only if explicitly requested/critical |
| Feature or refactor | Research → plan → TDD → implement → harden → review convergence → verify → commit | Consider by the risk/value rule |
| Multi-seam/multi-day | Full default pipeline with review convergence, usually deep-plan + parallel-build | Consider per critical slice |

Skipping a stage can be right; skipping silently is drift. State the skipped
stage, reason, and residual risk in one sentence.

## Anti-patterns

| Don't | Why |
|---|---|
| Code before inspecting/researching | Reimplements existing work and misses local constraints |
| Write tests only after code | They may merely describe what the implementation happens to do |
| Approve a review-driven fix without re-review | The fix can be incomplete or create a new defect |
| Review only the last patch | Review approval applies to the complete cumulative diff |
| Loop past the fourth unsuccessful review | Unbounded review hides an unresolved delivery decision |
| Run mutation testing on every feature | Cost and setup can exceed the evidence value |
| Call incomplete mutation evidence complete | A score cannot cover unrun work or a failed harness |
| Merge a mutation worktree | Candidate history can contain deliberately faulty production |
| Hide a skipped stage | Downstream reviewers cannot judge residual risk |
| Merge a pull request, or push to the base branch, without the user's explicit permission | A clean review and green checks are evidence, not the user's decision to ship |
