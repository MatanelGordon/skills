# How we check work in this repo

- Each piece of work has a `GATES.md`: one checkbox per outcome, with a `CHECK:` command under it.
- `scripts/run-gates.sh` re-runs every CHECK and prints PASS or FAIL for each gate. It exits non-zero if any check fails. It only reads `GATES.md`; it never changes it.
- After a check passes, whoever ran it ticks the box by hand and adds an `EVIDENCE:` line with the date and what they saw.
- Several coding agents work on this repo at once, sometimes more than one in the same checkout.
- CI is GitHub Actions (`.github/workflows/ci.yml`). Today it runs the unit tests and nothing else.

An entry looks like this:

```md
- [x] Re-importing the same file adds no rows
      CHECK: ./scripts/verify-idempotent.sh fixtures/orders.csv
      EVIDENCE: 2026-11-12, exit 0, 0 duplicate rows on the second run
- [ ] No debug logging reaches the bundle
      CHECK: ! grep -rn "console.debug" src/
```
