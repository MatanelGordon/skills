---
name: test-hardening
description: >
  Add post-implementation tests for observable edge cases revealed by the final
  code and diff. Use after a feature or refactor is green, when explicitly asked
  to harden tests, or when development-workflow reaches its hardening stage.
  Changes tests and fixtures only; it is not ordinary TDD, code review, mutation
  testing, or a request to fix production code.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Test hardening

TDD proves the behavior planned before implementation. Test hardening asks a
different question afterward: **what new failure windows did this implementation
create?** A fresh subagent studies the final code without inheriting the
implementer's assumptions, then adds only tests and fixtures for observable
behavior that the existing suite misses.

## Entry contract

Collect before starting:

- acceptance criteria and public contracts;
- the final implementation diff against its merge base;
- the plan's edge-case table and amendments;
- existing tests, fixtures, and test commands.

If any input is unavailable, name it. Do not reconstruct intent from code alone.
For non-trivial workflow work, run this as a fresh subagent after implementation
is green and before the frozen mutation/review checkpoint.

## Procedure

1. **Establish the baseline.** Run the narrow relevant tests. Stop if they are
   not green; hardening must not disguise an existing failure.
2. **Map new behavior.** Trace changed public behavior, branches, state
   transitions, error paths, boundaries, and integration seams. Read
   [edge-case-lenses.md](references/edge-case-lenses.md) for the applicable
   lenses only.
3. **Inventory existing proof.** Map each plausible failure to an existing test
   or mark it unproved. Do not count a test merely because it executes the line.
4. **Select high-value cases.** A proposed test must name either a new observable
   contract or a plausible small mutant it would kill. Reject decorative cases.
5. **Edit tests or fixtures only.** Do not change production code, dependency
   files, test-runner configuration, snapshots unrelated to the behavior, or
   generated artifacts.
6. **Prove each addition.** For a regression, demonstrate the test fails for the
   identified defect or mutant and passes on correct production code. For a
   contract test that already passes, explain the distinct failure it guards.
7. **Run the full relevant suite.** Report additions, omissions, and remaining
   uncertainty. When the workflow or user authorizes commits, return a green
   test-only commit; otherwise return the test-only diff and evidence.

## Production defects

If inspection exposes a real production bug:

1. write the smallest failing public-behavior regression test;
2. do not fix production code in this role;
3. return the failing test and evidence to the implementer;
4. after the fix, rerun the regression and relevant suite;
5. repeat hardening only for implementation paths changed by the fix.

A red handoff is a valid hardening result. Quietly repairing production code is
not.

## Test quality rules

- Assert public results, externally visible state, documented errors, durable
  side effects, or protocol messages—not private helpers or call order.
- Prefer the narrowest test level that proves the contract. Use integration or
  end-to-end tests when the risk lives at a seam.
- Keep one behavioral reason per test. Parameterize genuine boundary families.
- Use deterministic clocks, seeds, fixtures, and resources.
- Avoid broad snapshots when a semantic assertion is available.
- A test that cannot name the failure it guards is not added.

## Output

Return:

```text
BASELINE: command and result
BEHAVIOR MAP: changed public behaviors and uncovered risks
ADDED: test path → observable contract or named mutant
PROOF: failure evidence → green evidence
PRODUCTION BUGS: failing handoffs, if any
OMITTED: case, reason, and residual risk
FINAL: relevant suite command and result
```

The production diff before and after this stage must be byte-identical.

## Do not use

- During initial red-green TDD; write the planned behavior test there.
- For a typo, documentation-only edit, or other change with no executable
  behavior.
- As a substitute for independent code review.
- To chase a coverage percentage without a concrete behavioral risk.
- To repair surviving mutants; use `mutation-testing` after the green freeze.
