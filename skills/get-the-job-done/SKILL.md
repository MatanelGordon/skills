---
name: get-the-job-done
description: >
  Finish the whole job and prove it, instead of reporting done at eighty percent.
  Use before saying a task is complete, when writing a summary that claims work
  finished, and whenever the user asks "is it done", "did you finish", "are you
  sure", or "did you actually test it". Use when scope has quietly narrowed, when
  a long run has drifted into summarising instead of working, when acceptance
  criteria exist but nobody re-ran them, and when picking up work someone else
  called finished. Use when anyone proposes skipping a failing check, ticking a
  box that was not run, lowering a bar to go green, or calling a requirement
  optional at the moment it starts to bind. Turns completion claims into GATES.md entries with a runnable
  CHECK behind each one, and ships a checker that re-runs them, so a ticked box
  that has since become false is caught rather than believed. Inspired by the
  unlazy skill.
license: MIT
metadata:
  author: Matanel Gordon
  inspired_by: https://github.com/Leonxlnx/unlazy
  source: https://github.com/MatanelGordon/skills
---

# Get the job done

The failure this exists for is not refusing to work. It is work that **looks**
finished: the done report at eighty percent, the scope that quietly shrank to
what was easy, the confident summary containing a number nobody checked, the long
session that drifted from building into describing what it had built.

*The anti-premature-completion framing and the gates-as-files idea are borrowed
from [the unlazy skill](https://github.com/Leonxlnx/unlazy), MIT. The format
here, the checker, and the deliberate omission of a Stop hook are new. Nothing
about this skill is endorsed by its author.*

---

## The rule

**Prove, don't promise.** A completion claim is worth exactly as much as the
command that re-establishes it. If you cannot name the command, you do not know
the thing is true — you remember that it was true once.

This is the same instinct as refusing to trust a subagent's `DONE`: a claim is
not evidence. Applied to yourself, it means the last thing you do before
reporting is re-run the checks, not re-read your own notes.

## GATES.md

A gate is a claim plus the command that proves it:

```md
# Gates: import pipeline

- [ ] Malformed CSV is rejected with a row number, not a stack trace
      CHECK: npm test -- test/import/malformed.spec.ts
- [ ] No debug logging reaches the bundle
      CHECK: ! grep -rn "console.debug" src/
- [x] Re-importing the same file is idempotent
      CHECK: ./scripts/verify-idempotent.sh fixtures/orders.csv
      EVIDENCE: 2026-08-22, exit 0, 0 duplicate rows on second run
```

Rules that make it work:

1. **Every gate has a CHECK, and the CHECK is a command.** A checkbox with prose
   underneath is a wish. The checker treats a missing CHECK as a failure, not as
   a pass, because an unverifiable claim is the exact thing being guarded against.
2. **The box is a claim; the CHECK is the proof.** Ticking it asserts you ran it.
   Re-running is what makes the assertion worth anything.
3. **Write gates before the work, not after.** Gates written afterwards describe
   what you happened to do. Gates written first describe what done means, which
   is the only version that can catch a narrowed scope.
4. **A gate names an observable outcome**, not an activity. "Wrote tests for the
   parser" is activity. "Malformed input is rejected with a row number" is an
   outcome, and you can tell whether it holds.

Task gates live beside the plan (`.plan/<name>/gates/<leaf>.md`) or in a root
`GATES.md` while the work is in flight, and are committed — a bar only you can
see holds nobody else to it. Standing invariants stay in the root `GATES.md` and
belong in CI.

Format details, where gates live, patterns for hard-to-check claims, and how to
gate things with no natural command: [references/gates.md](references/gates.md).

## Run the checker

The checker ships with this skill, which lives in whichever agent's skills
directory installed it — not in the repo you are working on. Locate it once:

```bash
SK=$(ls -d "$HOME"/.claude/skills/get-the-job-done "$HOME"/.codex/skills/get-the-job-done \
        "$HOME"/.copilot/skills/get-the-job-done "$HOME"/.agents/skills/get-the-job-done \
        "$HOME"/.tabnine/agent/skills/get-the-job-done 2>/dev/null | head -1)

"$SK/scripts/gate-check.sh"                      # ./GATES.md, then ./gates/*.md
"$SK/scripts/gate-check.sh" path/to/GATES.md
"$SK/scripts/gate-check.sh" --only 'idempotent'  # one gate while iterating
"$SK/scripts/gate-check.sh" --timeout 300        # slow suites (default 120s)
"$SK/scripts/gate-check.sh" --quiet              # exit code only, for CI
"$SK/scripts/gate-check.sh" --json               # machine-readable
```

Gate files are read relative to the **current directory**, so run it from the
repo root (or the worktree) whose gates you are checking.

| Exit | Meaning |
|---|---|
| `0` | Every gate ran and passed |
| `1` | A gate failed, **or a ticked box turned out to be false** |
| `2` | No gates found, or a gate the checker refuses to trust |
| `40` | No readable gates file |
| `64` | Bad usage |

`REFUSED` is the label for anything unverifiable: a claim with no CHECK, an
empty CHECK, two CHECKs under one box, a typo'd checkbox. All of them exit `2`,
and `2` wins over `1` — an ambiguous file is a worse state than a failing gate,
because you cannot tell what it was supposed to prove.

**An empty gates file exits `2`, not `0`.** A checker that reports success over
zero gates is worse than no checker, because it manufactures the false confidence
the whole skill exists to prevent.

The `STALE` result is the one worth watching for: a box ticked earlier whose
check now fails. That is either a regression, or a box that was ticked on a
promise rather than a run. Both are worth knowing before you report.

### Two deliberate design decisions

**The checker never writes.** It does not tick boxes and does not record
evidence. That is what makes it safe to run from several agents in parallel
worktrees simultaneously — a checker that mutates the file it checks needs
locking, and locking that is subtly wrong corrupts the one artifact you trust.
Verified: six concurrent runs over one gates file leave it byte-identical and
return identical results.

So ticking the box and writing its `EVIDENCE:` line is your job, done after a run
you watched. That is not an oversight to automate away: a tick you place
deliberately is a claim someone made, which is the thing `STALE` can later
contradict. A tick the checker placed itself would only ever mean "the check
passed when it passed", which is what the checker already tells you.

**There is no hook that blocks you from finishing.** Enforcement that can
physically prevent a turn from ending is tempting and is the wrong trade: a
blocker you cannot cleanly remove is a worse failure than the premature "done" it
was meant to catch, because it fails closed on every future task. This skill is
discipline plus a checker you run. If it needs to be mandatory in a repo, put
`gate-check.sh` in CI, where a bad gate blocks a merge instead of a person.

## Decompose until leaves are checkable

Split work until each leaf is something you could gate: one coherent deliverable,
one outcome, one gates file. Layers above a leaf are decomposition and
integration — no real work happens there, so nothing there is "done" until its
leaves are.

Two things worth doing before any fan-out: fix the **contracts** (interfaces,
data ownership, naming, error conventions), and give each leaf a **fresh
context**. A leaf reasoned about in a context already full of four other leaves
gets the leftovers.

**Depth does not multiply effort.** It is tempting to believe that splitting a
task deeper makes an agent work proportionally harder. Measurement says
otherwise — the unlazy author's own six-run test found models treat depth as a
thoroughness dial and largely ignore the arithmetic, with a six-layer tree
costing roughly 1.0–1.5× a three-layer one rather than eight times. So decompose
for **structure and checkability**, which genuinely helps, and get the effort
guarantee from per-leaf gates instead, which is where it can actually be
enforced — the same author measures gate discipline moving effort 1.6–3.9× on
baseline tasks, the thing depth alone did not do.

## Alongside `deep-plan` and `parallel-build`

`deep-plan` already produces the raw material: verbatim critical-path test
commands, an edge-case table with a status per row, and a coverage statement.
**Those are gates that have not been written down as gates yet.** Converting them
costs almost nothing and turns a plan's acceptance criteria into something
runnable. Each edge-case row marked *covered* becomes one gate; each row marked
*unknown* is the gate you would otherwise have forgotten.

For `parallel-build`, the natural placement is one gates file per agent, checked
before its branch merges rather than after everything lands. An agent reporting
`DONE` is a claim; `gate-check.sh` run in its worktree is the evidence. This
composes with that skill's existing rule to run critical-path tests yourself at
the merge — gates make "the tests" a specific, enumerated list instead of a
habit. The checker never writes, so several agents can check their own worktrees
at once.

Neither skill is required. This one works standalone on any task big enough that
you might otherwise stop early.

## Drift: when you have stopped working

Long runs fail by turning into narration. Signals, in rough order of severity:

- You are writing about the work more than doing it.
- You are restating what you already did instead of starting the next thing.
- The remaining items are the hard ones and you keep re-planning them.
- You are polishing something already passing its gate.
- You are about to write "should be straightforward" about work you have not done.

The recovery is mechanical: name the single next unchecked gate, and do only that.

## Before you report done

1. Re-run `gate-check.sh`. Not from memory — actually run it.
2. Any `FAIL`, `TIMEOUT`, `STALE`, or `REFUSED` means not done. Say which,
   plainly, and name the gates rather than the count.
3. Compare what shipped against the **original** ask, not your latest summary of
   it. Paraphrase drift is how scope quietly shrinks.
4. State what you deliberately left out and why. Omission stated is a decision;
   omission unstated is a defect.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Reporting done without re-running the checks | You are reporting a memory, not a state. |
| A gate with no CHECK | An unverifiable claim, which is what this guards against. |
| Ticking a box because the work "should" pass | The tick asserts you ran it. Run it. |
| Writing gates after the work | They describe what you did, so they cannot catch a narrowed scope. |
| Gates that name activity, not outcome | "Wrote tests" is true even when the tests assert nothing. |
| Treating an empty gates file as a pass | Manufactures exactly the false confidence being guarded against. |
| A checker that ticks its own boxes | Needs locking, corrupts under parallel agents, and marks its own homework. |
| A hook that blocks the turn from ending | Fails closed on every future task; worse than the problem. |
| Splitting deeper to force more effort | Measured not to work. Split for checkability instead. |
| Deciding a failing gate was "not really required" | Renegotiating the bar at the moment it binds is how eighty percent becomes done. |
| Reporting pass rates instead of failures | "9 of 11 gates pass" buries which two, and the two are the message. |
