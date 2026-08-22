---
name: prototype
description: >
  Build throwaway code to answer design, architecture, flow, or interaction
  questions before production implementation. Use for spikes, POCs, mockups,
  quick versions, comparing options, or uncertainty that running code can
  resolve. Covers isolated greenfield throwaways and brownfield prototypes
  placed behind one replaceable seam.
license: MIT
metadata:
  author: Matanel Gordon
  inspired_by: https://github.com/mattpocock/skills
  source: https://github.com/MatanelGordon/skills
---

# Prototype

A prototype is **throwaway code that answers a question**. Worth it if: fast answer, removable without a fight.

*Question-shaped framing from [Matt Pocock's prototype skill](https://github.com/mattpocock/skills), MIT. Brownfield seam material and token discipline are new. Not endorsed by him.*

---

## Write the question down first

One sentence at the top of the prototype:

> **Question:** can a refund be issued twice if the webhook retries mid-capture?

A prototype answering the wrong question is waste. If it can't be one sentence, split it.

**Predict the answer before running.** Confirmation isn't learning; surprise is. Commit to a guess.

**You must observe the result.** Print state after every step. For UIs, driving and reading back is its own discipline; this repo has dedicated skills for terminal, browser, desktop.

## Mode 1 — greenfield throwaway (default)

Standalone code to delete.

**No abstractions. No tests. No error handling beyond what runs. No persistence. One file.** In-memory state, hardcoded inputs, faked async. Each is a rule — "just a little more" turns two hours into two days.

When done: fold decision into real code, push prototype to throwaway branch, delete from working tree. If hard to reverse and surprising, record as ADR — reasoning outlives code.

## Mode 2 — brownfield, inside existing system

"No abstractions" becomes wrong here. Bad code without a seam fuses permanently.

**Rule inverts: deliberately bad code, behind exactly one good abstraction.**

### 1. Define the seam first

Name the interface the real implementation will satisfy. Write that first. The shitty code implements it. Nothing else knows it's shitty.

Seam designed against real implementation, not prototype. Shaping around the hack yields an interface only a hack satisfies.

### 2. The swap must be one line

Registration, injection, or factory — real impl replaces prototype by changing one line/flag.

**If swapping touches call sites, seam is wrong.** Move it before writing. Cheap check: "what do I change to swap?" and count.

### 3. The shit stays shit

Greenfield: no abstractions. Brownfield: **exactly one — the seam — and nothing more**. No layering, no helpers behind the seam. That space is meant to be embarrassing.

Making bad code nice defeats the seam. A prototype looking production-ready won't be deleted.

### 4. Mark it loudly at the boundary

Naming, comment, flag — something making a reader see it's a prototype at the dependency point. Unmarked prototypes become permanent by default.

### 5. Name the exit path in the prototype

What "done" looks like, what deletes the flag. An exit path only in someone's head isn't one.

Seam patterns, worked example with one-line swap, named patterns (branch by abstraction, strangler fig, parallel change) with sources: [references/brownfield-seams.md](references/brownfield-seams.md).

## Getting to running code fast

Fastest convincing fake per surface — backend, browser, terminal, desktop — with commands and snippets: [references/surfaces.md](references/surfaces.md).

Pick surface from the question, not preferred code. If ambiguous and user unreachable, infer from surrounding code and state assumption at top.

## Token discipline

Prototype sprawl evaporates token savings.

| Do | Not |
|---|---|
| Mock data, inline literals | Real integrations, seeded databases |
| Hardcode | Configure, env vars, flags nobody flips |
| One file | A directory structure |
| Fake async — return resolved value | Real queues, retries, backoff |
| Fake auth — hardcoded user | A login flow |
| Copy-paste between variants | Extract shared helper |
| Stop when question answered | "While I'm here…" |

Three variants is useful for comparing options. Past five they become wallpaper.

### Over-prototyped when

- Writing a test for it.
- Handling an error the question doesn't involve.
- Adding a second abstraction (greenfield: first one).
- Making it configurable or generalizing for unasked cases.
- Polishing looks when question was about behavior.
- Answered the question but still typing.
- Reaching for framework/bundler/dev server to fake something static.

**Stop at the verdict. The verdict is the deliverable; code is exhaust.**

## Capture the verdict, throw the code away

Record three things: **the question**, **the answer**, **what you saw that settled it** — scenario, screenshot, stdout. Evidence stops re-litigation.

Then delete from main. Keeping "in case useful" makes it load-bearing.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Prototyping well-understood thing | Answer known; tokens bought nothing. Just build it. |
| No stated question | Can't tell if succeeded; never ends. |
| No prediction before running | Nothing surprises; nothing learned. |
| Can't observe result | Moves uncertainty from design to demo. |
| Tests on prototype | If it needs tests it isn't throwaway — decide which. |
| Wiring to real DB/mutations | Question was model, not plumbing. Use scratch data. |
| Abstractions in greenfield | Generality for future the prototype exists to discover. |
| No abstraction in brownfield | Bad code fuses to system, becomes permanent. |
| Abstractions behind brownfield seam | Seam is whole budget. Behind it, keep it dumb. |
| Seam shaped around hack | Only hack satisfies it; real swap never lands. |
| Prototype promoted to production | Written with no error handling on purpose. Rewrite it. |
| Leaving on main "for reference" | Rots, confuses, stops being marked. |
| Prototyping to avoid deciding | If blocker is judgement, no code makes it. |
