---
name: confidence-ranker
description: >
  Build justified confidence before a model answer drives an action. Use when
  asked "are you sure?", "verify this", "can I rely on that?", or whether a
  change, deletion, deployment, purchase, message, or other consequential step
  is safe; when undocumented code or current external facts leave important
  claims uncertain; and via /confidence to audit the previous answer or a
  supplied claim. Isolate the claims that control the action, gather the
  cheapest decisive evidence, rank each claim VERIFIED / CORROBORATED / TRACED
  / INFERRED / UNSUPPORTED, and report whether the action is ready. Do not use
  for routine stable facts, trivia, or subjective preference.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Confidence Ranker

Confidence is not how certain the model sounds. It is how much relevant
evidence supports the claims a person is about to rely on.

The job is to turn **uncertainty into checks**. Find the few claims that decide
whether an action is safe, gather the cheapest decisive evidence allowed by the
request, and say plainly whether the evidence is sufficient to act. Labels are
the summary, not the work.

## Trigger

Use this skill when:

- the user asks "are you sure?", "verify that", "can I rely on this?", "how
  confident are you?", or asks to build confidence before acting;
- an answer will drive a consequential action such as changing or deleting
  code, deploying, spending money, signing, sending, publishing, or choosing a
  hard-to-reverse direction;
- the deciding claims come from undocumented code, partial inspection,
  time-sensitive external information, or model memory;
- the user invokes **`/confidence`** to audit the previous answer, or
  **`/confidence <claim or action>`** to assess something specific.

Do not trigger merely because an answer contains facts. Give routine stable
facts concise sourcing, answer subjective questions as judgments, and skip the
workflow for trivia or cheap reversible choices unless the user explicitly
asks for an audit.

## The confidence loop

### 1. Name the action and its downside

State the action being considered and what a wrong answer could cause. This
sets the evidence threshold. If no action exists, name the conclusion the user
would rely on instead.

Do not invent a larger decision than the user brought. Confidence assessment
does not grant permission to mutate files, deploy, send messages, purchase, or
take any other action outside the request.

### 2. Extract only the action-critical claims

Break the reasoning into claims whose truth could change the action. Separate:

- **observation** — what a tool, test, file, or source directly showed;
- **interpretation** — what that observation means;
- **generalization** — whether it holds beyond the observed case;
- **recommendation** — whether the evidence is enough to act.

Rank these separately. One successful request does not verify every route. A
constant quoted from a file is an observation; why it exists is another claim.
Background facts that cannot change the decision do not need a rank.

### 3. Set the evidence threshold before checking

| Action if wrong | Minimum evidence for a deciding claim |
|---|---|
| Low-impact and easily reversible | INFERRED may be enough when the uncertainty is explicit |
| Meaningful but reversible | TRACED; add a second leg when it is cheap |
| Destructive, external, costly, security-sensitive, or hard to reverse | VERIFIED or CORROBORATED |

These are floors, not permission rules. A high rank says the evidence is ready;
it does not say the action is authorized. When a required rank is impossible,
stop at **NOT READY** and name the missing check rather than lowering the bar.

### 4. Rank the evidence actually held

Use this fixed vocabulary. It describes evidence, not model feeling:

| Rank | Evidence held |
|---|---|
| **VERIFIED** | The exact claim or scenario was directly observed by executing, probing, reproducing, or measuring it |
| **CORROBORATED** | Two independent, relevant evidence legs agree; at least one is primary or direct |
| **TRACED** | One complete primary evidence chain supports the claim, such as a code path including callers or an authoritative source for the exact version |
| **INFERRED** | Partial or indirect evidence supports the claim, but an uninspected step or generalization remains |
| **UNSUPPORTED** | Memory, convention, similarity, confidence of phrasing, or speculation without claim-specific evidence |

Boundary rules:

- **VERIFIED is exact.** Running one scenario verifies that scenario, not an
  "always" or "all" claim built on top of it.
- **Independence is about origin.** Two pages repeating one vendor statement
  are one leg. Two tests exercising the same mocked assumption may be one leg.
- **TRACED must be complete.** Reading a function without callers is INFERRED.
  Reading an unrun test can be TRACED for what the test specifies, not VERIFIED
  for runtime behavior.
- **Documentation is evidence of the documented contract.** It is not direct
  evidence of runtime behavior. Current vendor limits also need a current
  source appropriate to the decision.
- **Model memory is UNSUPPORTED.** Familiarity can choose a check; it cannot
  replace one.
- When evidence conflicts, report the conflict and rank from the weaker
  unresolved leg. Do not average disagreement into false certainty.
- When torn between two ranks, use the lower one.

The claim's wording must match its rank. Below TRACED, write "appears",
"suggests", or another accurate qualifier; a low label does not rescue a flat,
confident assertion.

### 5. Buy confidence with the cheapest decisive check

Improve the weakest action-critical claim first. Prefer, in order:

1. a direct, safe probe of the exact claim;
2. a second independent evidence leg;
3. completing the primary trace or inspecting the missing caller/source;
4. narrowing the claim or the proposed action so existing evidence is enough.

Perform permitted read-only checks instead of merely recommending them when
they are cheap. A search for callers, a targeted test, `--help`, an exact-version
changelog, or a small probe usually costs less than explaining uncertainty.

Every claim below the required threshold gets **one concrete next check**:
"run test X", "inspect registration Y", "check exact-version changelog Z".
"Investigate further" is not a check.

Stop when the threshold is met, the next check needs new authorization, or its
cost outweighs the decision. The goal is justified action, not impossible
certainty.

### 6. Give the action verdict

End an explicit confidence audit with exactly one verdict:

- **READY** — every deciding claim meets the threshold for this action.
- **READY WITH CAVEAT** — the action is reversible and the named residual
  uncertainty is within the stated downside.
- **NOT READY** — at least one deciding claim misses the threshold; name the
  exact blocking check.

Do not convert these ranks into percentages unless a calibrated dataset exists
for this exact class of predictions. "87% confident" without calibration is
decoration.

## Output

For one or two action-critical claims, keep it inline:

> The retry cap is three for the exercised 500-response path
> `[VERIFIED: targeted test]`. Whether reflective consumers bypass the wrapper
> is still unclear `[INFERRED — next: inspect registrations in worker/]`.
>
> **Action confidence: NOT READY** — deleting the wrapper is blocked on the
> reflective-registration check.

For three or more claims, use one compact table:

| Deciding claim | Evidence | Rank | Gap / next check |
|---|---|---|---|
| The wrapper has no static callers | repository reference search | TRACED | inspect dynamic registrations |
| No dynamic consumer uses it | registration file not yet read | INFERRED | inspect `worker/register.ts` |
| The original retry reason is obsolete | no history checked | UNSUPPORTED | `git log -S 'retryWrapper' -- queue/` |

Then give the action verdict in one sentence. Show enough evidence for the user
to audit the rank; do not dump the full investigation transcript.

## Manual `/confidence`

With no argument, audit the previous answer. Extract its action-critical claims
and rank them from evidence actually held when written. Downgrade unsupported
assertions plainly. Run cheap, permitted checks now when they would change the
verdict.

With a claim or action, assess that target only. If the target is ambiguous,
state the narrow interpretation you are ranking. If no claim-specific evidence
exists, start at UNSUPPORTED; do not improvise support from plausibility.

## Boundaries with nearby skills

- `research-first` finds and grades sources; Confidence Ranker decides whether
  that evidence is enough for the proposed action.
- `critical-thinking` compares options; Confidence Ranker tests the factual
  claims that the comparison depends on.
- `get-the-job-done` verifies completion gates; Confidence Ranker assesses
  whether a conclusion or next action is ready before completion is claimed.

## Anti-patterns

| Do not | Why |
|---|---|
| Rank every sentence | Background detail buries the claims that control the action |
| Give one rank to a whole answer | Observations, generalizations, and recommendations rarely share the same evidence |
| Treat fluent wording or model familiarity as evidence | Style predicts neither correctness nor currentness |
| Generalize a successful probe | VERIFIED covers only what was actually run |
| Count duplicated sources as corroboration | Repetition from one origin is still one evidence leg |
| Use a low rank as an excuse not to check | Cheap permitted checks should be done now |
| Lower the threshold because evidence is unavailable | The honest result is NOT READY |
| Treat READY as authorization | Evidence readiness and permission are separate gates |
| Invent confidence percentages | Uncalibrated precision is false precision |
