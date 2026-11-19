---
name: development-workflow
description: >
  The full pipeline for building anything non-trivial: research and reuse before
  writing code, plan before implementing, tests before implementation
  (red-green-refactor), post-implementation test hardening, mutation testing
  beside review, and commits that explain why.
  Use when starting a feature, fix, refactor, or migration; when asked "how
  should we approach building X"; when tempted to jump straight to code; or when
  work shipped without tests or review and needs the process retrofitted. Each
  stage defers to a dedicated skill where one exists (research-first, deep-plan,
  parallel-build, test-hardening, mutation-testing, adr). Skip stages only
  deliberately and say so - a typo fix does not need the pipeline, a new
  feature does.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  depends: research-first, confidence-ranker, deep-plan, test-hardening, mutation-testing, adr
---

# Development workflow

Code is the *fourth* step of building software, not the first. The pipeline
exists because each stage is cheaper than discovering its absence later: a
library found in research saves the feature, a plan catches the collision before
four agents hit it, a failing test proves the test can fail, a fresh hardener
finds risk created by the implementation, mutation testing challenges test
sensitivity, a review catches what the author cannot see, and a commit that
says *why* saves the archaeology.

```
0 research → 1 plan → 2 test-first → 3 implement → 4 test-harden → freeze green
                                                                    ├─ 5 review
                                                                    └─ 5 mutate
                                  6 test-only remediation → verify → 7 commit
```

Stages defer to dedicated skills where they exist. This skill is the spine that
keeps them in order.

## Mandatory core

Optional stages scale with the work; this core does not disappear. For every
change:

1. **Inspect** — read the relevant code, tests, and current behavior before
   editing. Do not implement from the request alone.
2. **Define done** — state the observable outcome and the check that will prove
   it, keeping the original scope intact.
3. **Implement** — make the smallest coherent change that reaches that outcome
   and follows the codebase's conventions.
4. **Verify** — run the named checks and inspect the final diff. For a real
   feature, this includes the hardening/review/mutation join below. A subagent's
   or tool's success claim is not verification.
5. **Report omissions** — compare the result with the original request and name
   anything deliberately skipped, still unverified, or left incomplete.

A trivial change compresses this loop to seconds; it does not acquire research,
a plan, TDD, or independent review merely because the core is mandatory. The
stages below are escalation layers for work whose risk and scope justify them.

## 0. Research and reuse — before any new implementation

Run the `research-first` sweep: registries for the ecosystem, GitHub for prior
art, the codebase for something that already does it. **Prefer adopting or
porting a proven implementation when it covers ~80% or more of the need** — name
the gap, present the choice. Building is the fallback, not the default.

Two-source discipline applies to everything the design rests on: versions,
behaviors, "we can't use X because…" claims. When an uncertain finding controls
whether work is safe to start, `confidence-ranker` isolates that claim, raises
it with the cheapest decisive check, and reports whether the action is ready.
A plan resting on a claim below its required evidence threshold gets a
verify-first task; the claim's concrete next check is that task.

## 1. Plan — before implementing

For anything spanning more than a couple of files, run `deep-plan`: the clarity
gate (goal, success signal, out of scope), investigation of the real code, a
file map, edge cases enumerated with a status each, and test commands verbatim.
Big enough to split? `parallel-build` executes the plan across subagents.

Check prior decisions before planning — `.adr/`, the project's memory
conventions, and targeted git history. A plan that contradicts a recorded
decision is dead on arrival.

Small-but-real changes still get a paragraph of plan in the conversation:
what will change, what proves it worked.

## 2. Tests first — red, green, refactor

Write the test before the implementation, and **run it to watch it fail**. A
test that has never failed proves nothing — it might be green because the
assertion is vacuous, the wrong thing is mocked, or it never ran.

1. **RED** — write the smallest test for the behavior; run it; see the failure
   and check it fails *for the right reason*.
2. **GREEN** — write the minimal implementation that passes; run it.
3. **REFACTOR** — clean up with the test as a safety net; run it again.
4. Repeat per behavior. Commit at green points.

Coverage: aim for **~80%+ on the code you're touching**, with the shape stated
- unit tests for logic, integration where components meet, end-to-end for the
critical user flows. A number without shape is vanity; error paths count.

When a test fails later: suspect the implementation first, not the test. Fix
tests only when the test itself is wrong, and say so explicitly.

## 3. Implement

Follow the plan; amend it visibly when reality disagrees (the plan's
`Amendments` section, not silent drift). Match the codebase's conventions.
Commit incrementally at green states — long runs die, committed work survives.

## 4. Test hardening — after implementation

Once planned behavior is green, dispatch a fresh `test-hardening` subagent with
the acceptance criteria, final implementation diff, plan edge cases, and
existing tests. It searches for observable edge cases created by the actual
implementation and changes tests or fixtures only.

If it finds a production defect, it returns a failing regression test to the
implementer rather than fixing production code. After that fix, rerun affected
hardening. Otherwise integrate the green test-only additions, verify production
bytes did not change, and record a **frozen green commit**.

This is not a second version of initial TDD: TDD defines intended behavior
before implementation; hardening challenges the implementation shape after it
exists.

## 5. Review and mutation discovery — in parallel

Every non-trivial change gets reviewed by eyes that didn't write it: a fresh
subagent, a platform reviewer, or the `parallel-build` phase-3 pattern
(CR.md, plus a security pass for code that will ship). Triage findings by
severity: **CRITICAL and HIGH get fixed before merging**, MEDIUM when feasible,
LOW is backlog. Re-run the critical-path tests after fixes — a reviewer's DONE
is a claim, not evidence.

At the same frozen green commit, dispatch a fresh `mutation-testing` subagent in
a separate disposable worktree. The reviewer remains in the ordinary feature
worktree; only the mutation tester needs isolation. Native mutation engines
deliberately alter production code there to measure whether tests catch small
faults. That worktree is never merged.

Use native engine workers first. Add at most three subagent lanes only for
independent projects or behavior clusters with disjoint test/fixture ownership
and predicted wall-clock savings. Merge raw reports before assigning any test
edits.

Mutation discovery can proceed during review, but remediation waits for
**explicit review clearance** of the affected public contract and production
paths. A review change to a mutant's path, dependency, or acceptance criterion
invalidates that result and requires a targeted rerun.

## 6. Test-only remediation and joined verification

On restored clean production code, mutation remediation changes tests or
fixtures only. Each accepted test must pass on clean code and fail for the
targeted fault. A fresh reviewer then approves the public assertion,
deterministic fixture, and test-only diff before it can enter the mutation
skill's Git-backed allowlist, regular-file, symlink, byte-equality, and proof
gates. Never merge the mutation branch.

If a test-only cherry-pick conflicts, abort it. Regenerate or replay the change
on the reviewed head; never hand-resolve a mutation-worktree conflict. Rerun all
guards, clean tests, and targeted-mutant proof after integration.

Join only after review fixes and accepted mutation tests are integrated. Run the
clean repository suite and combined scoped mutation run. The gate is **no
actionable survivors**. No-coverage mutants, timeouts, harness failures, and
budget exhaustion are incomplete evidence and must be reported as such.

## 7. Commit and record

When committing is in scope, the commit body carries *why* — the trigger,
constraint, or evidence that forced the change. Put durable metadata in a final
trailer block (`Constraint:`, `Rejected:`, `Refs:`), use a conventional subject
(`feat:`/`fix:`/`refactor:`/…), and reference governing decisions as
`Refs: ADR-NNNN`. Hard-to-reverse calls made along the way become ADRs; merges
from worktrees carry the request and plan.

## Proportionality

The pipeline is for building things. Scale it honestly:

| Change | Pipeline |
|---|---|
| Typo, rename, comment | Just do it. |
| Small bug fix | Test that reproduces it (red) → fix (green) → commit with why. |
| Real feature or refactor | The full pipeline. |
| Multi-seam / multi-day work | Full pipeline with `parallel-build` executing. |

Skipping a stage is sometimes right — skipping it *silently* never is. "No
plan needed because X" and "not adding tests here because Y" are one-sentence
statements that keep the skip a decision instead of a drift.

## Anti-patterns

| Don't | Why |
|---|---|
| Code first, tests after | Tests written post-hoc assert what the code does, not what it should do |
| A test you never saw fail | Might be green for the wrong reason |
| Build what a library does | The most expensive way to get a worse library |
| Plan in your head for multi-file work | The collision shows up in the merge, not the plan |
| Merge with CRITICAL/HIGH findings open | Review theater |
| Merge a mutation worktree | Deliberately faulty production code can escape isolation |
| Treat timeout or no coverage as a mutation pass | Unverified behavior is mislabeled as evidence |
| `wip` / `fixes` commit messages | The why evaporates exactly when it matters |
| Silently skipping a stage | A skip is a decision; drift is a bug |
