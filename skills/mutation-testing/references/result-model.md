# Result model

Store native evidence, engine meaning, human triage, and workflow decision in
separate fields.

```json
{
  "raw": {
    "engine": "stryker-js",
    "mutantId": "42",
    "status": "Survived",
    "location": "src/calculator.js:8:10",
    "reportSha256": "..."
  },
  "nativeMeaning": "undetected",
  "triage": {
    "disposition": "meaningful",
    "behavior": "The public limit includes its exact boundary",
    "rationale": "No existing test observes the exact limit",
    "reviewer": "review-agent-id"
  },
  "workflowDecision": "actionable-survivor",
  "blocksCompletion": true
}
```

## Triage dispositions

- `meaningful` — reachable public behavior needs a stronger test.
- `equivalent` — no observable difference under the contract; requires a
  reachability rationale and independent reviewer.
- `unreachable` — excluded/dead behavior; requires code evidence and usually
  returns to implementation for cleanup.
- `invalid-mutant` — supports an engine-native excluded result; raw label stays.
- `returned-to-implementation` — production defect or ambiguous requirement.

## Effects

- `verified`, `equivalent`, `resolved`: do not block completion; report counts.
- `actionable-survivor`: blocks completion and goes to test remediation or
  implementation.
- `returned-to-implementation`: blocks this stage until the production decision
  is handled.
- `incomplete`: stop for the user's decision and do not claim/commit a complete
  mutation stage.

No score, waiver, or triage label changes the raw engine artifact.
