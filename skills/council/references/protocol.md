# Council protocol

Read this reference whenever Council runs. It owns the exact two-round workflow and literal prompt blocks. Use `scripts/council-protocol.mjs` for every mechanical gate; keep semantic judgments with the orchestrator.

## 0. Decision brief

Write no more than 300 words. Name two to five genuine options with consecutive letters. Paste the validated brief verbatim into every prompt.

```text
DECISION: one sentence
OPTIONS: A) … B) … C) …
CONSTRAINTS: hard limits only (platform, team, deadline, compatibility)
EVIDENCE: each source with exactly one trust tag — (measured: source),
          (code-read), or (unverified-docs)
STAKES: what is expensive to get wrong, in one sentence
```

AI-generated documentation is always `unverified-docs`. If two real options with a trade-off cannot be named, decline the Council.

Validate the brief before spawning anyone. The helper returns the option letters used to validate votes.

## 1. Independent round 1

Select voting members from the semantic feature flags in [personas.md](personas.md). Spawn one fresh isolated sub-agent per member. Parallel spawning is preferred; sequential isolated spawning is valid. No round-one member may see another member's response.

Each prompt contains exactly:

1. One complete persona block.
2. The decision brief verbatim.
3. This round-one block.

```text
Respond independently. You have not seen any other member's answer. Follow
your charter and tie-break. Do not answer from a generic balanced viewpoint.
Use every output slot exactly once.

NUMERIC EVIDENCE RULE:
Every number in ARGUMENT must use exactly one source tag:
- (measured: from what) for measured evidence
- (code-read: path or symbol) only when that exact number appears directly in code or configuration
- (estimate) for an inference, unverified documentation, or missing evidence
Absence of evidence never establishes a numeric zero, baseline, current ceiling, or measured result.

VOTE: option letter from the brief
POSITION: one sentence
ARGUMENT: max 200 words, strictly from your charter's lens
STRONGEST OBJECTION TO MY OWN POSITION: one sentence
CONFIDENCE: n/5
WOULD CHANGE MY MIND: one specific observable piece of evidence
PREMISE CHALLENGE: one sentence, or the literal word NONE
```

A response is usable only when `VOTE`, `POSITION`, and `ARGUMENT` are present and the vote is one of the brief's option letters. Do not retry malformed or empty responses. Fewer than three usable responses aborts the Council.

Run the helper's round-one classifier. `CONVERGED` requires identical usable `VOTE` strings and `CONFIDENCE` 4/5 or 5/5 for every usable response. Every other quorum result is `NOT_CONVERGED`; missing or malformed confidence cannot converge.

## 2A. Converged path

Anonymize all usable round-one responses with a recorded mapping. Spawn the Devil's Advocate once with:

1. Its complete persona block.
2. The brief verbatim.
3. The complete anonymous packet.
4. This literal gate:

```text
The voting members converged. Test their agreement. A material objection is
one specific failure scenario for the agreed option. If no material objection
exists, output exactly this literal line and nothing else:

NO MATERIAL OBJECTION
```

If it returns exactly `NO MATERIAL OBJECTION`, skip round 2. Otherwise, treat the specific objection as an additional anonymous packet entry and proceed to round 2. The Devil's Advocate does not become a voting member.

## 2B. Contested path

Do not spawn a Devil's Advocate. Run the casting-director judgment inline over the brief and complete anonymous round-one packet:

```text
Inspect the decision brief and the anonymized usable round-1 responses. Name
one missing voting role only when a standing-pool member's written charter is
absent from the discussion and could change the result.

Output exactly one of these two forms:
MISSING ROLE: pool-member-name
NONE NEEDED

Valid pool-member-name values:
Skeptic
Pragmatist
Visionary
Hupert-Graph
MLK
Maintainer
Migrator

Anything else fails closed to NONE NEEDED.
```

Pass the output through `validateCastingDirector`. A hedge, explanation, misspelling, novel role, or Devil's Advocate answer fails closed to no late joiner.

## 3. Round 2

Use fresh sub-agent spawns for every original usable voter and any valid late joiner. Do not spawn the Devil's Advocate as a voter.

Before spawning:

1. Ask the helper to assign fresh labels with an explicit run-and-round seed, supplying the prior mapping so it cannot be reused. Persist the seed for reproducibility; never reuse it as a substitute for the prior-mapping check.
2. Persist the complete persona-to-label mapping.
3. Supply the complete persona blocks to `buildRoundTwoPrompts`; the helper owns and inserts the literal anti-conformity, round-two, and late-joiner blocks below.
4. Set `maxPromptChars` to the real host budget expressed as a conservative character limit.

If any complete prompt exceeds that budget, the helper throws `PACKET_TOO_LARGE`. Abort and report the required and available sizes. Never summarize, truncate, deduplicate, excerpt, or omit a response to make it fit. A rerun is allowed only with a genuinely larger host context budget.

The helper builds each prompt in this exact order:

1. Member persona block.
2. Decision brief verbatim.
3. Every usable round-one response under fresh anonymous labels, byte-for-byte.
4. Anti-conformity block.
5. Round-two output block.
6. Late-joiner block only for a casting-director addition.

```text
ANTI-CONFORMITY RULE:
Agreement discovered independently is signal.
Agreement produced by reading others is noise.
Do not soften your charter to match the room.
```

```text
STEELMAN: label + one sentence
REACTING TO: label(s)

NUMERIC EVIDENCE RULE:
Every number in ARGUMENT must use exactly one source tag:
- (measured: from what) for measured evidence
- (code-read: path or symbol) only when that exact number appears directly in code or configuration
- (estimate) for an inference, unverified documentation, or missing evidence
Absence of evidence never establishes a numeric zero, baseline, current ceiling, or measured result.

VOTE: option letter from the brief
POSITION: one sentence
ARGUMENT: max 200 words, strictly from your charter's lens
STRONGEST OBJECTION TO MY OWN POSITION: one sentence
CONFIDENCE: n/5
WOULD CHANGE MY MIND: one specific observable piece of evidence
PREMISE CHALLENGE: one sentence, or the literal word NONE
```

`STEELMAN` must fairly restate the strongest opposing response. `REACTING TO` names the anonymous labels that changed or strengthened the grounds. A changed vote must give reasons; a held vote must give new grounds.

```text
You were added because the council lacks your view. You have read a settled conversation. If you have grounds to disagree, you MUST disagree; agreement without new grounds is a failed contribution from you specifically.
```

## Deterministic helper input

The helper is a pure ESM API and a JSON-file CLI:

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

Keep temporary state outside the repository. Treat any nonzero exit or typed error as a failed gate, not permission to reproduce the calculation manually.
