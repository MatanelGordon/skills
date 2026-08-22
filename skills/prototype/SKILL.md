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

A prototype is **throwaway code that answers a question**. Two things decide
whether it was worth writing: how fast you got to the answer, and whether the
code can be removed afterwards without a fight.

*The question-shaped-prototype framing is borrowed from [Matt Pocock's prototype
skill](https://github.com/mattpocock/skills), MIT. The brownfield seam material
and the token discipline here are new. Nothing about this skill is endorsed by
him.*

---

## Write the question down first

One sentence, at the top of the prototype, somewhere a reader hits before the
code:

> **Question:** can a refund be issued twice if the webhook retries mid-capture?

A prototype that answers the wrong question is pure waste, and the only way to
notice is to have written the question down where it can be checked later. If it
can't be stated in one sentence, it isn't one question yet — split it.

Then **predict the answer before running it**. A prototype that confirms what you
already knew wasn't worth building. The value is concentrated in the runs that
surprise you, and you can only be surprised if you committed to a guess.

**You must be able to observe the result.** If you can't see what the prototype
did, it can't settle anything — it just moves the uncertainty from the design
into the demo. Print the state after every step. For UIs, driving them and
reading back what happened is its own discipline; this repo has dedicated skills
for terminal, browser and desktop interaction, and they own that half.

## Mode 1 — greenfield throwaway (default)

Standalone code that exists to be deleted.

**No abstractions. No tests. No error handling beyond what makes it run. No
persistence. One file if you can manage it.** In-memory state, hardcoded inputs,
faked async. Every one of these is a rule, not a nudge: each is a place where
"just a little more" turns a two-hour prototype into a two-day one.

When the verdict is in: fold the decision into the real code, push the prototype
to a throwaway branch off main, delete it from the working tree. If the call was
hard to reverse and will look surprising to a future reader, record it as an
architecture decision record — the reasoning outlives the code, and the code is
worth nothing.

## Mode 2 — brownfield, inside a system that already exists

The moment a prototype has to run inside a large existing codebase, "no
abstractions" becomes actively wrong. Bad code with no seam fuses to everything
it touches, and then it is permanent — not because anyone decided to keep it, but
because removing it became a refactor nobody has time for.

So the rule inverts: **deliberately bad code, behind exactly one good
abstraction.**

### 1. Define the seam before writing any prototype code

Name the interface, port or protocol that the *real* implementation will
eventually satisfy. Write that first. The shitty code implements it. Nothing
else in the system knows it is shitty.

The seam is designed against the real implementation, not the prototype. If you
shape the interface around what the hack happens to need, you get an interface
that only a hack can satisfy, and the swap never happens.

### 2. The swap must be one line

Registration, injection, or a factory — the real implementation replaces the
prototype by changing one line or flipping one flag.

**If swapping requires touching call sites, the seam is in the wrong place.**
Move it before writing anything else. This is the single check that decides
whether the prototype is removable, and it is cheap to run: ask "what do I
change to swap this out?" and count.

### 3. The shit stays shit

Greenfield says no abstractions. Brownfield says exactly one — the seam — **and
nothing more**. No layering, no premature generality, no tidy helpers *behind*
the seam. That space is meant to be embarrassing.

This tension is real and worth stating plainly rather than smoothing over: the
seam exists so the bad code can be deleted, and making the bad code nice defeats
it. A prototype that starts looking production-ready is one nobody will delete,
and the abstraction budget gets spent on the wrong side of the boundary.

### 4. Mark it loudly at the boundary

Naming convention, comment, flag name — something that makes a casual reader see
it's a prototype at the point they'd otherwise depend on it. Unmarked prototypes
become permanent by default rather than by decision.

### 5. Name the exit path in the prototype itself

What "done" looks like, and what deletes the flag. An exit path that lives only
in someone's head is not an exit path.

Seam patterns, a worked example with the one-line swap, and the named patterns
this belongs to — branch by abstraction, strangler fig, parallel change — with
sources: [references/brownfield-seams.md](references/brownfield-seams.md).

## Getting to running code fast

The fastest convincing fake per surface — backend, browser, terminal, desktop —
with commands and minimal snippets: [references/surfaces.md](references/surfaces.md).

Pick the surface from the question, not from the code you feel like writing. If
the question is genuinely ambiguous and the user isn't reachable, infer from the
surrounding code (a backend module → logic; a page → browser; a CLI → terminal)
and state the assumption at the top of the prototype.

## Token discipline

This skill exists to stop tokens being spent building the wrong thing. That
saving evaporates if the prototype itself sprawls.

| Do | Not |
|---|---|
| Mock data, inline literals | Real integrations, seeded databases |
| Hardcode | Configure, env vars, flags nobody flips |
| One file | A directory structure |
| Fake the async — return a resolved value | Real queues, retries, backoff |
| Fake the auth — a hardcoded user | A login flow |
| Copy-paste between variants | Extract a shared helper |
| Stop the moment the question is answered | "While I'm here…" |

Three variants is the useful number when comparing options. Past five they stop
being meaningfully different and start being wallpaper.

### You have over-prototyped when

- You are writing a test for it.
- You are handling an error the question doesn't involve.
- You are adding a second abstraction (greenfield: a first one).
- You are making it configurable, or generalising for a case nobody asked about.
- You are polishing how it looks when the question was about behaviour.
- You have answered the question and are still typing.
- You are reaching for a framework, bundler, or dev server to fake something
  static.

Stop at the verdict. The verdict is the deliverable; the code is exhaust.

## Capture the verdict, throw the code away

Record three things wherever the work is tracked: **the question**, **the
answer**, and **what you saw that settled it** — the scenario, the screenshot,
the stdout. The evidence is the part that stops the decision being re-litigated
in a month by someone who wasn't there.

Then delete it from main. Keeping a throwaway "in case it's useful" is exactly
how it becomes a load-bearing file nobody dares touch.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Prototyping something already well understood | The answer was known; the tokens bought nothing. Just build it. |
| No stated question | You can't tell whether it succeeded, so it never ends. |
| No prediction before running | Nothing can surprise you, so nothing is learned. |
| A prototype you can't observe | Moves the uncertainty from the design into the demo. |
| Tests on a prototype | If it needs tests it isn't throwaway — decide which it is. |
| Wiring it to the real database or real mutations | The question was the model, not the plumbing. Use scratch data, clearly named. |
| Abstractions in a greenfield prototype | Generality for a future the prototype exists to discover. |
| *No* abstraction in a brownfield prototype | The bad code fuses to the system and becomes permanent. |
| Abstractions *behind* a brownfield seam | The seam is the whole budget. Behind it, keep it dumb. |
| A seam shaped around the hack | Only a hack can satisfy it, so the real swap never lands. |
| Prototype code promoted straight to production | It was written with no error handling on purpose. Rewrite it. |
| Leaving it on main "for reference" | It rots, confuses the next reader, and stops being marked. |
| Prototyping to avoid deciding | If the blocker is a judgement call, no amount of running code makes it. |
