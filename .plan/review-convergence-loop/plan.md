# Plan: review-convergence-loop

**Status:** executing
**Created:** 2026-11-21   **Base branch:** `origin/main` (`40196914`)

## Goal

Make `development-workflow` require review convergence instead of a single
one-shot review. Completion must be objectively blocked until at least two
fresh full-diff review passes have run, review-driven production changes have
been re-reviewed, blocking findings are resolved, and tests are green. The
observable signal is a deterministic contract test plus the repository suite,
validator, package audit, and PR CI all passing.

## Out of scope

- Building a review orchestration runtime or GitHub Action.
- Making mutation testing mandatory or changing its isolation protocol.
- Changing review rules in unrelated skills.
- Merging the PR; the user will review it personally.

## Background

The current skill at `40196914` requires independent review and rerunning
critical paths, but it does not say that a review-driven code change invalidates
the prior approval. README stage 5 mirrors that one-pass model. The existing
root runner auto-discovers `*.test.mjs` below `skills/`, and validation checks
skill eval schemas and release metadata. No `.adr/` or `.memory/` records exist
in this checkout. Baseline: 112 root tests pass and all 27 skills plus 2 agents
validate.

The user approved this contract before execution: two review passes minimum,
fresh full-diff review after accepted production fixes, clean tests and no
unresolved CRITICAL/HIGH findings at exit, explicit MEDIUM/LOW disposition, and
a bounded stop after four unsuccessful passes.

## Approach

Add the policy as a named convergence gate inside stage 5, with explicit inputs,
loop transitions, exit criteria, and a four-pass cap. Mirror the contract in the
README's Mermaid graph, stage explanation, and registry summary. Add deterministic
text-contract tests before implementation and two behavioral eval scenarios so
future edits cannot silently weaken either the normal re-review path or the
bounded-failure path.

The change is sequential because the skill, README, tests, evals, and release
metadata describe one shared contract and must stay synchronized.

## Architecture

The workflow remains documentation-driven. One policy source (`SKILL.md`)
defines a review pass as fresh eyes reviewing the complete cumulative diff
against acceptance criteria and prior findings. A pass that produces an
accepted production change loops through tests and invalidates approval. The
gate opens only after two passes minimum and the latest pass plus test state meet
all exit criteria. Pass four is a fail-closed escalation boundary, never an
implicit approval.

The README is a human-facing projection of that contract. The executable test
asserts the non-negotiable invariants in both surfaces, while eval cases probe
agent behavior for a first-pass fix and a fourth-pass unresolved finding.

## File map

| Path | Change | Phase | Owner |
|---|---|---|---|
| `.plan/review-convergence-loop/plan.md` | new — execution rationale and proof | 1 | root |
| `skills/development-workflow/tests/review-convergence.test.mjs` | new — deterministic policy regressions | 1 | root |
| `skills/development-workflow/SKILL.md` | define the bounded convergence loop | 2 | root |
| `skills/development-workflow/evals/evals.json` | add fix/re-review and cap scenarios | 2 | root |
| `README.md` | update graph, stage 5, and skill summary | 2 | root |
| `assets/readme/workflow-scale-light.svg` | align the light stage matrix with the pass minimum | 2 | root |
| `assets/readme/workflow-scale-dark.svg` | align the dark stage matrix with the pass minimum | 2 | root |
| `CHANGELOG.md` | document release behavior | 3 | root |
| `package.json` | patch version bump | 3 | root |
| `package-lock.json` | synchronize root release metadata | 3 | root |

## Shared surface (phase 1 owns all of it)

The new test is the shared acceptance surface. It names policy invariants before
the prose changes and is automatically discovered by the existing root runner.
No dependencies, APIs, schemas, or runtime configuration change.

## Phases

### Phase 1 — contract first

Add the deterministic review-convergence test and observe it fail against the
current one-pass wording.

### Phase 2 — policy and documentation

Implement the bounded loop in `SKILL.md`, add discriminating eval cases, and
make all three relevant README views match it.

### Phase 3 — release, review, and PR

Synchronize patch-release metadata, run targeted and full verification, review
the cumulative diff twice with fresh context, push the branch, open a PR, and
wait for its checks. Do not merge.

## Test strategy

### Critical-path tests

```bash
node --test skills/development-workflow/tests/review-convergence.test.mjs
npm test
npm run validate
npm pack --dry-run --json
npx --yes node@18 --test skills/development-workflow/tests/review-convergence.test.mjs
npx --yes node@22 --test skills/development-workflow/tests/review-convergence.test.mjs
git diff --check origin/main...HEAD
```

PR CI must also finish green before handoff.

### Edge cases

| Case | Axis | Status |
|---|---|---|
| First pass is clean | cardinality | covered — still requires a second pass |
| First pass finds a defect and its fix is incomplete | state transition | covered — accepted production change invalidates approval and loops |
| Documentation-only edits after review | boundary | covered — only review-driven production changes mandate another pass |
| Latest pass has unresolved CRITICAL/HIGH | failure | covered — gate stays closed |
| MEDIUM/LOW findings remain | absence/disposition | covered — each needs an explicit disposition |
| Pass four still cannot converge | boundary/failure | covered — stop and escalate as incomplete |
| No subagent is available | dependency absence | covered by existing fresh-context fallback, retained |
| Concurrent reviewers | concurrency | out of scope — passes may be parallel internally, but convergence is evaluated sequentially |
| Very large diffs | scale | out of scope — the same full cumulative-diff contract applies |

### Coverage

Deterministic Node tests cover the contract shape in `SKILL.md`, README parity,
and eval presence. Skill eval cases cover agent decisions for the normal loop
and fail-closed cap. The root suite covers discovery and cross-skill regressions;
validation covers syntax, schemas, docs registration, and release metadata.

## Definition of done

- Stage 5 explicitly requires two or more fresh full-cumulative-diff passes.
- Review-driven production fixes rerun tests and force another pass.
- Exit requires no unresolved CRITICAL/HIGH findings, green named tests, and an
  explicit disposition for every MEDIUM/LOW finding.
- Four unsuccessful passes stop with an incomplete escalation, not approval.
- README graph, stage prose, and skill registry summary match the contract.
- Targeted tests, full tests, Node 18/22 runs, validation, package audit, diff
  checks, and PR CI pass.
- The branch is pushed and a review-only PR is open; it is not merged.

## Risks and unknowns

- Natural-language drift between skill and README -> pin shared invariants with
  deterministic tests and behavioral evals.
- “Four unsuccessful rounds” could be read as four extra loops -> define the
  fourth total pass as the hard boundary, matching the approved bounded intent.
- Automated eval execution needs configured candidate/judge commands -> validate
  the eval schema locally and rely on deterministic regressions for the merge gate.

## Decisions

No ADR: this is a reversible workflow-policy refinement, not a hard-to-reverse
architecture decision.

## Amendments

- 2026-11-21 — Replaced local full-suite `npx node@18/22` probes with targeted
  boundary tests. Running the whole npm-driven suite from inside `npx node`
  rewrites `npm_execpath` to the outer `npx-cli.js`, so package tests invoke
  `npx pack` instead of `npm pack`; 115/117 tests passed under the raw Node 18
  probe and the failures were limited to that synthetic launcher mismatch. The
  real GitHub Actions OS/Node matrix remains the authoritative full boundary
  run and must pass before handoff.
- 2026-11-21 — Review pass 2 found the prose/table boundary and light/dark scale
  illustrations could imply one-pass review. Added the two scale assets to the
  file map, made non-trivial/risk-bearing small bugs explicit, and pinned the
  two-pass labels in the deterministic contract test.
