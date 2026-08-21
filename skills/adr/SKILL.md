---
name: adr
description: >
  Record and consult Architectural Decision Records as markdown files in the repo's
  ./.adr/ folder, so past decisions constrain future planning. Use in two directions.
  WRITE when the user says to record a decision, write an ADR, "remember this decision",
  "don't let us undo this", or after a hard-to-reverse architectural call. READ at the
  start of ANY request to plan, refactor, integrate, redesign, or choose a library or
  datastore — even when ADRs are not mentioned: check ./.adr/ first (and adr-NNNN git
  tags) so the proposal does not contradict a decision already made, and say which ADR
  applies. Also use when a
  decision is being reversed, to supersede the old record rather than delete it. Adapted
  from Matt Pocock's ADR format.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Architectural Decision Records

An ADR is a short markdown file recording **why** a decision was made, so a future
reader — human or agent — doesn't undo it by accident or re-litigate it from
scratch.

Format adapted from [Matt Pocock's ADR skill](https://github.com/mattpocock/skills).
Only the ADR convention is borrowed; none of the surrounding workflow is implied.

**Location: `./.adr/` at the repo root**, committed to git. Sequential naming:
`0001-slug.md`, `0002-slug.md`. Create the directory lazily — only when the first
ADR is written.

---

## Reading: consult before you plan

This is the half that makes ADRs worth keeping. **Before proposing a plan, a
refactor, a new dependency, or a change to module boundaries, check `.adr/`.**

```bash
ls .adr/ 2>/dev/null && grep -l . .adr/*.md 2>/dev/null | head -30
```

If the directory exists, read the titles; read in full any ADR whose subject
overlaps what you're about to change. Then:

- **If the plan contradicts an accepted ADR** — stop and say so, naming the ADR by
  number and title. Present the options plainly: work within the decision, or
  supersede it deliberately. Never silently plan against a recorded decision.
- **If an ADR constrains the plan** — state the constraint in the plan itself
  ("ADR-0003 requires contexts to talk via events, so this goes through the bus").
- **If the plan is in territory with no ADR** — proceed normally. Absence of an ADR
  is not a decision.

Cite ADRs by number and title when they inform your reasoning, so the user can
check whether the record still reflects what they want.

## Writing: when a decision earns an ADR

**Write on request, always.** When the user says to record a decision, do it — the
test below is for deciding what to *offer*, not for arguing with a direct request.

Otherwise, offer one only when **all three** are true:

1. **Hard to reverse** — changing your mind later carries real cost.
2. **Surprising without context** — a future reader will look at the code and ask
   "why on earth did they do it this way?"
3. **The result of a real trade-off** — genuine alternatives existed and one was
   picked for specific reasons.

Easy to reverse? Skip it; it'll just get reversed. Not surprising? Nobody will
wonder. No real alternative? There's nothing to record beyond "we did the obvious
thing."

### What qualifies

- **Architectural shape** — "monorepo", "write model is event-sourced, read model projected into Postgres".
- **Integration patterns** — "Ordering and Billing communicate via domain events, not synchronous HTTP".
- **Technology choices carrying lock-in** — datastore, message bus, auth provider, deployment target. Not every library; the ones that would take a quarter to swap.
- **Boundary and scope decisions** — "Customer data is owned by the Customer context; others reference it by ID only." The explicit no's matter as much as the yes's.
- **Deliberate deviations from the obvious path** — "manual SQL instead of an ORM because X". These stop the next engineer from "fixing" something intentional.
- **Constraints invisible in the code** — compliance rules, partner SLAs, hardware limits, "response times must stay under 200ms because of the partner contract".
- **Rejected alternatives when the rejection is non-obvious** — if GraphQL was considered and REST chosen for subtle reasons, record it, or it will be proposed again in six months.

### What does not qualify

Formatting and style choices, library picks that are a one-line swap, anything
already obvious from reading the code, and routine bug fixes. An `.adr/` folder
full of trivia is one nobody reads.

## The format

Minimal by default. The value is in recording *that* a decision was made and
*why* — not in filling out sections.

```md
# {Short title of the decision}

{1-3 sentences: the context, what was decided, and why.}
```

That is a complete ADR. Most should look like this.

### Optional sections — only when they earn their place

- **Status** (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — when decisions get revisited.
- **Considered options** — when the rejected alternatives are worth remembering.
- **Consequences** — when non-obvious downstream effects need calling out.
- **Constraints this creates** — the invariants future work must not violate. This
  is the section that makes an ADR useful during planning; include it whenever the
  decision implies an ongoing rule rather than a one-time change.
- **Evidence** — benchmark numbers, commit hashes, run IDs, when the decision rests
  on measurement rather than judgment.

Record *why the decision exists and which invariant it protects*, not just what
changed.

## Numbering and naming

Scan `.adr/` for the highest existing number and increment:

```bash
ls .adr/ 2>/dev/null | grep -oE '^[0-9]{4}' | sort -n | tail -1
```

Four digits, then a kebab-case slug describing the decision, not the change:
`0007-events-not-http-between-contexts.md`, not `0007-refactor.md`.

## Superseding, never deleting

When a decision is reversed, the old record is the most valuable thing you have —
it explains why the previous approach was chosen and what changed.

1. Write a **new** ADR for the new decision, referencing the old one.
2. Mark the old one `Status: superseded by ADR-NNNN` and leave its body intact.
3. Never delete or rewrite the history of an ADR. Correcting a typo is fine;
   erasing the reasoning is not.

If reality has drifted from an accepted ADR without anyone deciding to change it,
say so — that's a finding worth surfacing, not a file to quietly edit.

## Git

`.adr/` is a dotfile directory, so check it isn't being ignored:

```bash
git check-ignore -v .adr/ 2>/dev/null && echo "IGNORED — fix .gitignore" || echo "tracked"
```

A `.*` or `.??*` pattern in `.gitignore` will silently swallow it. If ignored, add
`!.adr/` and tell the user. Commit ADRs alongside the change they describe, so the
record and the code move together.

---

## Working notes

- **One decision per file.** Two decisions in one ADR can't be superseded independently.
- **Write it at decision time**, not weeks later — the reasoning is what evaporates.
- **Present tense, plain language.** "We use X because Y." No ceremony.
- **Link to code, issues, or benchmarks** rather than restating them.
- **Don't retrofit an `.adr/` folder** across a codebase's whole history unless
  asked. Start from the next real decision.
- Keep ADRs short enough that reading all of them is realistic. If the folder
  becomes unreadable, the read-side stops happening and the whole thing is dead
  weight.
