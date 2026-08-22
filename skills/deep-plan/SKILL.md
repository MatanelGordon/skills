---
name: deep-plan
description: >
  Produce a plan good enough to hand to someone with zero context — investigated, with a
  file map whose owners are disjoint, an explicit test strategy covering critical paths,
  edge cases and coverage, and written to .plan/NAME/plan.md and committed so other
  sessions and teammates share the same architecture. Use before any non-trivial
  implementation: a feature, refactor, migration, or anything spanning more than a
  couple of files. Also use when asked to plan, design, or scope work; when a previous
  attempt sprawled; when work must be split across agents; or when resuming and a plan
  already exists. Owns the .plan directory. Hands execution to parallel-build when the
  work has genuinely independent seams, and says so plainly when it does not.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Deep plan

A plan is not a task list. It is the artifact that lets **someone else** — a
subagent, a teammate, you in three weeks — do the work without re-deriving your
reasoning. Every rule below serves that one test.

**This skill owns `.plan/`.** It creates the directory, defines the layout, and
writes `plan.md`. `parallel-build` executes a plan; it does not invent one.

**Model requirement.** This skill requires xhigh reasoning effort on a frontier
model. If the current model does not meet that bar, do not plan silently — ask
the user whether to (1) proceed anyway, (2) spawn a subagent with the required
model, or (3) write a `handoff.md` summarizing the task for another session.

`<name>` is concise and indicative: `oauth-device-flow`, `remote-run-verification`.
Not `plan1`, not a sentence.

---

## 0. Gate: is this ready to plan?

Planning an unsettled requirement produces a *confident, detailed, wrong* plan —
and the detail makes it more persuasive, not less. Before writing anything,
answer three questions:

1. **What is the goal, in one sentence?**
2. **How will we know it worked?** — an observable outcome, not "it's done".
3. **What is explicitly out of scope?**

If you cannot answer all three from what the user said plus what the code shows,
**stop and resolve it with them.** One clarifying exchange is cheaper than a plan
built on a guess. If the ask is genuinely exploratory, say so — that's research,
not planning.

## 1. Investigate before you plan

Most bad plans are confident guesses. Before writing:

- **Read the code at every seam you intend to touch.** Not filenames — code.
- **Find the existing conventions.** How does this codebase already do errors,
  config, DI, tests? A plan that fights the local idiom gets rejected in review.
- **Check prior decisions.** Read relevant files in `.adr/`, consult
  `.memory/index.md`, and use targeted `git log --grep` searches for the area. A
  plan that contradicts a recorded decision gets thrown away — cite it, or
  supersede it deliberately.
- **Record the current test baseline.** What runs, what passes, how long it takes.
  You cannot claim "tests pass" later without knowing this now.

Use `Explore` agents in parallel when the repo is unfamiliar. Investigation is
cheap; a wrong plan executed by four agents is not.

**Name what you could not determine.** An unknown stated in the plan is a risk
being managed; an unknown glossed over is a bug waiting.

## 2. Decide the file structure before the tasks

Map which files will be created or modified and what each is responsible for.
**This is where decomposition gets locked in** — task boundaries follow from it,
not the other way round.

- One clear responsibility per file. Prefer smaller focused files; you reason
  better about code you can hold in context at once.
- **Files that change together live together. Split by responsibility, not by
  technical layer** — "frontend/backend" collides, "feature A / feature B" doesn't.
- In an existing codebase, follow established patterns. Don't unilaterally
  restructure, though splitting a file you're already modifying is fair.

## 3. Test strategy is part of the plan

The section most plans skip and most reviews fail on. Write it **before** the
implementation steps — deciding how you'll prove it works usually changes what
you build.

**Critical-path tests** — the exact commands that must pass at every merge,
verbatim (`npm test -- path/to/suite`, `dotnet test --filter X`). These become the
executors' definition of done and your merge gate.

**Edge cases** — enumerate explicitly, per unit of work:

| Axis | Ask |
|---|---|
| Cardinality | empty · exactly one · many · more than fits in memory |
| Boundaries | zero · negative · max · off-by-one at each end |
| Absence | null/None · missing field · empty string vs absent |
| Malformed | wrong type · wrong shape · truncated · wrong encoding · wide chars |
| Time | clock skew · timeout · retry · out-of-order · DST |
| Concurrency | two writers · read during write · duplicate delivery · partial failure |
| Failure | dependency down · slow · 500 · wrong-but-valid data |
| Scale | the size that breaks the naive approach |

Not every axis applies. For each that does, mark it **covered by a test**,
**deliberately out of scope**, or **unknown**. "Out of scope" is a legitimate
answer; silence is not.

**Coverage** — state the target *and the shape*. Which modules, what kind of test
covers them (unit / integration / e2e / property), what is exempt and why. A
percentage with no statement of what it covers is a vanity metric — 90% that
misses every error path is worse than 70% that doesn't.

Prefer property-based tests where a property exists ("output is always exactly
`width` cells") over three examples that happen to pass.

## 4. File map with disjoint ownership

The artifact that makes parallel execution safe. Every path you intend to touch,
exactly once:

| Path | Change | Phase | Owner |
|---|---|---|---|
| `src/core/types.ts` | new shared types | 1 | p1-foundation |
| `src/features/a/**` | feature A | 2 | p2-feature-a |
| `package.json` | +2 deps | 1 | p1-foundation |

- **A path with two phase-2 owners is a planning bug.** Resplit, or move it to phase 1.
- **Shared surface goes to phase 1**: types, interfaces, config, deps, migrations,
  DI/route registries, barrel exports, test harness and fixtures.
- If no disjoint split exists, say so. Sequential beats a plan that conflicts in
  every file.

## 5. Size it honestly

| Scope | Do this |
|---|---|
| 1–3 files, one seam | Just do it. Plan only if the user wants a record. |
| Several files, one coherent change | Solo, but write `plan.md` — future sessions need it. |
| Multiple independent seams, or >½ day | **Hand to `parallel-build`** for phased subagent execution. |

Do not manufacture parallelism. Four agents on a three-file feature cost more in
coordination and conflicts than they save.

## 6. Write it down, then review it

```bash
PLAN="$(git rev-parse --show-toplevel)/.plan/<name>"
mkdir -p "$PLAN"
```

`.plan/` is **committed to git** — that is what makes the architecture shared.
Commit `plan.md` with the change it describes. `PROGRESS.md` churns during
execution; commit those updates as you go rather than letting the tree sit dirty
(a dirty tree blocks `wt.sh merge`).

See `references/plan-template.md` for the full `plan.md` shape.

### Review the plan before executing

A bad file map doesn't fail at planning time — it fails four agents deep, as merge
conflicts, after real quota is spent. Run the checklist in
`references/plan-review.md` yourself, or dispatch one cheap agent to do it.
It checks the few things that actually break runs: every path owned once, shared
surface in phase 1, acceptance criteria checkable, test commands real.

Then **confirm with the user before executing.**

## 7. Status and amendment

A committed plan is read by sessions that weren't there when it was written, so
it must say where it stands. `plan.md` carries a status line:

```markdown
**Status:** draft | approved | executing | complete | abandoned
```

- **Never execute a `draft`.** It hasn't been agreed.
- Move to `executing` when dispatch starts, `complete` when done and verified.
- `abandoned` beats deletion — it records that the approach was tried.

**When execution proves the plan wrong** — and it will — amend `plan.md`, don't
drift from it silently. Add to an `## Amendments` section:

```markdown
## Amendments
- 2026-08-21 — Phase 2 split by transport, not by feature: the retry logic turned
  out to be shared, so feature-a and feature-b both needed it. Moved to phase 1.
```

A plan that quietly diverges from what was built is worse than no plan, because
the next reader trusts it.

## 8. Decisions become ADRs

Planning is where the hard-to-reverse calls actually get made. A decision that
lives only in `plan.md` dies with the plan; `plan.md` is per-unit-of-work, an ADR
outlives it.

When the plan makes a call that is **hard to reverse, surprising without context,
and the result of a real trade-off**, write the ADR (the minimal form is one
paragraph — see the `adr` skill) and reference it from `plan.md`. When commits
are in scope, changes implementing it carry `Refs: ADR-NNNN`.

Don't ADR every choice. The test is the same three-part one, and most plan
decisions fail it.

---

## Quality bar

Ready when someone who has not read this conversation could execute it:

- [ ] Goal, success signal, and out-of-scope answerable in one sentence each
- [ ] Code read at every seam; conventions found
- [ ] Prior decisions checked (`.adr/`, `.memory/`, git history) and cited or superseded
- [ ] Current test baseline recorded
- [ ] Critical-path test commands verbatim
- [ ] Edge cases enumerated, each marked covered / out-of-scope / unknown
- [ ] Coverage states *what* it covers, not just a number
- [ ] Every path appears once in the file map, with one owner
- [ ] Shared surface assigned to phase 1
- [ ] Unknowns and risks named
- [ ] Status line present; `draft` until agreed
- [ ] Hard-to-reverse decisions captured as ADRs
- [ ] Plan reviewed before dispatch

## Anti-patterns

| Don't | Why |
|---|---|
| Plan an unsettled requirement | Produces a confident wrong plan; detail makes it worse |
| Plan from filenames | The seam you assumed doesn't exist |
| "Add tests" as a step | Not a strategy — says nothing about what or how |
| Coverage number with no shape | 90% missing error paths beats nothing, but not by much |
| Split by layer | Layers share files; features don't |
| Two agents on one file | Guaranteed conflict — resplit or move to phase 1 |
| Omit unknowns to look confident | They surface mid-execution, when they cost more |
| Parallelise a small task | Coordination exceeds the work |
| Let the plan drift from reality | The next reader trusts a stale plan |
| Execute a draft | It was never agreed |

Deeper material: `references/plan-template.md` (the full `plan.md` shape),
`references/plan-review.md` (pre-dispatch review checklist).
