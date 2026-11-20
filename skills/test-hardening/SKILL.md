---
name: test-hardening
description: >
  Add focused post-implementation tests for observable edge cases revealed by
  the final code and diff. Use after executable behavior is green, when asked to
  harden tests, or when development-workflow reaches its default hardening
  stage. Changes tests and fixtures only and stops at explicit value limits.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Test hardening

TDD proves behavior planned before implementation. Test hardening asks what
failure windows the finished implementation created and whether public behavior
already proves them.

## Entry contract

Inspect the acceptance criteria, final diff, plan edge cases/amendments, existing
tests/fixtures, and test commands. If any input is absent, name it instead of
inventing work already performed. Start only after the relevant baseline is
green.

Prefer fresh eyes. On a host without subagents, reset or summarize context and
run sequentially; state that the pass was not independent. A worker follows this
procedure directly and does not dispatch another copy of itself.

## Procedure

1. **Baseline.** Run the narrow relevant tests. Stop on failure.
2. **Behavior map.** Trace changed public behavior, boundaries, state
   transitions, errors, and integration seams. Read only the applicable lenses
   in [edge-case-lenses.md](references/edge-case-lenses.md).
3. **Existing proof.** Map each risk to a behavioral test or mark it unproved.
   Executing a line is not proof.
4. **Select value.** Add at most one focused test per changed public behavior
   per applicable lens. Each must name the distinct externally visible failure
   or small fault it detects.
5. **Edit tests/fixtures only.** Do not edit production, dependencies, runner
   configuration, unrelated snapshots, or generated files.
6. **Prove the addition.** Run it green on the correct implementation. For a
   red proof, use a scratch copy/worktree or the known pre-fix commit, introduce
   only the named fault there, observe failure, then discard it. Never hand-
   mutate the feature checkout. Hash/check the production diff before and after.
7. **Finish.** Run the full relevant suite and report additions, omissions, and
   residual risk.

Stop when every applicable risk is covered, deliberately omitted with a reason,
or returned as a production defect. Do not keep generating tests for coverage.

## Production defects

Write the smallest failing public regression and return it to the implementer;
do not fix production in this role. After the fix, rerun the regression and only
the hardening risks affected by the changed implementation.

Rust repositories that keep `#[cfg(test)]` modules inside `src/*.rs` cannot add
those tests while satisfying this skill's path-level test-only boundary. Report
that limitation and ask the ordinary implementation/review workflow to add the
in-file test; do not pretend the production file stayed byte-identical.

## Quality rules

- Assert public results, visible state, documented errors, durable side effects,
  or protocol messages—not private helpers or incidental call order.
- Keep one behavioral reason per test; parameterize real boundary families.
- Use deterministic clocks, seeds, fixtures, ports, and resources.
- Prefer semantic assertions to broad snapshots.
- A test that cannot name its distinct failure is not added.

## Output

```text
BASELINE: command and result
BEHAVIOR MAP: behavior → lens → existing proof or gap
ADDED: test path → observable failure
PROOF: scratch/pre-fix red evidence → clean green evidence
PRODUCTION HASH/DIFF CHECK:
PRODUCTION BUGS: failing handoffs, if any
OMITTED: case → reason → residual risk
FINAL: relevant suite command and result
```

## Do not use

- During initial red-green TDD.
- For documentation-only or non-executable changes.
- As a substitute for independent review.
- To chase a coverage percentage without a named behavioral risk.
- To repair mutation survivors; use opt-in `mutation-testing` after a freeze.

