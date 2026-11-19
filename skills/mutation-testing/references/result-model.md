# Result model

Store engine evidence and human judgment in different objects.

```json
{
  "raw": {
    "engine": "stryker-js",
    "mutantId": "42",
    "status": "Survived",
    "location": "src/calculator.js:8:10",
    "reportSha256": "..."
  },
  "triage": {
    "disposition": "meaningful",
    "behavior": "The display limit includes the exact maximum",
    "rationale": "The public CLI accepts the boundary and no test asserts it",
    "reviewer": "review-agent-id"
  },
  "completion": "actionable-survivor"
}
```

## Allowed triage dispositions

- `meaningful` — reachable behavior; add a public assertion.
- `equivalent` — no observable distinction under the contract; requires a
  reachability argument and reviewer confirmation.
- `unreachable` — dead or excluded path; requires code evidence and should
  usually return to implementation for cleanup.
- `invalid-mutant` — engine output cannot compile or represent a valid program;
  retain the engine's original status.
- `returned-to-implementation` — reveals a production defect or requirement
  ambiguity rather than a missing test.

## Completion

A scoped run is complete only when every selected mutant ran and every raw
survivor has an evidenced disposition. `NoCoverage`, timeouts, harness failures,
compile errors without evidence, skipped mutants, and budget exhaustion keep the
run incomplete. “No actionable survivors” means nothing meaningful remains
unaddressed; it does not mean the raw report was rewritten to 100%.
