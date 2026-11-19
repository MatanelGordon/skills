# Chairman verdict

Read this reference after deliberation is complete. The orchestrator is the chairman; never spawn a chairman.

De-anonymize with the mapping persisted before prompt construction. If round 2 was skipped, use the recorded round-one mapping. Tally votes when positions map to brief options, then apply credibility and correlated-agreement rules. A credible minority may win, but the verdict must say why. Never smooth dissent into false consensus.

## Output template

```text
COUNCIL VERDICT

VOTE TALLY:
- option letter: count

WHERE THE COUNCIL AGREES:
- State the agreement.
- State whether its supporting reasons are distinct and charter-specific, or
  correlated and therefore counted as one voice.

PREMISE CHALLENGES (VERBATIM):
- Copy every non-NONE PREMISE CHALLENGE verbatim with its de-anonymized
  persona name.
- If every PREMISE CHALLENGE is NONE, write NONE.

WHERE IT CLASHES:
- Preserve each material dissent verbatim with its de-anonymized persona name.
- Do not soften dissent into consensus.

RECOMMENDATION:
- Name the selected option and why.
- State when the recommendation leans only on estimate-tagged numbers.
- If siding with a minority, say why that minority is more credible.

REVISIT TRIGGERS:
- Aggregate the specific observable WOULD CHANGE MY MIND falsifiers.

FIRST CONCRETE STEP:
- Name one action that tests or begins the recommendation.
```

## Mechanical rules

1. Bucket `CONFIDENCE` as high for 4/5 or 5/5 and low for 1/5, 2/5, or 3/5. Never weight votes by the number. Confidence's only other mechanical use is convergence.
2. Treat a missing, non-observable, or “nothing would change my mind” variant in `WOULD CHANGE MY MIND` as low credibility regardless of confidence. The falsifier is the credibility signal.
3. Missing `CONFIDENCE` does not make a response unusable, but it cannot enter the high bucket.
4. Members agreeing for the same reason count as one voice. State whether agreement used distinct charter-specific reasons or one correlated reason.
5. Surface every non-`NONE` `PREMISE CHALLENGE` verbatim. A vote tally never overrides a premise challenge.
6. Treat every untagged number in an `ARGUMENT` as an estimate. `(code-read: path or symbol)` is valid only for an exact value represented directly in code or configuration; inference remains `(estimate)`. `(measured: source)` requires the measurement source. Missing evidence never establishes zero or a baseline.
7. State when the recommendation relies only on estimate-tagged or untagged numbers.
8. Preserve every material dissent verbatim with the de-anonymized persona name.

The helper audits numeric tags and vote validity. Whether arguments share one underlying reason, whether a falsifier is genuinely observable, and which position is most credible remain chairman judgments that must be explained.
