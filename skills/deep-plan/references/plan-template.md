# plan.md template

Lives at `<repo>/.plan/<name>/plan.md`, committed to git.

`parallel-build` writes its execution artifacts into the same directory —
`PROGRESS.md`, `prompts/`, `agents/`, `logs/`, `CR.md`, `SECURITY.md`. Those are
its templates, not this skill's. This file owns `plan.md` only.

````markdown
# Plan: <name>

**Status:** draft | approved | executing | complete | abandoned
**Created:** <YYYY-MM-DD>   **Base branch:** <branch>

## Goal
<2-5 sentences. What is true now, what must be true when this is done, and the
observable signal that proves it. If you cannot state the success signal, you are
not ready to plan.>

## Out of scope
<Explicit no's. These prevent scope creep more reliably than the yes's, and they
tell a future reader what was considered and set aside.>

## Background
<What already exists and matters: merged work (link commits by sha), current
branch state, prior decisions being honoured (`adr-NNNN`), constraints from
`.memory/`. This is what a fresh session reads to catch up.>

## Approach
<The design. The seams, why these seams, and what you rejected. If the seams are
disjoint by file, say so — that is what enables parallel execution.>

## Architecture
<Structures, boundaries, data flow, contracts between seams. What a future
session needs to understand the shape without reading every file. Prose or a
small table; this is the section other sessions actually come here for.>

## File map
| Path | Change | Phase | Owner |
|---|---|---|---|
| `src/core/types.ts` | new — shared types | 1 | p1-foundation |
| `src/features/a/**` | new feature A | 2 | p2-feature-a |
| `package.json` | +2 deps | 1 | p1-foundation |

Every path a phase-2 agent touches appears exactly once. Two owners on one path
is a planning bug — resplit, or move it to phase 1.

## Shared surface (phase 1 owns all of it)
<Types, interfaces, base classes, config, deps, migrations, DI/route registries,
barrel exports, test harness and fixtures. Phase 2 consumes these, never edits.>

## Phases
### Phase 1 — foundation (1 agent; 2 only in a monorepo spanning projects)
<What it builds. Must leave the repo in a state where phase-2 agents cannot collide.>

### Phase 2 — implementation (N agents)
- `p2-<slug>` — <task> — owns `<paths>`

### Phase 3 — review (N agents)
- `p3-cr` — code review -> CR.md
- `p3-sec` — security -> SECURITY.md   (omit for throwaway local projects)

## Test strategy
### Critical-path tests
```bash
<exact commands that must pass at every merge>
```

### Edge cases
| Case | Axis | Status |
|---|---|---|
| empty input list | cardinality | covered — `parses empty` |
| duplicate delivery | concurrency | out of scope — at-least-once accepted |
| clock skew > 5m | time | unknown — needs spike |

### Coverage
<Target and shape: which modules, what kind of test covers them, what is exempt
and why. "85% of src/core, unit + property; src/cli exempt, covered by e2e.">

## Definition of done
<Beyond tests passing: docs updated, ADR written, `.memory/` updated, the thing
demonstrated working. What makes this plan closeable.>

## Risks and unknowns
- <risk> -> <mitigation, or "accepted">
- <unknown> -> <how and when it gets resolved>

## Decisions
- `adr-NNNN` — <title> — <one line on why it was needed>

## Amendments
- <YYYY-MM-DD> — <what changed in the plan and why execution forced it>
````

## Notes on filling it in

**Goal** — the success signal is the part people skip. "Users can log in" is not
a signal; "a new user completes signup and reaches the dashboard without a
support ticket" is.

**Architecture** — write it for someone who will never read the diff. This is the
section that makes a committed plan worth committing.

**Edge cases** — the table form forces a status on each. An empty Status column
is an unanswered question, which is exactly what you want to see before dispatch.

**Amendments** — append-only. Never edit an earlier line to make the plan look
like it was right all along; the record of being wrong is useful.

**Decisions** — only genuinely hard-to-reverse calls. If the `Decisions` section
lists six things, most of them aren't ADRs.
