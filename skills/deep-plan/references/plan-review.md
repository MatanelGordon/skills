# Pre-dispatch plan review

A bad plan doesn't fail at planning time. It fails four agents deep, as merge
conflicts, after real quota is spent. This review costs one cheap agent or five
minutes of your own attention.

Run it **after** `plan.md` is written and **before** anything is dispatched.

## How to run it

Either walk the checklist yourself, or dispatch one agent with the prompt at the
bottom. Dispatching is better when you wrote the plan — you are the worst person
to spot your own missing seam.

Fix what it finds, then set `Status: approved` and confirm with the user.

## Checklist

Each item is a yes/no with evidence. "Probably fine" is a no.

### Decomposition — the things that actually break runs

- [ ] **Every path in the file map appears exactly once.** Grep the table. Two
      phase-2 owners on one path is the single most expensive planning bug.
- [ ] **Shared surface is entirely in phase 1** — types, interfaces, config,
      deps, migrations, DI/route registries, barrel exports, test fixtures. If a
      phase-2 agent needs to edit any of these, it belongs in phase 1.
- [ ] **Phase-2 owners are disjoint by directory**, not just by file. Two agents
      in the same directory will collide on imports, barrels, and formatting.
- [ ] **Phase 1 leaves a compiling, testable repo.** Phase 2 starts from green.
- [ ] **Agent count matches independent seams.** Not more. Four agents on three
      files is coordination overhead pretending to be speed.

### Verifiability

- [ ] **Every acceptance criterion is checkable by someone who didn't write it.**
      "Endpoint returns 400 with `{error}` on missing id" passes; "handles errors
      properly" fails.
- [ ] **Critical-path test commands are real** — they exist, they run today, and
      you know their current pass state. A command invented in the plan is a
      command that fails at 2am.
- [ ] **Edge-case table has no empty Status column.** Every row is covered,
      out-of-scope, or explicitly unknown.
- [ ] **Coverage states shape, not just a number.**
- [ ] **Definition of done goes beyond "tests pass."**

### Context and correctness

- [ ] **Prior decisions checked.** `.adr/`, `.memory/index.md`, and relevant git
      history were consulted; anything relevant is cited or deliberately superseded.
- [ ] **The plan doesn't contradict a recorded constraint.** Read the relevant
      ADRs and memory entries against the plan.
- [ ] **Background links real commits** by sha, not "recent work".
- [ ] **Unknowns are named**, with how and when each resolves.
- [ ] **Conventions match the codebase** — error handling, config, test style.

### Hygiene

- [ ] `Status:` present and correct.
- [ ] `<name>` is indicative, not `plan1`.
- [ ] Out-of-scope section exists and is non-empty.
- [ ] Architecture section is readable by someone who won't see the diff.

## Reviewer prompt

Dispatch this against the plan file. It is deliberately narrow — a reviewer that
comments on everything gets ignored.

```markdown
Review the implementation plan at <path to plan.md>. You are a fresh reviewer with
no context beyond the repository and that file.

Your job is to find the flaws that would waste an execution run. In priority order:

1. OWNERSHIP COLLISIONS — does any path in the file map have two phase-2 owners,
   or does a phase-2 agent need to touch shared surface (types, config, deps,
   migrations, registries, barrel exports, fixtures)? Quote the rows.
2. UNVERIFIABLE CRITERIA — list any acceptance criterion that a third party could
   not objectively check.
3. FAKE COMMANDS — for each critical-path test command, confirm it actually
   exists in this repo and say how you confirmed it. Flag any that do not.
4. UNANSWERED EDGE CASES — any row with no status, and any obvious axis
   (cardinality, boundaries, absence, malformed, time, concurrency, failure,
   scale) that is missing entirely for a unit of work that clearly needs it.
5. CONTRADICTED DECISIONS — check `.adr/`, `.memory/index.md`, and targeted git
   history; flag anything in the plan that violates a recorded constraint.
6. MISSING CONTEXT — what would a fresh executor still have to guess?

Do NOT comment on wording, formatting, or style. Do NOT suggest scope additions.
If the plan is sound, say so plainly and stop.

Output:
VERDICT: ready | needs-changes
BLOCKERS: <numbered, each with the quoted line and the specific fix>
NON-BLOCKING: <max 3 bullets>
```

## What this review is not

It does not judge whether the feature is worth building, or redesign the
approach. Those are decisions made before planning. This checks that the plan is
**executable** — that agents dispatched against it will not collide, and that
"done" is objectively decidable.
