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

The failure this exists for is work that **looks** finished: the done report at eighty percent, the scope that quietly shrank to what was easy, the confident summary containing a number nobody checked, the long session that drifted from building into describing what it had built.

*The anti-premature-completion framing and gates-as-files idea are borrowed from [the unlazy skill](https://github.com/Leonxlnx/unlazy), MIT. The format, checker, and deliberate omission of a Stop hook are new. Nothing here is endorsed by its author.*

---

## The rule

**Prove, don't promise.** A completion claim is worth exactly as much as the command that re-establishes it. If you cannot name the command, you do not know the thing is true — you remember that it was true once.

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

Rules:
1. **Every gate has a CHECK, and the CHECK is a command.** A checkbox with prose is a wish. The checker treats a missing CHECK as a failure.
2. **The box is a claim; the CHECK is the proof.** Ticking it asserts you ran it. Re-running makes the assertion worth anything.
3. **Write gates before the work, not after.** Gates written afterwards describe what you happened to do. Gates written first describe what done means, which catches narrowed scope.
4. **A gate names an observable outcome**, not an activity. "Wrote tests for the parser" is activity. "Malformed input is rejected with a row number" is an outcome you can verify.

Task gates live beside the plan (`.plan/<name>/gates/<leaf>.md`) or in a root `GATES.md` while in flight, and are committed. Standing invariants stay in the root `GATES.md` and belong in CI.

Format details, where gates live, patterns for hard-to-check claims: [references/gates.md](references/gates.md).

## Run the checker

The checker ships with this skill. Locate it once:

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

Gate files are read relative to the **current directory** — run from the repo root (or worktree).

| Exit | Meaning |
|---|---|
| `0` | Every gate ran and passed |
| `1` | A gate failed, timed out, was refused, or is stale |
| `2` | Usage error |

There is no hook that blocks you from finishing. Enforcement that can physically prevent a turn from ending fails closed on every future task. This skill is discipline plus a checker you run. If mandatory in a repo, put `gate-check.sh` in CI.

## Decompose until leaves are checkable

Split work until each leaf is something you could gate: one coherent deliverable, one outcome, one gates file. Layers above a leaf are decomposition and integration — nothing there is "done" until its leaves are.

Fix the **contracts** first (interfaces, data ownership, naming, error conventions), and give each leaf a **fresh context**. A leaf reasoned about in a context full of other leaves gets the leftovers.

Depth does not multiply effort. Splitting deeper makes an agent treat depth as a thoroughness dial; measured cost is ~1.0–1.5×, not 8×. Decompose for **structure and checkability**, and get the effort guarantee from per-leaf gates (measured 1.6–3.9× on baseline tasks).

## Alongside `deep-plan` and `parallel-build`

`deep-plan` produces verbatim critical-path test commands, an edge-case table with status per row, and a coverage statement — **those are gates not yet written down**. Converting them costs almost nothing. Each edge-case row marked *covered* becomes one gate; each *unknown* is the gate you would otherwise have forgotten.

For `parallel-build`, the natural placement is one gates file per agent, checked before its branch merges. An agent reporting `DONE` is a claim; `gate-check.sh` run in its worktree is the evidence.

## Drift: when you have stopped working

Long runs fail by turning into narration. Signals, in rough order:
- Writing about the work more than doing it.
- Restating what you already did instead of starting the next thing.
- Remaining items are the hard ones and you keep re-planning them.
- Polishing something already passing its gate.
- About to write "should be straightforward" about work you have not done.

Recovery: name the single next unchecked gate, and do only that.

## Before you report done

1. Re-run `gate-check.sh`. Not from memory — actually run it.
2. Any `FAIL`, `TIMEOUT`, `STALE`, or `REFUSED` means not done. Say which, plainly, and name the gates.
3. Compare what shipped against the **original** ask, not your latest summary. Paraphrase drift is how scope quietly shrinks.
4. State what you deliberately left out and why. Omission stated is a decision; omission unstated is a defect.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Reporting done without re-running the checks | Reporting a memory, not a state. |
| A gate with no CHECK | An unverifiable claim, which is what this guards against. |
| Ticking a box because the work "should" pass | The tick asserts you ran it. Run it. |
| Writing gates after the work | They describe what you did, so cannot catch narrowed scope. |
| Gates that name activity, not outcome | "Wrote tests" is true even when tests assert nothing. |
| Treating an empty gates file as a pass | Manufactures exactly the false confidence being guarded against. |
| A checker that ticks its own boxes | Needs locking, corrupts under parallel agents, marks its own homework. |
| A hook that blocks the turn from ending | Fails closed on every future task; worse than the problem. |
| Splitting deeper to force more effort | Measured not to work. Split for checkability instead. |
| Deciding a failing gate was "not really required" | Renegotiating the bar at the moment it binds is how eighty percent becomes done. |
| Reporting pass rates instead of failures | "9 of 11 gates pass" buries which two, and the two are the message. |
