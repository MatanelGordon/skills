# Plan: council-protocol-hardening

**Status:** complete
**Created:** 2026-11-20   **Base branch:** `feat/council-protocol-hardening` from `origin/main`

## Goal

Make the Council skill reliable enough for repeated architectural decisions by moving fragile bookkeeping into a deterministic, dependency-free helper, refusing to compact over-budget evidence packets, reducing the entrypoint to a precise router, and adding both fast protocol tests and an opt-in live multi-agent smoke contract. Success means the helper and skill tests pass, the repository validates, and a live isolated-agent run can be verified without silently changing any member response.

## Out of scope

- Building a standalone LLM or sub-agent runtime; the host still spawns isolated agents.
- Mixing model providers or assigning different models to personas.
- Automating subjective judgments such as whether two arguments share the same underlying reason.
- Changing any skill outside `skills/council`, except wiring Council tests into the existing package test command.
- Inspecting, modifying, packaging, or deleting `skills/rank-workspace`.

## Background

Council is currently a 622-line instruction-only skill. Commits `bcdca76` and `443080b` added mission-prioritization roles and explicit numeric-evidence rules. A real hosted run proved the two-round process can work, but it also showed that long round-two packets may be compacted and that prompt bookkeeping is too easy to perform inconsistently. Baseline on `6dac2d7`: `npm test` passes 20 tests and `npm run validate` reports 25 skills plus 2 agents valid. No relevant `.adr/` or `.memory/index.md` exists.

Research found full multi-model council/orchestration packages, but none fits this closed-network, same-model protocol helper without replacing the skill's design. The helper will therefore use only Node.js built-ins.

## Approach

Keep semantic work with the model and mechanize the invariants that failed in practice. A pure ESM module will validate decision briefs, route requests, select members, parse member output, classify convergence, validate casting output and numeric evidence, create deterministic anonymous labels, build byte-preserving round-two prompts, and validate live-run ledgers. If the full packet or any full prompt exceeds its declared budget, it throws `PACKET_TOO_LARGE`; there is no truncation or summary path.

The concise `SKILL.md` will encode the chosen hybrid invocation policy: run automatically for consequential, hard-to-reverse architecture decisions with real options and a trade-off; run for broader technical strategy or mission prioritization only after an explicit Council request. Detailed personas, prompt protocol, chairman rules, and live-smoke procedure move to focused references.

## Architecture

The host agent remains the orchestrator and owns semantic feature detection, isolated sub-agent spawning, and the final recommendation. Before and between model calls it serializes the current state to the deterministic helper. The helper returns validated state or a typed failure. The same helper verifies a captured opt-in live-smoke ledger, so the live layer tests actual agent isolation and the fast layer tests protocol mechanics.

## File map

| Path | Change | Phase | Owner |
|---|---|---|---|
| `.plan/council-protocol-hardening/plan.md` | implementation record, force-added because `.plan` is locally ignored | 1 | root |
| `skills/council/scripts/council-protocol.mjs` | deterministic protocol API and CLI | 1 | root |
| `skills/council/tests/council-protocol.test.mjs` | fast unit/integration coverage | 1 | root |
| `skills/council/references/protocol.md` | detailed two-round workflow and literal prompt templates | 2 | root |
| `skills/council/references/personas.md` | standing persona blocks and convening rules | 2 | root |
| `skills/council/references/verdict.md` | chairman template, credibility, evidence, and dissent rules | 2 | root |
| `skills/council/references/live-smoke.md` | opt-in hosted multi-agent procedure and ledger contract | 2 | root |
| `skills/council/evals/live-smoke.json` | reproducible smoke scenario and required invariants | 2 | root |
| `skills/council/evals/evals.json` | hybrid-routing and fail-closed behavioral cases | 2 | root |
| `skills/council/SKILL.md` | concise router and orchestration entrypoint | 2 | root |
| `package.json` | include fast Council tests in normal CI test command | 2 | root |

## Shared surface

All work is sequential. The helper's exported contract and live-ledger schema are the shared surface; references and tests consume them only after the phase-1 API is green.

## Phases

### Phase 1 — deterministic foundation

Write focused tests first and observe them fail because the helper does not exist. Implement the helper until routing, selection, parsing, option-letter validation, convergence, fresh anonymity, exact packet construction, budget refusal, evidence classification, and ledger verification pass.

### Phase 2 — skill integration

Split the existing instructions into focused references, rewrite the entrypoint around hybrid routing and helper gates, add behavioral evals plus the opt-in smoke manifest, and wire the fast suite into `npm test`.

### Phase 3 — review

Run an independent code/skill review and an independent forward test. Fix every critical/high issue and feasible medium issue, then rerun all gates.

## Test strategy

### Critical-path tests

```bash
node --test skills/council/tests/council-protocol.test.mjs
npm test
npm run validate
npm pack --dry-run --json
git diff --check
```

Run the opt-in live smoke from `references/live-smoke.md`, save its ledger outside the repository, then verify it with:

```bash
node skills/council/scripts/council-protocol.mjs verify-live-smoke /absolute/path/to/ledger.json
```

### Edge cases

| Case | Axis | Status |
|---|---|---|
| brief has fewer than 2 or more than 5 options | cardinality | covered by fast test |
| brief exceeds 300 words or omits a required section/tag | boundaries/absence | covered by fast test |
| architecture request is implicit; strategy request is implicit/explicit | routing | covered by fast test and behavioral eval |
| only two personas match; every persona matches | cardinality | covered by fast test for floor/cap/priority |
| malformed/partial response or vote outside the brief's option letters | malformed | covered by fast test |
| fewer than three usable responses | failure | covered by fast test |
| identical votes with malformed/low confidence | boundary/malformed | covered by fast test |
| invalid or hedged casting output | malformed | covered by fast test |
| duplicate persona/response, non-bijective labels, or reused prior-round mapping | malformed/freshness | covered by fast test |
| exact packet fits budget and exceeds by one character | off-by-one/scale | covered by fast test |
| raw response contains wide Unicode and newlines | encoding | covered by byte-preservation test |
| exact code value, inference, unverified number, and absent evidence | evidence | covered by fast test |
| hosted sub-agent timeout/process failure | time/failure | reported by live smoke; retry policy deliberately out of scope |
| two orchestrators write the same ledger | concurrency | out of scope; smoke artifacts are per-run temporary files |

### Coverage

Target branch coverage over every exported helper decision and every typed error path. Fast tests cover deterministic logic; behavioral evals cover skill routing; the opt-in hosted smoke covers isolated-agent orchestration and exact round-two packet preservation. Subjective chairman reasoning is deliberately not unit-tested as a string match.

## Definition of done

- Hybrid invocation policy is explicit and behaviorally evaluated.
- `SKILL.md` is at most 220 lines and retains named sections for invocation, exclusions, deterministic gates, session flow, references, and failure behavior.
- Round-two construction cannot summarize, truncate, or omit evidence; it fails with `PACKET_TOO_LARGE`.
- Normal CI runs the deterministic Council suite.
- A real hosted smoke ledger passes the deterministic verifier and records a distinct host-assigned spawn ID plus the exact prompt and response for every voting member.
- Full tests, validation, package dry-run, and diff checks pass.
- A fresh reviewer finds no unresolved critical/high findings.
- The branch is committed and pushed without touching the shared dirty checkout or `rank-workspace`.

## Risks and unknowns

- Hosted agents cannot be spawned by a local Node process -> keep the live layer opt-in and verify its external ledger deterministically.
- Character budgets are a conservative proxy for model tokens -> make the caller supply the budget and fail closed; no token-count claim.
- Persona text may mention names inside an argument -> guarantee anonymous headers and byte preservation, not semantic redaction of member-authored prose.
- The active checkout contains another session's release edits -> work and push from the isolated branch only.
- `.plan` is ignored by repository convention -> force-add only this plan file so the reviewed architecture ships with its change.

## Decisions

No ADR is needed. The hybrid invocation policy is a user-selected skill behavior, not a repository-wide architecture commitment.

## Amendments

- 2026-11-20 — User approval to execute is the explicit “do 1,2,3,5” instruction plus the selected hybrid routing policy; no second planning pause is required.
- 2026-11-20 — The final verifier reconstructs complete prompts from canonical persona blocks and helper-owned literals, records casting, and requires typed JSON inputs after independent review found shallow prompt and truthiness bypasses.
- 2026-11-20 — Live contested smoke passed with four round-one and five fresh round-two contexts; the 7,001-character evidence packet fit unchanged in a 9,588-character maximum prompt.
