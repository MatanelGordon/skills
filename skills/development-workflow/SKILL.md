---
name: development-workflow
description: >
  The full pipeline for building anything non-trivial: research and reuse before
  writing code, plan before implementing, tests before implementation
  (red-green-refactor), review before merging, and commits that explain why.
  Use when starting a feature, fix, refactor, or migration; when asked "how
  should we approach building X"; when tempted to jump straight to code; or when
  work shipped without tests or review and needs the process retrofitted. Each
  stage defers to a dedicated skill where one exists (research-first, deep-plan,
  parallel-build, adr). Skip stages only deliberately and say so - a typo
  fix does not need the pipeline, a new feature does.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  depends: research-first, deep-plan, adr
---

# Development workflow

Code is the *fourth* step of building software, not the first. The pipeline
exists because each stage is cheaper than discovering its absence later: a
library found in research saves the feature, a plan catches the collision before
four agents hit it, a failing test proves the test can fail, a review catches
what the author cannot see, and a commit that says *why* saves the archaeology.

```
0 research  →  1 plan  →  2 test-first  →  3 implement  →  4 review  →  5 commit
```

Stages defer to dedicated skills where they exist. This skill is the spine that
keeps them in order.

## 0. Research and reuse — before any new implementation

Run the `research-first` sweep: registries for the ecosystem, GitHub for prior
art, the codebase for something that already does it. **Prefer adopting or
porting a proven implementation when it covers ~80% or more of the need** — name
the gap, present the choice. Building is the fallback, not the default.

Two-source discipline applies to everything the design rests on: versions,
behaviors, "we can't use X because…" claims.

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

## 4. Review — before merging

Every non-trivial change gets reviewed by eyes that didn't write it: a fresh
subagent, a platform reviewer, or the `parallel-build` phase-3 pattern
(CR.md, plus a security pass for code that will ship). Triage findings by
severity: **CRITICAL and HIGH get fixed before merging**, MEDIUM when feasible,
LOW is backlog. Re-run the critical-path tests after fixes — a reviewer's DONE
is a claim, not evidence.

## 5. Commit and record

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
| `wip` / `fixes` commit messages | The why evaporates exactly when it matters |
| Silently skipping a stage | A skip is a decision; drift is a bug |
