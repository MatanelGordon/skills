---
name: council
description: >
  Use to pressure-test architecture choices through isolated subagents: consequential,
  hard to reverse, and 2-5 real options with a trade-off. Automatic when those gates
  hold; broader strategy needs an explicit Council request. Not for option tables (use
  critical-thinking) or plans (use deep-plan).
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Council

Council pressure-tests one decision through independent round-one analysis, anonymous cross-review when needed, and a chairman verdict that preserves dissent. One host model orchestrates fresh isolated sub-agents of itself; this is context diversity, not a mixed-model vote.

## Invocation policy

Run Council automatically for an architecture decision only when all are true:

1. The decision is consequential.
2. It is expensive to reverse.
3. Two to five real options can be named.
4. The options have a real trade-off.
5. The host can spawn isolated sub-agents.

For non-architectural technical strategy—engineering missions, initiatives, capability bets, or priority choices—run only when the user explicitly asks for Council deliberation. Direct triggers include:

- “council this”
- “convene the council”
- “run the council”
- “pressure-test this decision”

An explicit trigger does not override the five readiness gates.

## Do not run

- Factual questions: answer from evidence.
- Options-only comparisons: use a decision table or `critical-thinking`.
- Implementation planning: use `deep-plan`.
- Low-stakes or easily reversible choices: decide directly.
- A question with fewer than two sane options or no real trade-off: explain that it is not Council-ready.
- A host without isolated sub-agents: answer directly with a decision table. Never simulate several personas in one context.

## Required resources

When Council runs:

1. Read [references/protocol.md](references/protocol.md) for the exact workflow and prompt blocks.
2. Read [references/personas.md](references/personas.md) to select members and copy complete persona blocks.
3. Read [references/verdict.md](references/verdict.md) before writing the chairman verdict.

Read [references/live-smoke.md](references/live-smoke.md) only when validating the skill itself.

## Deterministic protocol gates

Use `scripts/council-protocol.mjs` for brief validation, routing, member selection, response parsing, convergence, casting validation, fresh anonymous mappings, round-two prompt construction, numeric-evidence audit, and live-ledger verification.

The model still identifies semantic features from the brief and judges argument quality. It must not redo a failed mechanical gate by intuition.

Resolve `<council-skill-dir>` as the directory containing this `SKILL.md`. Keep helper input and generated ledgers in an isolated temporary directory outside the repository. The CLI accepts JSON files:

```text
node <council-skill-dir>/scripts/council-protocol.mjs validate-brief state.json
node <council-skill-dir>/scripts/council-protocol.mjs route state.json
node <council-skill-dir>/scripts/council-protocol.mjs select-members state.json
node <council-skill-dir>/scripts/council-protocol.mjs prepare-round-one state.json
node <council-skill-dir>/scripts/council-protocol.mjs round-one state.json
node <council-skill-dir>/scripts/council-protocol.mjs validate-casting state.json
node <council-skill-dir>/scripts/council-protocol.mjs anonymize state.json
node <council-skill-dir>/scripts/council-protocol.mjs prepare-round-two state.json
node <council-skill-dir>/scripts/council-protocol.mjs audit-evidence state.json
```

## Session flow

Stop when any decline or abort rule fires.

### 1. Brief and convene

Write and validate a decision brief of at most 300 words. Preserve the validated text verbatim. Set the routing and persona feature flags from its meaning, then let the helper select the voting set. Skeptic and Pragmatist always vote; the helper enforces the three-member floor, six-member cap, and priority order.

### 2. Independent round 1

Spawn one fresh isolated sub-agent per voting member, in parallel when supported. Every member receives only its complete persona block, the verbatim brief, and the literal round-one block. Sequential spawns must remain isolated.

Do not retry malformed or empty responses. Parse them with the helper using the brief's option letters. Fewer than three usable responses aborts. Otherwise use the helper's literal `CONVERGED` or `NOT_CONVERGED` result.

### 3. Choose the second-stage path

- `CONVERGED`: run the Devil's Advocate gate once. Its exact `NO MATERIAL OBJECTION` skips round 2; a specific material objection enters the anonymous packet and forces round 2.
- `NOT_CONVERGED`: do not run the Devil's Advocate. Run the inline casting-director check, persist its literal output, and pass it through the helper. Invalid output fails closed to no late joiner.

### 4. Build and run round 2

Round 2 uses fresh spawns for every original usable voter plus any valid late joiner. Record the prior mapping, ask the helper for a different mapping, and have it build every prompt from complete raw responses.

Set `maxPromptChars` to the real host limit expressed conservatively in characters. If the helper returns `PACKET_TOO_LARGE`, abort and report the required and available sizes. Never summarize, truncate, deduplicate, excerpt, or omit evidence to fit. Retry only when a genuinely larger host context is available.

### 5. Chairman verdict

The orchestrator is the chairman; never spawn one. De-anonymize from the recorded mapping, tally option votes, apply the credibility and correlated-agreement rules, preserve every material dissent and premise challenge verbatim, and aggregate observable falsifiers as revisit triggers.

## Non-negotiable failures

1. No isolated spawning: decline; never role-play the pool in one context.
2. No two genuine options with a trade-off: decline.
3. Fewer than three usable round-one responses: abort without retry.
4. A vote outside the brief's option letters is unusable.
5. Invalid casting output fails closed to `NONE NEEDED`.
6. Anonymous mappings must be one-to-one and different between rounds.
7. Round-two prompts must contain every raw response byte-for-byte.
8. Over-budget prompts abort with `PACKET_TOO_LARGE`; compacting is forbidden.
9. Confidence is bucketed, never used as a numeric vote weight.
10. Missing or non-observable falsifiers lower credibility.
11. Agreement for one shared reason counts as one correlated voice.
12. Untagged numbers are estimates; missing evidence never becomes zero.
13. Every non-`NONE` premise challenge and material dissent survives verbatim.
14. The casting director may add only a written standing-pool voter, never a novel persona.
