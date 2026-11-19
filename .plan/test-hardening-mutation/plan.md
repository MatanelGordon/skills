# Plan: test-hardening and mutation-testing

**Status:** active
**Created:** 2026-11-20
**Base branch:** `sa/test-hardening-mutation` from `origin/main`

## Goal

Add two independently invokable, agent-neutral skills and place them in the
development workflow in their correct order:

```text
research → plan → TDD → implement → test-hardening → freeze green head
                                              ├─ review
                                              └─ mutation discovery
                                     → test-only remediation → verify → commit
```

`test-hardening` inspects the completed implementation for observable edge
cases and writes tests or fixtures only. `mutation-testing` runs native
language tools in a disposable worktree, preserves raw engine truth, and may
return only reviewed test-only commits through a fail-closed import guard.

Success means the repository validates, deterministic protocol tests pass, a
real calculator CLI demonstrates both skills in workflow order, the JavaScript
mutation smoke kills a previously surviving mutant without changing production
code, and a detailed pull request is open without merging `main`.

## Constraints

- Never inspect, modify, package, or delete `skills/rank-workspace`.
- Work only in this isolated worktree; do not merge it into `main`.
- Keep `development-workflow` as the sole top-level router.
- Add no executable PSTACK dependency and vendor no external skill.
- Support Python, C#, Rust, Go, and JavaScript/TypeScript adapters.
- Mutation worktrees are created and discarded, never merged.
- A conflicted test-only cherry-pick is aborted and replayed; it is never
  hand-resolved.
- A run that exhausts its time or mutant budget is `incomplete`, never passed.

## Decision gates already passed

An independent critic required review-clearance semantics, native-engine
concurrency first, strict test-only imports, objective survivor taxonomy,
compatible pinned tools, resource isolation, negative routing evals, and
behavior-cluster ownership. It approved implementation after two final fixes:
the live fixture must exercise test hardening before mutation discovery, and
conflicted cherry-picks must be aborted and replayed.

A six-member Council unanimously selected native skills over selected external
leaves or a PSTACK-centered router. Its Devil's Advocate identified semantic
drift as the material objection. The second round retained the native design
but requires exact upstream provenance, a mapping from every borrowed idea to
the local invariant it influenced, and an explicit upstream re-review signal.

## Architecture

### Test hardening

A fresh subagent receives the acceptance criteria, final implementation diff,
plan edge cases, and existing tests. It may change only tests and fixtures. It
checks public behavior, new branches, boundaries, invariants and state
transitions, failures, retries, concurrency, ordering, serialization,
persistence, and integration seams. A discovered production bug is returned as
a failing test to the implementer; the hardener never fixes production code.

### Mutation testing

One coordinator detects the ecosystem, derives changed production scope from
the merge-base diff, selects a compatible pinned native engine, runs a clean
baseline, and records a normalized report. Native engine workers are the first
concurrency layer. Additional agent lanes are allowed only for independent
projects or behavior-cluster remediation when their estimated saving exceeds
duplicated setup.

Review and mutation discovery start from the same frozen green commit.
Remediation waits until review explicitly clears the relevant observable
contract and production paths. Any later change to those paths, their
dependencies, or acceptance criteria invalidates the affected mutation result.

Raw engine status is immutable. Human triage is a separate field. Reachable
changed behavior with a meaningful public assertion must be killed or returned
to implementation. No-coverage is a gap. Timeout, compile error, harness error,
and budget exhaustion are unverified. Equivalent or unreachable claims require
written evidence and reviewer confirmation.

### Test-only integration

The mutation branch itself is never merged. Candidate commits must pass a
repository-specific test/fixture path allowlist, reject symlinks and generated
or dependency metadata, and prove every nonallowed path byte-matches the
approved base. Accepted commits are cherry-picked into the reviewed target.
Any conflict aborts the cherry-pick; the test change is regenerated or replayed
on the reviewed head. The complete Git-backed guard, clean tests, and targeted
mutant proof run again after integration (exact when supported, otherwise the
narrowest reproducible location/type scope).

## File map

| Path | Purpose |
|---|---|
| `.plan/test-hardening-mutation/plan.md` | Zero-context implementation and verification record |
| `.adr/0001-native-post-implementation-testing.md` | Durable architecture decision and rejected alternatives |
| `skills/test-hardening/SKILL.md` | Post-implementation, test-only behavioral hardening contract |
| `skills/test-hardening/references/edge-case-lenses.md` | Conditional edge-case lenses |
| `skills/test-hardening/evals/evals.json` | Positive and collision-negative routing cases |
| `skills/mutation-testing/SKILL.md` | Coordinator workflow, gates, isolation, and completion contract |
| `skills/mutation-testing/references/adapter-contract.md` | Shared adapter inputs, outputs, versioning, and scope rules |
| `skills/mutation-testing/references/result-model.md` | Raw engine result plus separate reviewed triage schema |
| `skills/mutation-testing/references/import-guard.md` | Test-only replay/cherry-pick rules |
| `skills/mutation-testing/references/adapters/*.md` | Five native engine adapters |
| `skills/mutation-testing/references/provenance.json` | PSTACK source revisions and local invariant mapping |
| `skills/mutation-testing/scripts/mutation-protocol.mjs` | Deterministic detection, lane planning, normalization, import and provenance gates |
| `skills/mutation-testing/tests/mutation-protocol.test.mjs` | Fast protocol and failure-path coverage |
| `skills/mutation-testing/tests/fixtures/calculator-cli/` | Repeatable staged calculator proof |
| `skills/mutation-testing/tests/run-calculator-smoke.mjs` | Real Vitest/Stryker workflow smoke |
| `skills/mutation-testing/evals/evals.json` | Standalone/workflow routing and safety behavior cases |
| `skills/development-workflow/{SKILL.md,evals/evals.json}` | New stage order, invalidation, and join gate |
| `README.md`, `assets/readme/*.svg` | Public workflow, registry, counts, and light/dark diagrams |
| `.github/workflows/validate.yml` | Node 22 calculator mutation smoke job |
| `package.json`, `package-lock.json`, `CHANGELOG.md` | Test commands and 1.22.0 feature release metadata |

## Phases

1. **Plan and record.** Commit this plan and ADR in the feature branch.
2. **Test first.** Add failing protocol tests for adapter detection, lane choice,
   result preservation, import rejection, provenance validation, budget state,
   and conflict policy.
3. **Protocol foundation.** Implement the dependency-free helper until the
   fast tests pass on Node 18.
4. **Skills and adapters.** Add concise skill entrypoints, progressive
   references, evals, and the five documented native adapters.
5. **Workflow integration.** Add test hardening, frozen-head fan-out,
   review-clearance remediation, invalidation, import replay, and final join.
6. **Executable smoke.** Exercise two independent calculator weaknesses in
   order: test hardening adds the first edge test; after the green freeze,
   mutation testing finds a different survivor and remediation adds the second
   test that kills it.
7. **Docs and release.** Update README copy, both diagram themes, skill counts,
   CI, version metadata, and changelog.
8. **Independent review.** Run fresh code/skill review and forward behavioral
   tests. Fix every critical/high and feasible medium finding.
9. **Delivery.** Push the feature branch and open a detailed pull request. Do
   not merge it.

## Test strategy

### Fast gates

```bash
node --test skills/mutation-testing/tests/mutation-protocol.test.mjs
npm test
npm run validate
npm pack --dry-run --json
git diff --check
```

### Calculator smoke

The staged CLI has two independent weaknesses:

1. Test hardening adds a public division-by-zero contract test and leaves
   production code unchanged.
2. After a green checkpoint, StrykerJS mutates an exact display-limit boundary.
   The original suite lets the mutant survive; mutation remediation adds the
   boundary test; the same mutant is then killed.

The smoke checks production source hashes before and after both Stryker runs,
uses Vitest through the official Stryker runner, and reads the machine JSON
report rather than console prose.

```bash
npm run test:mutation-smoke
```

### Edge cases

| Case | Expected result |
|---|---|
| multiple supported manifests | explicit ambiguity; no guessed adapter |
| TUnit or xUnit v3 | select preview MTP and surface the caveat |
| small single-project diff | one coordinator and native workers only |
| three independent projects with real predicted saving | at most three lanes |
| overlapping behavior clusters or test fixtures | merge ownership or serialize |
| report changes `Survived` to human `Equivalent` | raw status stays `Survived`; triage is separate |
| timeout, harness failure, or budget exhaustion | `incomplete`, not passed |
| production/config/lockfile/symlink in candidate commit | import rejected |
| cherry-pick conflict | abort and replay; no hand resolution |
| review changes a mutant's path, dependency, or contract | targeted result invalidated and rerun |
| upstream PSTACK source hash changes | provenance check requests re-review; runtime remains local |

## Definition of done

- Both new skills are independently invokable and correctly routed from
  `development-workflow`.
- Descriptions remain concise and collision-resistant.
- All five adapters document current official commands, scope, output, limits,
  and compatible version selection.
- The mutation helper passes critical and failure-path tests on Node 18.
- The Node 22 calculator smoke proves the exact stage order and preserves
  production bytes.
- README and both theme diagrams describe the new pipeline and 27-skill count.
- Release metadata is consistently 1.22.0.
- A fresh reviewer reports no unresolved critical/high findings.
- The branch is pushed and a detailed pull request is open; `main` and
  `skills/rank-workspace` remain untouched.

## Amendments

- 2026-11-20 — Council selected native skills with versioned PSTACK design
  evidence, not an executable dependency.
- 2026-11-20 — The independent critic required two distinct calculator
  weaknesses so the smoke preserves stage order.
- 2026-11-20 — Any conflicted mutation test cherry-pick must be aborted and
  replayed against the reviewed head.
