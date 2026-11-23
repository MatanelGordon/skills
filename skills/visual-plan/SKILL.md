---
name: visual-plan
description: >
  Use when a plan needs the user's review or sign-off. Writes two files in .plan/NAME: plan.md for the implementing agent and a short review.md for the user, with SVG diagrams, open questions and risks.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  inspired_by: https://github.com/BuilderIO/agent-native
  requires: Node.js 18+ for the bundled checker (optional)
---

# Visual plan

One plan, two files, side by side in the plan's folder: `.plan/<name>/`, or
the folder of the plan the user points you at (never a copy of it):

| File | Reader | Holds |
|---|---|---|
| `plan.md` | the implementing agent | everything: complete, exact, followed step by step |
| `review.md` | the user | the gist in at most 500 words, with SVG diagrams |

`plan.md` is the source of truth and belongs to the `deep-plan` skill.
`review.md` and `diagrams/` belong to this skill and are derived from it: a
fact that is not in the plan does not appear in the review.

## When

Use it when the user will review or approve a plan: "plan this so I can look
it over", "show me the plan", "write this up for my sign-off". It also serves
a plan already under way that the user wants to catch up on.

Skip it when the change is trivial, a diff you could describe in one sentence:
make the change. Skip it when nobody will review the plan (`plan.md` alone is
enough) and when the user wants a few sentences in chat, not a file.

## Steps

1. **Get `plan.md`.** If `.plan/<name>/plan.md` exists, or the user points at
   a plan elsewhere, read it and leave its structure alone; the review and
   `diagrams/` go in the same folder as that plan, which you neither move nor
   copy. If there is no plan, write it with `deep-plan`. Where that skill is not
   installed, write a `**Status:** draft` line and these headings, in this
   order: Goal, Out of scope, Background, Approach, Architecture, File map,
   Shared surface, Phases, Test strategy, Definition of done, Risks and
   unknowns, Decisions, Amendments. Phase steps are `- [ ]` items the
   implementer ticks, each with the command that proves it.
2. **Number what the user must settle.** When you write the plan, decide
   everything the code lets you decide. A question only the user can answer
   goes under `## Risks and unknowns` on one line:
   `- Q1: <question>: <option> or <option> -> your call; recommend <option>; default <what happens with no answer>`.
   In a plan you did not write, giving its open questions this form is the
   only edit you make.
3. **Write `review.md`** in the shape below.
4. **Draw 1 to 3 diagrams** as `diagrams/<short-name>.svg`, each linked from
   the review as `![what it shows](diagrams/<short-name>.svg)`. Every file
   starts like this, or it fails the check:

   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 240" role="img">
     <title>What the diagram shows</title>
   ```

   `references/diagrams.md` holds the full skeleton (light and dark palette)
   and the layout rules: copy it rather than starting from nothing. The first
   diagram sits under the opening sentences; any other goes beside the
   section it explains.
5. **Check. Do not hand over until it passes.** Run the checker below and fix
   every failure it prints.
6. **Hand over.** Give the user the path to `review.md`. For a draft, ask them
   to approve or to answer by id, and change no source file until they do.
   Commit the new files the way the repo treats `plan.md` (where `.plan` is
   git-ignored, that means `git add -f`).

## The checker

| Script | Purpose | Arguments |
|---|---|---|
| `scripts/check-review.mjs` | Validates the pair: both files exist, the review links the plan and its diagrams, each SVG is well-formed and self-contained, the word budget holds, every `Q<n>` and `ADR-NNNN` matches | `<plan folder>`, then optionally `--json` or `--max-words <n>` |

Run `node <this skill's folder>/scripts/check-review.mjs .plan/<name>`. It
exits 0 when clean and 1 with one line per failure. It counts the words a
reader sees: link targets, alt text and table rules are left out.

Without Node, check by hand: both files exist; every `.svg` in `diagrams/` is
linked and parses as XML (`xmllint --noout`, which must print nothing); every
`Q<n>` and `ADR-NNNN` in the plan is in the review; and the review stays near
the budget. `wc -w` also counts table bars and link targets, so it reads about
a quarter high: up to 620 is fine.

## The review file

```markdown
# <What this plan does, in plain words>

**Status:** <the plan's status> · Full plan for the agent: [plan.md](plan.md)

<One or two sentences: what will be different, and why it is worth doing.>

![<what the picture shows>](diagrams/overview.svg)

## What changes
- <3 to 6 outcomes someone will notice, one line each>

## Your call
| # | Question | Options | Recommended | If you say nothing |
|---|---|---|---|---|
| Q1 | … | … | … | … |

## Already decided
- <a choice the plan made, and why, in one line; amendments included; cite `ADR-NNNN` where one exists>

## Risks
| Risk | What the plan does about it |
|---|---|

## Not in this plan
- <what was left out on purpose>

## How we will know it worked
- <the observable signal, and the command that shows it>
```

- **Short words, short lines.** One idea per bullet, 20 words at most. No
  section repeats another. Write for a reader who was not in the conversation
  and will not open `plan.md`.
- **Real names and numbers** from the plan: files, commands, counts. Report
  the plan, not the repo, and invent nothing.
- **Copy the plan's status.** For a plan that is executing or complete, say
  what was done in the past tense, but only what the plan records as done: a
  check it does not record as run stays a check to run.
- **Every heading stays.** A section with nothing to say gets one line, such
  as "Nothing needs your decision."
- **`Your call` holds every open `Q<n>` of the plan and no other.** Each row
  gives the plan's recommendation and its default. An answered question moves
  to "Already decided", keeping its id.
- **Diagrams are linked files,** never inline `<svg>`: GitHub removes it.
- **Design standard.** Hold the page and its diagrams to the `impeccable-lite`
  skill: one dominant idea, an obvious reading order, colour only for meaning.
  Read that skill when it is installed.

## After the user answers

For each answer (`Q2: 1 hour`), rewrite that line in `plan.md` as
`- Q2: <question> -> answered <YYYY-MM-DD>: <answer>`, update the steps it
affects, and add a dated line under `## Amendments`. An unanswered question
takes its default the same way, marked "(default)". On approval set
`**Status:** approved`. Then refresh `review.md` and run the check again, so
the two files never disagree.
