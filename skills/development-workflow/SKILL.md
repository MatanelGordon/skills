---
name: development-workflow
description: >
  The full pipeline for non-trivial software work: research and reuse, planning,
  test-first implementation, post-implementation test hardening, review,
  verification, and why-focused commits. Mutation testing is an explicit,
  risk-based option for critical logic, not a mandatory feature gate.
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
0 research → 1 plan → 2 test-first → 3 implement → 4 test-harden → 5 review
                                                         └─ optional mutate
                                  6 verify → 7 commit
```

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

## 5. Review, with mutation testing only when justified

Every non-trivial change gets review by eyes that did not write it: a fresh
subagent, platform reviewer, or `parallel-build` review pass. If none exists,
perform a fresh-context self-review and state the limitation. Fix CRITICAL/HIGH
findings, handle MEDIUM where feasible, and rerun critical paths.

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
| Small bug fix | Reproducing red test → fix → verify → why-commit | Only if explicitly requested/critical |
| Feature or refactor | Research → plan → TDD → implement → harden → review → verify → commit | Consider by the risk/value rule |
| Multi-seam/multi-day | Full default pipeline, usually deep-plan + parallel-build | Consider per critical slice |

Skipping a stage can be right; skipping silently is drift. State the skipped
stage, reason, and residual risk in one sentence.

## Anti-patterns

| Don't | Why |
|---|---|
| Code before inspecting/researching | Reimplements existing work and misses local constraints |
| Write tests only after code | They may merely describe what the implementation happens to do |
| Run mutation testing on every feature | Cost and setup can exceed the evidence value |
| Call incomplete mutation evidence complete | A score cannot cover unrun work or a failed harness |
| Merge a mutation worktree | Candidate history can contain deliberately faulty production |
| Hide a skipped stage | Downstream reviewers cannot judge residual risk |
