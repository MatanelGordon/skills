---
name: mutation-testing
description: >
  Measure whether tests catch small production-code faults, then strengthen
  tests for meaningful survivors in a disposable worktree. Use after a green
  implementation is frozen, when explicitly asked for mutation testing, or
  when development-workflow starts mutation discovery beside review. Never
  merge mutated code; only guarded test and fixture changes may return.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  depends: test-hardening
---

# Mutation testing

Mutation testing deliberately introduces small faults—reversed conditions,
changed boundaries, removed calls—and asks whether the existing tests fail.
Native engines create and restore those mutations. This skill supplies the
portable protocol around them: scope, isolation, evidence, remediation, and a
fail-closed path for returning tests without returning mutated code.

## Preconditions

Dispatch a fresh `mutation-testing` subagent so it does not inherit the
implementer's assumptions. Start only when all are true:

- initial TDD and post-implementation `test-hardening` are complete;
- the relevant suite is green at a named frozen commit;
- the production diff and acceptance criteria are available;
- the repository permits a disposable worktree;
- a compatible native engine can be selected explicitly.

Read [adapter-contract.md](references/adapter-contract.md), then only the
language adapter matching the selected project. Multiple ecosystems require an
explicit project scope; do not guess.

## Protocol

### 1. Freeze and isolate

Record the reviewed base, frozen green commit, merge base, changed production
paths, test command, production hashes, time budget, and mutant budget. Create a
new disposable branch and worktree from the frozen commit. Mutation worktrees
are **never merged**.

### 2. Establish the baseline

Run the clean relevant suite inside the disposable worktree. Stop on failure.
Detect fixed ports, databases, shared files, global caches, clocks, or external
services that could make parallel workers lie; isolate them or serialize.

### 3. Scope changed behavior

Derive candidate production files or lines from the merge-base diff, then
include dependencies only when the engine or behavior requires them. Mutation
scope and test scope are distinct: mutate changed behavior, but run every test
the engine proves covers it. Do not infer scope from the branch name.

### 4. Run discovery beside review

Code review and mutation discovery may start in parallel from the same frozen
commit. Discovery may report evidence, but **test remediation waits for explicit
review clearance of the affected contract and production paths**. If review
changes those paths, their dependencies, or acceptance criteria, mark affected
results stale and rerun them.

Use the native engine's workers first. Extra subagent lanes are allowed only
for disjoint projects or behavior clusters, with disjoint test/fixture ownership
and predicted wall-clock savings after duplicated setup. Use at most three.

### 5. Preserve engine truth

Keep the raw machine report unchanged. Normalize without rewriting statuses;
record human triage separately using [result-model.md](references/result-model.md).
A raw survivor does not become “killed” or “equivalent” because a person labels
it. Never overwrite the raw artifact.

### 6. Remediate tests only

For each review-cleared, meaningful survivor:

1. restore clean production code;
2. name the public behavior the mutant violates;
3. add or strengthen a test or fixture only;
4. prove the test passes on clean code;
5. run the targeted mutant proof: the exact mutant when the engine supports it,
   otherwise the narrowest reproducible location/type scope, and prove the same
   fault no longer survives;
6. commit only the test/fixture change.

If a survivor reveals a production defect or ambiguous requirement, return it
to implementation or product clarification. Do not change production code in
the mutation role.

Before import, a fresh reviewer must approve the test-only candidate: the public
assertion is meaningful, the fixture is deterministic, and no production,
configuration, dependency, or generated change is hidden in the diff.

### 7. Return through the guard

Follow [import-guard.md](references/import-guard.md). The mutation branch stays
disposable. Test-only commits may be replayed or cherry-picked only after path,
file-type, byte-equality, clean-test, and targeted-mutant checks. Any conflict is an
abort: regenerate or replay on the reviewed head; never hand-resolve it.

### 8. Join and finish

After review fixes and accepted test remediations are integrated, rerun:

- the import guard on the integrated target;
- the clean relevant and repository suites;
- every targeted mutant proof affected by review;
- one combined scoped mutation run.

Finish at **no actionable survivors**, not a vanity 100% score. Reachable
changed behavior with a meaningful public assertion must be killed or returned
to implementation. No-coverage, timeouts, compile/harness errors, or exhausted
budgets mean incomplete evidence—not a waiver or pass.

## Report

```text
FROZEN HEAD / MERGE BASE:
ADAPTER / ENGINE / VERSION:
MUTATION SCOPE / TEST SCOPE:
BASELINE:
RAW REPORT PATH + HASH:
STATUS COUNTS:
TRIAGE: mutant → disposition → evidence → reviewer
REMEDIATION: reviewed test-only commit → clean proof → targeted-mutant proof
STALE/RERUN RESULTS:
IMPORT GUARD:
BUDGET: used / remaining / exhausted
FINAL: complete | incomplete | returned-to-implementation
```

## Safety invariants

- Never merge a mutation worktree or commit mutated production code.
- Never edit production, runner configuration, dependency metadata, or lockfiles
  during remediation.
- Never share an owned test or fixture path across parallel lanes.
- Never call equivalent without written reachability evidence and reviewer
  confirmation.
- Never count a timeout, no-coverage mutant, harness failure, or unrun mutant as
  success.
- Never trust a clean-code test alone; prove the selected mutant goes red, using
  the exact mutant when supported or the narrowest reproducible location/type
  scope otherwise.

## Supporting resources

- [adapter-contract.md](references/adapter-contract.md) — common adapter rules
- [result-model.md](references/result-model.md) — immutable raw status and triage
- [import-guard.md](references/import-guard.md) — test-only integration
- [provenance.json](references/provenance.json) — versioned design evidence
- `scripts/mutation-protocol.mjs` — deterministic protocol gates
