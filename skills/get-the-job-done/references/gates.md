# Writing gates that actually catch things

The format, and what to do when a claim resists being turned into a command.

---

## Format

```md
# Gates: <the unit of work>

- [ ] <observable outcome, stated so it can be false>
      CHECK: <a command; non-zero exit means the gate fails>
      EVIDENCE: <optional; what you saw when it passed>
```

Parsing rules the checker relies on:

- A gate opens with a markdown checkbox at the start of a line: `- [ ]` or `- [x]`.
- `CHECK:` must be **indented** under its checkbox. Indentation is what binds it
  to the claim above.
- Everything after `CHECK:` is handed to `sh -c` verbatim, so pipes, `&&`, `!`
  and quoting all work.
- `EVIDENCE:` is for humans. The checker ignores it — it re-runs instead.
- One `CHECK` per gate. Two commands means two gates, or one command joined with
  `&&`, and joining hides which half failed. A second `CHECK` under one box is
  `REFUSED`, not silently ignored.
- Examples inside a gates file must be **fenced**. The checker skips fenced
  blocks; it has no notion of an indented code block, so a four-space-indented
  example is parsed as a real gate and its `CHECK` is executed.

Gates live in `GATES.md`, or in `gates/*.md` when one unit of work has enough
that a single file stops being readable. Both are picked up by default, and any
path can be passed explicitly:

```bash
gate-check.sh .plan/multi-tenant/gates/*.md
```

## Where they live, and what becomes of them

Two kinds, with different lifetimes:

**Task gates** — what *this* piece of work means by done. If `deep-plan` wrote a
plan, they belong beside it in `.plan/<name>/gates/<leaf>.md`, a directory that
skill already commits; otherwise `GATES.md` at the repo root while the work is in
flight. Commit them either way. A gates file that exists only on your machine
cannot hold a second agent, a reviewer, or tomorrow's session to the same bar,
which is most of the point. Kept in `.plan/`, they merge as the record of what
done meant, next to the plan that claimed it.

**Standing gates** — invariants that outlive the task: no file in `src/` over 800
lines, no debug logging in the bundle, coverage at or above 80%. These stay in
the root `GATES.md`, and that is the file worth wiring into CI. A task gate that
turns out to matter permanently gets promoted here; that is the normal way a
one-off check becomes a rule.

Under `parallel-build`, each agent's worktree needs its own gates file present in
that worktree, checked before the branch merges. Committing it on the branch is
what makes the checker runnable there at all.

## What makes a good claim

**State an outcome that can be false.** The test is whether you could imagine
the gate failing. "Improved error handling" cannot fail — there is no state of
the world it excludes. "A malformed row is rejected naming its row number" can.

| Weak | Strong |
|---|---|
| Tests added for the parser | Malformed CSV is rejected with a row number, not a stack trace |
| Performance improved | p95 import of the 50k fixture stays under 4s |
| Errors handled | A failed upload leaves no partial row in `orders` |
| Docs updated | Every exported function in `src/api/` has a JSDoc `@param` per argument |
| Refactored cleanly | No file in `src/` exceeds 800 lines |

## Patterns for hard-to-check claims

Most "you can't automate this" claims can be automated one level down.

**Absence** — grep, inverted. Non-zero exit when found:

```
CHECK: ! grep -rn "console.debug\|TODO(temp)" src/
```

**A file must exist and be non-trivial:**

```
CHECK: test -s docs/migration.md && [ "$(wc -l < docs/migration.md)" -ge 20 ]
```

**A number must move the right way** — compute and compare, don't eyeball:

```
CHECK: [ "$(jq '.total.lines.pct' coverage/summary.json | cut -d. -f1)" -ge 80 ]
```

**Reversibility / idempotence** — run it twice and diff:

```
CHECK: ./scripts/import.sh f.csv && ./scripts/import.sh f.csv && [ "$(psql -tAc 'select count(*) from orders')" -eq 100 ]
```

**A command must fail** — the gate is that the bad case is rejected:

```
CHECK: ! ./cli import --file /nonexistent 2>/dev/null
```

**Nothing regressed elsewhere** — the blunt one, and often the right one:

```
CHECK: npm test
```

## When there is genuinely no command

Some claims are real and not mechanically checkable: "the error message reads
clearly to a non-developer", "the layout feels right". Do not fake a command,
and do not silently drop the gate. Two honest options:

**Make it a human gate, marked as such.** Give it a command that is honest about
needing a person:

```md
- [ ] HUMAN: error copy reads clearly to someone who has not seen the code
      CHECK: grep -q "signed-off: " docs/copy-review.md
      EVIDENCE: reviewed by <name> 2026-08-22, reworded 3 messages
```

The check passes only once a human writes the sign-off line into a file, so the
gate reports `FAIL` until someone actually reviews it, and `PASS` afterwards
without anyone editing a checkbox on trust. Do not reach for `CHECK: false`
instead — it reports `FAIL` forever, so the file can never go green, and a gate
that is permanently red gets ignored, which is how the whole file starts getting
ignored.

Either way the run is non-zero until the review happens. That is the feature: it
cannot pass by inertia.

**Or reduce it to something adjacent that is checkable.** "Reads clearly" is not
checkable; "no error message contains a stack trace or an internal type name" is,
and it catches most of what you actually meant.

Prefer the second where it exists. A gate a machine can run gets run every time.

## Sizing

One gates file per **leaf** — a unit of work with one coherent deliverable.
Rough shape:

- Fewer than 3 gates: the leaf is probably too small to need a file, or the
  gates are too coarse to catch anything.
- More than about 12: the leaf is doing several jobs. Split it.

Gates should cover the awkward cases, not restate the happy path. If every gate
is a variation of "the main flow works", the file will pass on the day the
feature breaks for the reason nobody thought about. The planning skill's edge-case
axes — cardinality, boundaries, absence, malformed, time, concurrency, failure,
scale — are a good source: each axis marked "covered by a test" is a gate waiting
to be written down.

## Running them

Shown short here; the real path is `"$SK/scripts/gate-check.sh"`, located as in
[SKILL.md](../SKILL.md#run-the-checker). Paths to gate files are resolved from
the current directory, so run it from the repo or worktree being checked.

```bash
gate-check.sh                        # GATES.md, then gates/*.md
gate-check.sh gates/parser.md        # one leaf
gate-check.sh --only 'idempotent'    # one gate, while iterating
gate-check.sh --timeout 300          # slow suites (default 120s per check)
gate-check.sh --json                 # for another tool to consume
gate-check.sh --quiet                # exit code only
```

Results:

| Result | Meaning |
|---|---|
| `PASS` | Ran, exit 0 |
| `FAIL` | Ran, non-zero. Output tail is shown |
| `TIMEOUT` | Exceeded `--timeout`; counted as a failure |
| `STALE` | **Box was ticked, check now fails.** Regression, or ticked without running |
| `REFUSED` | Nothing runnable to trust: no CHECK, an empty CHECK, two CHECKs under one box, or a malformed checkbox. Exits `2` — unverifiable is not passed |

`--only` that matches no claim also exits `2` with "no gates found". That is the
same rule, not a special case: a filter that selects nothing has verified
nothing, and a run over an empty selection must not look like a green run.

`--only` filters gates the parser can read. A malformed checkbox has no
trustworthy claim to match against, so it is reported whatever the filter says —
which means an `--only` run can still exit `2` because of a broken gate you were
not asking about. Fix the file; the filter is for iterating, not for looking
away.

In CI, `gate-check.sh --quiet` is the whole integration: non-zero fails the
build. That is the right place for hard enforcement, because a bad gate blocks a
merge rather than blocking a person mid-task.

## Cross-platform

macOS, Linux, any POSIX shell with bash. Windows needs WSL or Git Bash. The
per-check timeout is implemented by polling rather than coreutils `timeout`,
which macOS does not ship — a checker that only enforces limits on Linux would
silently stop enforcing them on half the machines that run it.

Each check runs in its own process group, so a `TIMEOUT` kills the whole tree
rather than just the shell in front of it. Without that, a timed-out `npm test`
or `docker run` keeps going after the gate has been reported, holding ports and
CPU that the next gate then fails on for no visible reason.

The `CHECK` commands themselves are yours, so their portability is yours too. A
gate whose command only runs on one platform is a gate that quietly does not run
on the others.
