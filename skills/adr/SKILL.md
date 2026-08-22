---
name: adr
description: >
  Record and consult Architectural Decision Records in ./.adr/. Use when asked
  to record or remember a decision, when making or reversing a hard-to-reverse
  architectural choice, and before planning, refactoring, integrating,
  redesigning, or choosing major dependencies so existing decisions constrain
  the proposal. Supersede old ADRs rather than deleting them.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Architectural Decision Records

An ADR records **why** a decision was made, so future readers don't undo it by accident or re-litigate from scratch.

Format adapted from [Matt Pocock's ADR skill](https://github.com/mattpocock/skills). Only ADR convention borrowed; no surrounding workflow implied.

**Location: `./.adr/` at repo root**, committed to git. Sequential: `0001-slug.md`. Create directory lazily — only when first ADR written.

---

## Reading: consult before you plan

**Before proposing a plan, refactor, new dependency, or boundary change, check `.adr/`.**

```bash
ls .adr/ 2>/dev/null && grep -l . .adr/*.md 2>/dev/null | head -30
```

If directory exists, read titles; read any ADR overlapping your change. Then:

- **Plan contradicts accepted ADR** — stop, name ADR by number/title. Options: work within decision, or supersede deliberately. Never silently plan against recorded decision.
- **ADR constrains plan** — state constraint in plan ("ADR-0003 requires events, so this goes through bus").
- **No ADR in territory** — proceed normally. Absence ≠ decision.

Cite ADRs by number/title when informing reasoning.

## Writing: when a decision earns an ADR

**Write on request, always.** Test below is for *offering*, not arguing with direct request.

Otherwise, offer only when **all three** are true:

1. **Hard to reverse** — changing mind later has real cost.
2. **Surprising without context** — future reader asks "why this way?"
3. **Real trade-off** — genuine alternatives existed, one picked for specific reasons.

Easy to reverse? Skip. Not surprising? Nobody wonders. No real alternative? Nothing beyond "obvious thing."

### What qualifies

- **Architectural shape** — "monorepo", "write model event-sourced, read model projected into Postgres".
- **Integration patterns** — "Ordering and Billing communicate via domain events, not sync HTTP".
- **Lock-in tech choices** — datastore, message bus, auth provider, deployment target. Not every library; ones taking a quarter to swap.
- **Boundary/scope decisions** — "Customer data owned by Customer context; others reference by ID". Explicit no's matter as much as yes's.
- **Deliberate deviations from obvious path** — "manual SQL instead of ORM because X". Stops next engineer "fixing" intentional choice.
- **Constraints invisible in code** — compliance, partner SLAs, hardware limits, "response <200ms per partner contract".
- **Non-obvious rejected alternatives** — if GraphQL considered and REST chosen for subtle reasons, record it, or it's proposed again in six months.

### What does not qualify

Formatting/style, one-line-swap libraries, obvious-from-code, routine bug fixes. Trivia-filled `.adr/` = nobody reads.

## The format

Minimal by default. Value in recording *that* and *why* — not filling sections.

```md
# {Short title}

{1-3 sentences: context, decision, why.}
```

That's a complete ADR. Most should look like this.

### Optional sections — only when they earn their place

- **Status** (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — when decisions revisited.
- **Considered options** — when rejected alternatives worth remembering.
- **Consequences** — when non-obvious downstream effects need calling out.
- **Constraints this creates** — invariants future work must not violate. Include whenever decision implies ongoing rule, not one-time change. **This section makes ADR useful during planning.**
- **Evidence** — benchmarks, commit hashes, run IDs, when decision rests on measurement not judgment.

Record *why decision exists and which invariant it protects*, not just what changed.

## Numbering and naming

Scan `.adr/` for highest number, increment:

```bash
ls .adr/ 2>/dev/null | grep -oE '^[0-9]{4}' | sort -n | tail -1
```

Four digits, kebab-case slug describing **decision**, not change: `0007-events-not-http-between-contexts.md`, not `0007-refactor.md`.

## Superseding, never deleting

When decision reversed, old record is most valuable — explains why previous approach chosen and what changed.

1. Write **new** ADR for new decision, referencing old one.
2. Mark old `Status: superseded by ADR-NNNN`, leave body intact.
3. Never delete or rewrite ADR history. Typo fix fine; erasing reasoning not.

If reality drifted from accepted ADR without decision to change, say so — finding worth surfacing, not file to quietly edit.

## Git

`.adr/` is dotfile directory; check not ignored:

```bash
git check-ignore -v .adr/ 2>/dev/null && echo "IGNORED — fix .gitignore" || echo "tracked"
```

`.*` or `.??*` in `.gitignore` swallows it silently. If ignored, add `!.adr/` and tell user. When committing in scope, include ADR alongside change so record and code move together. Commit body explains reason/constraint not diff; ADR-governed changes end with `Refs: ADR-NNNN` trailer.

---

## Working notes

- **One decision per file.** Two decisions in one ADR can't be superseded independently.
- **Write at decision time**, not weeks later — reasoning evaporates.
- **Present tense, plain language.** "We use X because Y." No ceremony.
- **Link to code, issues, benchmarks** rather than restating.
- **Don't retrofit `.adr/` across whole history** unless asked. Start from next real decision.
- Keep ADRs short enough that reading all is realistic. If folder unreadable, read-side stops and thing is dead weight.
