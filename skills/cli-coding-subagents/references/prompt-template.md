# Subagent prompt template

Every dispatch uses this shape. A prompt missing **acceptance criteria**,
**critical-path tests**, or **file ownership** is not ready to send. Those
three make the worker's output verifiable and keep its edits in scope.

Write the prompt to a file and pass it in; do not fight shell quoting with a
multi-hundred-line string.

```bash
PROMPT_FILE="$RUN_DIR/prompts/<slug>.md"
codex exec ... "$(cat "$PROMPT_FILE")" < /dev/null > "$LOG" 2>&1
```

---

## Template

````markdown
# Task: <one-line goal>

You are an autonomous coding subagent working in <an isolated git worktree |
the project directory itself, which has no git: your edits land directly>.
Implement this end to end. Do not ask questions — if something is ambiguous,
pick the most conventional option, proceed, and note the choice in your report.

## Context
<2-6 lines: what the project is, what already exists, what this task fits into.
Point at the files/dirs to read first. Do NOT paste large code — the agent can read.>

Run directory: `<absolute path outside every worktree>`
<If this is a phased build, name its plan directory and tell the worker to read
plan.md for the overall design. Everything there is READ-ONLY except the one
status file named under "Progress reporting".>

## Scope — what you own
This is an allowlist. You may create/modify/delete ONLY these paths:
- `path/one/**`
- `path/two/file.ts`
- `<absolute run directory>/agents/<slug>.md`   (your status file — see below)
- `<absolute run directory>/CR.md`   (review workers only: your findings file)

## Off-limits — other agents own these RIGHT NOW
Do NOT modify (not even imports, formatting, or "small fixes"):
- `path/three/**`      (owned by agent <slug>)
- `path/four/file.ts`  (owned elsewhere in this run)

If your task seems to require touching an off-limits path, STOP that edit, finish
everything else, and report the conflict under "Blocked" in your report.

## Acceptance criteria
The task is done when ALL of these are objectively true:
1. <observable, checkable statement — not "works well">
2. <...>
3. Existing behavior X is unchanged.

## Critical-path tests
These MUST pass before you report success. Run them yourself:
```bash
<exact command, e.g. npm test -- path/to/suite>
<exact command, e.g. npm run typecheck>
```
Write new tests for the behavior you add, covering: <the 2-4 cases that matter>.
If a critical-path test cannot pass, do not paper over it and do not weaken or
delete the test — report it under "Blocked".

## Conventions
- Follow the surrounding code's style, naming, and error handling.
- Immutable updates: return new objects, never mutate inputs.
- Small focused files over large ones.
- Validate input at boundaries; never swallow errors silently.

## Commit
<Leave this section out when the project has no git.>
Commit on the current branch (you are already on it):
```bash
git add -A && git commit -m "<type>: <description>"
```
**Commit incrementally — after each step that leaves the tests green**, not once
at the end. Long runs are sometimes killed partway; committed work survives,
uncommitted work is lost when the worktree is removed. Finish with no
uncommitted changes.

## Progress reporting (required)
Maintain your status file at this ABSOLUTE path (create parent dirs if needed):
`<absolute run directory>/agents/<slug>.md`

Write it when you start, whenever you finish a meaningful step or hit a problem,
and when you finish. Overwrite the whole file each time; keep it under 20 lines:

```
# <slug>
STARTED: <HH:MM>
STATUS: RUNNING | DONE | PARTIAL | BLOCKED
STEP: <what you are doing right now, one line>
CHANGED: <paths so far>
TESTS: <command> -> pass|fail
NOTES:
- <decisions, assumptions>
BLOCKED: <what stopped you and what you need — omit unless blocked>
```

Use those exact status words. When the run directory is a plan directory, this
file is the ONLY thing under `.plan/` you may write (a review worker may also
write the one findings file its Scope names). In every run it is the only
coordination file you may change, and it must be written at the absolute path
above — never to a copy inside your worktree, never to `PROGRESS.md` or
`plan.md`, and never to another worker's file. Concurrent writes there corrupt
the run.

## Output contract — IMPORTANT
Your terminal output is read by an orchestrator with a limited budget, so it is
expensive. Keep it minimal:
- Do NOT echo file contents, diffs, test logs, or your reasoning.
- No preamble, no summary of what you are about to do.
- Your FINAL message must be **under 200 words**, exactly this shape:

```
STATUS: DONE | PARTIAL | BLOCKED
CHANGED: <comma-separated file paths>
TESTS: <command> -> pass|fail (N passed)
NOTES: <=3 bullets — decisions made, assumptions, anything the orchestrator must know>
QUESTION: <omit unless you assumed something the orchestrator should confirm. One
           line: what you assumed, and what you would have done otherwise.>
BLOCKED: <omit unless STATUS != DONE — what stopped you and what you need>
```
````

---

## Questions and escalation

`QUESTION:` and `BLOCKED:` are different channels; do not confuse them.

| | Meaning | Work state | Orchestrator action |
|---|---|---|---|
| `BLOCKED:` | Could not proceed | stopped | must answer before anything continues |
| `QUESTION:` | Proceeded on a stated assumption | done or nearly | confirm the call before it ships |

**A subagent must never stop and wait for an answer.** Nobody is watching its
terminal; an interactive prompt is a hung process burning quota and wall-clock
until someone notices. That is why dispatch passes
`--dangerously-bypass-approvals-and-sandbox` for codex and `--no-ask-user` for
copilot. Assume, proceed, and flag.

Pick the most conventional option, and prefer the assumption that is **cheapest
to reverse**. Say which one you took in `QUESTION:`.

## Filling it in

**Acceptance criteria** must be checkable by someone who did not write the code.
"Endpoint returns 400 with `{error}` on missing `id`" is good; "handles errors
properly" is not.

**Critical-path tests** give the exact commands and the new coverage expected.
They are the worker's definition of done and the merge gate. State plainly that
weakening or deleting a failing test is not an option.

**Scope / Off-limits** lists come from the split, which the `parallel-build`
skill decides. Copy the assigned ownership into the allowlist and copy every
concurrently owned path into Off-limits.

**Context** points at files rather than pasting them. The worker has its own
context window and reads faster than you can quote.
