# Brownfield seams

How to put deliberately bad code into a system that already exists, without the
bad code fusing to it.

The whole technique is one idea: **the system depends on a seam, never on the
prototype.** Get that right and deletion is a one-line change. Get it wrong and
the hack is permanent, not because anyone chose to keep it but because removing
it turned into a refactor nobody has budget for.

---

## Where to put the seam

The seam goes at the boundary where the *real* implementation would naturally
sit — not where the prototype happens to be convenient.

| The question is about | Put the seam at |
|---|---|
| An algorithm or policy (ranking, pricing, matching, retry rules) | A strategy interface taking inputs, returning a decision |
| An external system (a vendor API, a queue, a mail provider) | A port/adapter around that system's capability, in your vocabulary |
| Data access or shape | A repository or query interface returning domain types, not rows |
| A whole feature path | A feature flag choosing between two implementations of the same interface |
| Rendering or presentation | A component boundary with props the real one would also need |

**Design the interface against the real implementation.** Ask what the proper
version would need, and shape the seam around that. If you shape it around what
the hack happens to have lying around, you get an interface only a hack can
satisfy — and the swap you built the seam for never lands.

A useful check: could a competent engineer implement this interface properly
without reading the prototype? If not, the interface is leaking the hack.

## The one-line swap test

Before writing the prototype body, answer: **what do I change to swap this out?**

Count the edits. One is correct. Two is tolerable if the second is deleting a
file. Anything that touches a call site means the seam is in the wrong place —
move it now, while there is nothing to move.

```ts
// container.ts — the ONLY line that changes when the real thing lands
- container.bind(ResultRanker, new PrototypeEngagementRanker());  // PROTOTYPE
+ container.bind(ResultRanker, new EngagementRanker(clock, stats));
```

If the codebase has no injection point, the flag form works just as well:

```ts
export const ranker: ResultRanker =
  process.env.PROTOTYPE_RANKER === '1'
    ? new PrototypeEngagementRanker()   // PROTOTYPE — delete with the flag
    : new RecencyRanker();
```

## Worked example

**Question:** should search results be ranked by engagement instead of recency?
Nobody knows whether engagement ranking makes the feed better or just noisier,
and building it properly means a stats pipeline, a decay model and a backfill.

### 1. The seam — written first, shaped for the real implementation

```ts
// ranking/result-ranker.ts  — permanent. Survives the prototype.
export interface ResultRanker {
  /** Ordered best-first. Pure: same inputs, same order. */
  rank(results: readonly Result[], ctx: RankContext): readonly Result[];
}

export interface RankContext {
  readonly viewerId: string;
  readonly now: Date;     // real impl needs a clock for decay
}
```

`now` is on the context because the real ranker needs time-decay, even though the
prototype ignores it. That is the interface being designed against the real
implementation rather than the hack.

### 2. The deliberately bad implementation

```ts
// ranking/prototype-engagement-ranker.ts
//
// PROTOTYPE — answers: "does engagement ranking feel better than recency?"
// Deliberately terrible: hardcoded weights, engagement numbers pasted from a
// one-off query on 2026-08-20, no decay, no pagination, O(n log n) over
// everything in memory.
//
// EXIT: when the verdict is in, this file is deleted and the binding in
// container.ts points at the real EngagementRanker. If the verdict is "no",
// this file is deleted and nothing replaces it. Either way it does not survive
// the decision. Owner: search. Flag: PROTOTYPE_RANKER.
//
export class PrototypeEngagementRanker implements ResultRanker {
  // eyeballed from a spreadsheet, do not defend these numbers
  private static readonly FAKE_ENGAGEMENT: Record<string, number> = {
    'post-1': 900, 'post-2': 12, 'post-3': 450,
  };

  rank(results: readonly Result[]): readonly Result[] {
    return [...results].sort(
      (a, b) =>
        (PrototypeEngagementRanker.FAKE_ENGAGEMENT[b.id] ?? 0) -
        (PrototypeEngagementRanker.FAKE_ENGAGEMENT[a.id] ?? 0),
    );
  }
}
```

Note what is *not* here: no clock, no stats client, no cache, no config, no
fallback, no tests. The hardcoded map is the point — it is faster than a query
and it is impossible to mistake for production code.

### 3. The swap

One line in `container.ts`, shown above. Every call site keeps calling
`ranker.rank(...)` and none of them knows or cares which implementation answered.

### 4. The exit path

Written into the prototype file itself, as above. It names three things:

- **what "done" means** — the verdict is in
- **what happens on yes** — real implementation replaces the binding
- **what happens on no** — file deleted, nothing replaces it, flag removed

The "no" branch matters most. Prototypes that only document the happy exit tend
to linger when the answer turns out to be no, because nobody wrote down that
deletion was the plan.

## Marking it loudly

The reader you are warning is the one who is about to depend on it. Put the mark
where they will be standing:

- **Filename** — `prototype-engagement-ranker.ts`. Visible in imports and diffs.
- **Class/function name** — `PrototypeEngagementRanker`. Visible at the binding.
- **Header comment** — the question, the exit path, the owner.
- **Flag name** — `PROTOTYPE_RANKER`, not `NEW_RANKER`. "New" ages into "current".

Avoid marking with `TODO` alone. Codebases are full of TODOs from 2019; it reads
as decoration rather than a warning.

## The named patterns this belongs to

This is not a new technique — it is a short-lived application of established
ones, and knowing the names makes the intent legible to reviewers.

| Pattern | What it gives you here | Source |
|---|---|---|
| **Branch by abstraction** | The seam itself: an abstraction over an existing capability so two implementations can coexist and be swapped. The prototype is one implementation. | [martinfowler.com/bliki/BranchByAbstraction.html](https://martinfowler.com/bliki/BranchByAbstraction.html) · [branchbyabstraction.com](https://www.branchbyabstraction.com/) (Paul Hammant) |
| **Strangler fig** | The shape when the prototype grows into the replacement instead of being deleted — new implementation takes traffic incrementally behind the same seam. | [martinfowler.com/bliki/StranglerFigApplication.html](https://martinfowler.com/bliki/StranglerFigApplication.html) |
| **Parallel change** (expand / migrate / contract) | The safe way to change the *seam's own shape* once the prototype taught you the interface was wrong. | [martinfowler.com/bliki/ParallelChange.html](https://martinfowler.com/bliki/ParallelChange.html) (Danilo Sato) |
| **Feature toggles** | The one-line swap mechanism, plus the discipline of removing the toggle. Note the distinction between release toggles and long-lived ones — a prototype flag is the shortest-lived kind. | [martinfowler.com/articles/feature-toggles.html](https://martinfowler.com/articles/feature-toggles.html) (Pete Hodgson) |

**Existing skills that cover the refactoring patterns themselves** — reference
these rather than restating their content:

- `wondelai/skills` → `refactoring-patterns/SKILL.md` — general refactoring
  pattern catalogue including branch by abstraction.
  *Verified present 2026-08-22 via GitHub code search.*
- `TerminalSkills/skills` → `skills/incremental-implementation/` — incremental
  delivery behind seams. *Verified present 2026-08-22 via the GitHub contents API.*

Neither is vendored here; they belong to their authors. This skill covers only
the *prototype-specific* application: a seam whose implementation is meant to be
bad and short-lived.

## Failure modes

| Failure | What it looks like | Fix |
|---|---|---|
| Seam in the wrong place | Swapping means editing call sites | Move the seam up to where the real implementation would sit |
| Seam shaped around the hack | The interface exposes the prototype's shortcuts (`getHardcodedScores()`) | Redesign against the real implementation's needs |
| Abstractions behind the seam | Helper classes, a config object, a base class inside the prototype | Delete them. Behind the seam, keep it dumb |
| Prototype quietly improved | Error handling, caching, a test appears | Decide explicitly: promote it properly, or stop |
| No exit path written down | "Why is this still here?" six months later | Header comment naming done, yes-branch and no-branch |
| Flag named for the feature | `NEW_RANKER`, `ENGAGEMENT_V2` | Name it for its status: `PROTOTYPE_RANKER` |
| Two prototypes behind one seam | The seam grows options to serve both | One question per seam. Split them |
