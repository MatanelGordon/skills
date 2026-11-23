---
name: mutation-testing
description: >
  Use for explicit, bounded mutation testing with a native engine when the user names a
  module or behavior, an existing engine makes a scoped run cheap, or a plan marks
  changed decision logic critical. Opt-in after a green baseline; preserve raw results
  and allow reviewed test-only changes.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  depends: test-hardening
  requires: Node >= 18 and git for protocol gates; a compatible native mutation engine for execution
---

# Mutation testing

Mutation testing asks whether tests catch small faults such as reversed
conditions or changed boundaries. Native engines normally mutate sandboxed
copies; this skill controls scope, evidence, remediation, and the boundary that
keeps production changes out of the reviewed branch.

## When to run

Run only when at least one trigger is explicit:

- the user asks for mutation testing and names a module or behavior;
- the project already configures a compatible engine and a scoped run fits the
  agreed time/mutant budget; or
- the plan marks changed security, financial, authorization, concurrency, data
  integrity, or other decision logic as critical and records why mutation
  evidence is worth its cost.

An explicit standalone request may start from a user-named scope after a green
baseline; it does not require a prior `test-hardening` session. In the full
development workflow, start after hardening is green and the commit is frozen.

Do not use for documentation, prototypes, generated code, presentation/UI glue
without decision logic, an unsupported runner, or a suite that cannot be scoped
inside the approved budget. Report the skip and use focused behavioral tests.

## Roles and host capabilities

The orchestrator selects scope, engine, budget, and isolation. A mutation worker
runs the protocol and never dispatches itself.

Prefer a fresh subagent and Git worktree. If the host lacks subagents, reset or
summarize context and run sequentially, naming the loss of independent judgment.
If `git worktree` is unavailable, use a disposable clone/copy and verify source
hashes before and after. With neither safe isolation nor an engine that keeps
mutations out of the working tree, perform report-only analysis or stop; never
apply mutations in the feature checkout.

## Protocol

### 1. Freeze and isolate

Record the frozen green commit, merge base, user-approved mutation scope, clean
test command, production hashes, time budget, and mutant budget.

```bash
git worktree add -b mutation/<topic> <temporary-path> <frozen-commit>
```

Install/configure tools only in the disposable worktree. Read
[adapter-contract.md](references/adapter-contract.md), then one language adapter.

### 2. Baseline and discover

Run the clean relevant suite first; a red baseline makes the run incomplete.
Use the adapter's honest scope: native diff selection where supported, otherwise
an explicit file/function/range that may be broader than the change. Prefer the
engine's workers. Additional lanes are optional and require disjoint projects,
tests, fixtures, resources, and a predicted wall-clock saving.

Review and discovery may overlap from the same frozen commit, but remediation
waits until review clears the affected contract and source paths. Review changes
make those results stale.

### 3. Preserve and classify evidence

Keep the native report unchanged and hash it. Raw status, engine meaning, human
triage, and workflow decision are separate fields. Use the reachable classifier
for a status when needed:

```bash
node <mutation-testing-skill-dir>/scripts/mutation-protocol.mjs classify \
  --engine stryker-js --status NoCoverage --mutant 42 \
  --location src/calculator.js:8 --report-sha256 <sha256>
```

`Timeout` remains native detected evidence and is flagged for a spot check;
`NoCoverage` remains undetected and actionable; compile/unviable outcomes are
excluded; engine `Ignored`/`SKIPPED` results are out of scope. Pending, unrun,
red-baseline, harness-failure, or budget-exhausted work is incomplete. See
[result-model.md](references/result-model.md).

### 4. Remediate tests only

For each review-cleared actionable survivor:

1. restore clean production;
2. name the violated public behavior;
3. add one focused test or fixture;
4. run it on clean code;
5. rerun the exact mutant, or the narrowest supported location/type scope;
6. obtain focused review of the assertion and test-only diff; and
7. commit one direct child of the frozen approved commit.

Equivalent triage does not block completion only when it includes a reachability
rationale and independent reviewer. A production defect or ambiguous contract
returns to implementation. Rust tests embedded in `src/*.rs` cannot cross this
path-based test-only guard; add them in the ordinary reviewed feature workflow
before the freeze, or report the limitation.

### 5. Import by construction

Follow [import-guard.md](references/import-guard.md). Validate the exact approved
commit, current integration target, and one-commit candidate. Import only the
reported paths with `git restore --source=<candidate>`, never candidate history.
Rerun the guard, clean tests, and targeted proof after the imported test is
committed.

### 6. Finish

A scoped run is complete when no actionable survivor remains and no selected
work is incomplete. Equivalent, excluded, and out-of-scope counts stay visible;
they are not rewritten as kills.

`FINAL: incomplete` means: report counts and residual risk, stop for the user's
decision, and do not commit or present the mutation stage as complete. The user
may explicitly accept that residual risk, narrow/rerun the scope, or stop the
optional investigation. Actionable survivors return to remediation or
implementation; they never pass on score alone.

Cleanup after evidence and any test-only import are secured:

```bash
git worktree remove <temporary-path>
git branch -D mutation/<topic>
```

## Report

```text
FROZEN HEAD / MERGE BASE / USER-NAMED SCOPE:
ADAPTER / ENGINE / VERSION:
MUTATION SCOPE / TEST SCOPE / BUDGET:
BASELINE:
RAW REPORT PATH + SHA256:
NATIVE STATUS COUNTS:
WORKFLOW: verified / actionable / equivalent / excluded / out-of-scope / incomplete
TRIAGE: mutant → disposition → rationale → reviewer
REMEDIATION: candidate SHA → clean proof → targeted proof → imported paths
STALE/RERUN RESULTS:
ISOLATION / CLEANUP:
FINAL: complete | incomplete | returned-to-implementation
```

## Safety invariants

- Never merge or replay a mutation branch.
- Never return production, runner configuration, dependency, lock, generated,
  symlink, submodule, or executable changes as mutation remediation.
- Never overwrite native evidence or call an incomplete run complete.
- Never hand-resolve a mutation-candidate conflict; regenerate from the current
  reviewed head.

## Supporting resources

- [adapter-contract.md](references/adapter-contract.md) — shared engine contract
- [result-model.md](references/result-model.md) — raw truth and workflow decisions
- [import-guard.md](references/import-guard.md) — direct-parent test-only import
- `scripts/mutation-protocol.mjs` — reachable classify/import/provenance commands
