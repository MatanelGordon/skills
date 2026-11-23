---
name: cli-coding-subagents
description: >
  Use when handing a coding task to a codex, copilot or OpenRouter (ori) CLI worker, on free or cheap models too, or answering a worker's question. Covers quota pre-flight, model, flags, prompt, automatic git worktree, verify, merge. To split a job across workers, use parallel-build first.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: codex and copilot CLIs installed and authenticated; the ori CLI and an OpenRouter credential for OpenRouter mode; bash and python3.
---

# CLI coding subagents

## Purpose

Run one autonomous coding worker through the codex, copilot, or OpenRouter
(`ori`) CLI: its own git worktree, a fixed prompt contract, and a short report
that you verify before merging.

This skill owns how to run each worker. When a job has several pieces, use the
`parallel-build` skill first to decide the split, then apply this workflow to
each worker.

**The five rules:**

1. Never dispatch without a passing pre-flight check.
2. Every worker gets its own git worktree whenever the project is a git
   repository. Create it automatically; the user does not have to ask.
3. Never send a prompt lacking acceptance criteria, critical-path tests, and
   file ownership.
4. Never let a worker's transcript into your context. Redirect it to a log.
5. Never leave a worktree behind after merging.

## Requirements

- Bash and Python 3 on macOS or Linux. On Windows, use WSL or Git Bash.
- Native mode: installed and authenticated codex and copilot CLIs.
- OpenRouter mode: `ori` plus an OpenRouter credential; read
  [references/openrouter.md](references/openrouter.md) before using it.

## Setup

The helpers are installed with this skill, not with the project. If you know
the directory this `SKILL.md` was read from and its `scripts/` holds all six
helpers, that directory is `SK`. Otherwise run the resolver below once. It
prints the directory of the first complete copy of this skill. Every later command block starts with `SK=/path/printed/by/setup`:
replace that with the path the resolver printed. Shell variables do not survive
between Bash calls, so set `SK`, `WT`, `SLUG`, `RUN_DIR`, `LOG` and `OUT` in the
same call that uses them, or use absolute paths, and copy each block whole. Never run `./scripts/...` from
the project directory.

```bash
SK=$(for root in "$HOME/.claude/skills" "${CODEX_HOME:-$HOME/.codex}/skills" "$HOME/.codex/skills" \
                 "$HOME/.copilot/skills" "$HOME/.agents/skills" "$HOME/.tabnine/agent/skills"; do
  dir="$root/cli-coding-subagents"; complete=yes
  for helper in precheck.sh wt.sh codex-session.py ori-precheck.sh ori-models.sh ori-codex-home.sh; do
    [ -x "$dir/scripts/$helper" ] || complete=no
  done
  [ "$complete" = yes ] && { echo "$dir"; break; }
done)
[ -n "$SK" ] || { echo "cli-coding-subagents: no complete copy found; reinstall the whole skill directory" >&2; exit 40; }
echo "$SK"
```

Prompts, logs and status files go in a **run directory**, one per run: the
plan directory in a phased build, otherwise the one this prints (never `/tmp`,
which macOS purges):

```bash
SK=/path/printed/by/setup
RUN_DIR=$("$SK/scripts/wt.sh" rundir upload-retries) || exit 1   # example name; prints the path
```

Where it lives and why it is never added to git:
[references/worktrees.md](references/worktrees.md).

## Available scripts

| Script | Purpose | Arguments |
|---|---|---|
| `precheck.sh` | Check native CLI availability, login, and quota without spending API tokens. | `[codex\|copilot\|all] [--json]` |
| `wt.sh` | Create, locate, list, merge, drop, and garbage-collect worker worktrees; create a run directory. | `new <slug> [base-ref]`, `path <slug>`, `list`, `merge <slug> [-F file]`, `drop <slug>`, `gc`, `rundir <name>` |
| `codex-session.py` | Find the newest codex session whose recorded working directory matches a worktree. | `<worktree-path>` |
| `ori-precheck.sh` | Check `ori`, Python, and resolved OpenRouter credentials without exposing secrets. | `[--json]` |
| `ori-models.sh` | Discover current tool-capable OpenRouter author and reviewer models under a price ceiling. | `[--max-output-price D] [--min-context N] [--review-min-context N] [--json] [--all] [--free-only]` |
| `ori-codex-home.sh` | Create or repair the isolated `CODEX_HOME` used by `ori codex`. | none |

## Instructions

### 1. Pre-flight

Run pre-flight before every dispatch session:

```bash
SK=/path/printed/by/setup
"$SK/scripts/precheck.sh"                     # add: codex | copilot | --json
```

It prints a line per tool plus an `-> action`. Read the per-tool lines: the
exit code is the worst status across tools, so "codex fine, copilot blocked"
cannot be expressed by the code alone. Use `--json` for per-tool codes.

| Code | Meaning | What you do |
|---|---|---|
| `0` | Logged in, quota healthy | Dispatch. |
| `10` | **Not logged in** | **Stop and ask the user to log in** with `codex login` or `copilot login`. You cannot complete the browser OAuth flow for them. Re-run pre-flight after they confirm. |
| `20` | **Paid overage, or quota unreadable** | **Stop and ask the user before using the flagged tool.** For copilot, the entitlement is spent and further work bills the paid overage budget, or quota could not be read; spending blind is not your call. Codex can also report 20 when quota is unreadable. Quote the printed numbers and offer the other tool. Proceed only after a yes. |
| `30` | Quota exhausted | Stop. Report the tool and reset time; offer the other tool if healthy. |
| `40` | Binary missing, Node below 24, or no Python 3 | Stop and report it. |

Exit 20 is not a warning to note in passing: it costs the user real money. Ask in a
plain sentence and wait. A general instruction given before the pre-flight ran
("just dispatch") is not that yes: the user had not seen the figures. Approval
is session-scoped. After a yes, dispatch freely for the rest of this session,
but ask again in a new one.

### 2. Pick the worker

| Work | Tool |
|---|---|
| Multi-file feature, subtle design, refactor across seams | **codex**, effort `high` |
| Hardest: concurrency, tricky algorithms, architecture, wide blast radius | **codex**, effort `xhigh` |
| Straightforward: scaffolding, mechanical edits, filling in tests, docs, wiring | **copilot**, `--effort high`, `claude-sonnet-5` by default or `gpt-5.6-sol` |
| Code review or security audit | **codex** or a Claude `Agent`: it needs judgment |

Native codex always runs `gpt-5.6-sol`, without a sandbox and with full
permissions. In OpenRouter mode the model comes from a listing made at run
time, as that section describes, never from this table.
When copilot is in paid overage, offer codex for the work and use copilot only
after the user says yes to the overage (step 1, code 20).

### 3. Worktree

Whenever the project is a git repository, every worker gets its own worktree.
Create it automatically, as part of every dispatch; the user does not have to
request it. A worktree starts from the last commit, so the worker does not see
uncommitted changes. If it needs them, ask the user whether to commit them
first; otherwise say in the prompt what is missing.

```bash
SK=/path/printed/by/setup
SLUG=p2-parser                              # example slug: [a-zA-Z0-9._-]
WT=$("$SK/scripts/wt.sh" new "$SLUG")
echo "$WT"
```

If `wt.sh new` exits 4, the project is not a git repository: no worktree and
no `git init` unless the user agrees. The worker runs in the project directory
and you tell the user so; the rest of that fallback is in
[references/worktrees.md](references/worktrees.md).

### 4. Prompt

Use [references/prompt-template.md](references/prompt-template.md) in full. A
prompt is not ready without objectively checkable acceptance criteria, exact
critical-path test commands, and file ownership. For a single worker, Scope is
the paths the task needs. When several workers run at once, Scope and
Off-limits come from the split that `parallel-build` decides.

Require incremental commits after each green step. Long processes are
sometimes SIGKILLed, and committed work survives while uncommitted work may be
lost when a worktree is removed.

### 5. Dispatch

Read [references/invocation.md](references/invocation.md) and copy the command
for the chosen native CLI with all flags intact. For OpenRouter, use its
reference instead.

Dispatch in the background (`run_in_background: true`), even a single worker,
so you can keep working while it runs. When there are several independent
pieces, dispatch them at the same time; that is the default, and the
`parallel-build` skill decides how to split them. Serial `&&`-chained
dispatches defeat the purpose.

Redirect the transcript to the log and read only the report: `$OUT` for codex,
or `tail -40 "$LOG"` for copilot. Open a full transcript only to diagnose
a failure. On a measured dispatch, a 1001-line transcript went to the log while
the report was 174 bytes.

Watch for hangs. A worker whose log and status file have not changed for about
15 minutes, with no new commits, is probably blocked on a prompt because a flag
is missing: stop it and dispatch again with the flag ("Watching a running
worker" in invocation.md). A worker whose process was killed partway is resumed
instead ("Long runs get killed" there).

### 6. Collect, verify, merge

Verify **inside the worktree** first: the work is not in your tree yet, so a
test run in the main tree before the merge passes on the old code and proves
nothing. Then merge, then test again. In order:

```bash
SK=/path/printed/by/setup
SLUG=p2-parser                               # example slug
WT=$("$SK/scripts/wt.sh" path "$SLUG") || exit 1
(cd "$WT" && npm test) || exit 1             # npm test stands for the worker's critical-path tests
"$SK/scripts/wt.sh" merge "$SLUG" || exit 1  # merges, then removes the worktree and branch
npm test                                     # the same tests on the merged branch
```

Read the worker's report before this block. `STATUS: DONE` is a claim, not
evidence: the block above is how you check it, and the work is finished only
after the last run passes. If a run fails, say so and show the output; never
report success you have not confirmed. On `PARTIAL` or `BLOCKED`, read
`BLOCKED`, then re-dispatch with a sharper prompt, finish it yourself, or merge
what is good and track the rest.

**Questions come back in the report, not as prompts.** `QUESTION:` means the
worker proceeded on an assumption and wants it confirmed; `BLOCKED:` means it
could not proceed. Answer either by resuming that session, not by
re-dispatching. For codex, `codex-session.py <worktree>` finds the session id
by matching the worktree path (never `--last`); the commands are under
"Follow-ups" in [references/invocation.md](references/invocation.md). Batch
questions from concurrent workers and ask the user once.

Merge one worker at a time. Never run `git worktree remove` by hand: `wt.sh`
also deletes the branch, prunes, and reports a removal that failed. When
`wt.sh` exits non-zero (`2` conflict, `3` merge not attempted, `4` not a git
repository), follow its recovery in
[references/worktrees.md](references/worktrees.md).

## OpenRouter mode

Run the same six steps through OpenRouter with the `ori` CLI when the user asks
for OpenRouter, `ori`, free or cheap models, lower subagent cost, or a specific
OpenRouter model, and when free-model work stalls on rate limits, dropped tool
calls, or a model that vanished mid-run.

> **TEMPORARY: do not dispatch workers with `ori claude`.** It is not working
> currently. Use `ori codex` only until this warning is removed. (This is about
> the `ori claude` harness, not about which agent reads this skill.)

Read [references/openrouter.md](references/openrouter.md) before dispatch. Differences:

- Pre-flight is `ori-precheck.sh`. On exit 10 stop and ask the user to run
  `ori login`; never attempt the browser login yourself.
- The model comes from `ori-models.sh` at the start of every run, never from
  memory. Its default is a ceiling of 0.50 USD per 1M output tokens, not
  free-only, and it checks the wallet before listing paid models. The 20
  requests/minute cap is free-tier only, so a few cents escapes it; use
  `--free-only` only when spending nothing is a hard requirement. Raising the
  ceiling is the user's decision.
- Codex launches with the isolated `CODEX_HOME` that `ori-codex-home.sh` prepares.
- `--model` is an `ori` flag and goes before the `--`.
- These models are not trusted: a different model reviews every code change
  and every plan before anything merges.
- On free models run two or three workers at once, not eight.
- Each subagent has a 750K-token ceiling, in iterations of about 150K that
  hand off through `HANDOFF.md`.

## Examples

- **"Have codex add retry logic to the uploader while I review the API."**
  One worker. Pre-flight, worktree `upload-retries`, a prompt with acceptance
  criteria, test command and owned paths, a background codex dispatch at `high`
  logging to a file. Then the report, tests in the worktree, merge, tests again.
- **Pre-flight prints copilot at code 20.** Stop. Quote the overage figures it
  printed, ask whether to bill them, and offer codex for the same work.
- **A report ends with `QUESTION: assumed the v2 schema.`** Resume that
  worker's session with the answer. Do not dispatch a new worker.
- **"Run these on free OpenRouter models."** OpenRouter mode: read its
  reference, run `ori-precheck.sh`, then `ori-models.sh --free-only`.
- **The folder is not a git repository** (`wt.sh new` exits 4). No worktree and
  no `git init`: the worker edits the project directory, and you say so.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Worker hangs, does nothing, edits the main tree, or a command lost its flags | A dispatch flag is missing or was cut off: see "Troubleshooting" in invocation.md. |
| Merge conflict between workers | Their scopes overlapped. Resolve it in the main tree, then correct the split. |
| Work vanished | The worker did not commit. The prompt's Commit section is mandatory for worktree runs. |
| Context filled with worker output | Follow step 5's report-only rule. |
| `$SK` or `$WT` is empty, or a command says “No such file or directory” | Re-run Setup and replace the placeholders with the absolute values it prints or creates. |

## Limitations

- This skill runs workers. It does not decide how to split a job
  (`parallel-build`) or write the plan (`deep-plan`).
- Native codex runs without a sandbox and with full permissions. The worktree
  and the prompt's Scope list are conventions the worker is told to respect,
  not a fence it cannot cross.
- The pre-flight reads login and quota. It does not test the connection: a
  dispatch can still stall on the network, which is why step 5 watches the log.
- Copilot quota comes from an undocumented GitHub endpoint. When it cannot be
  read, the pre-flight asks (code 20) rather than assuming headroom.
- OpenRouter rate limits are published figures, not measured here; the 750K
  ceiling is kept by structure, not by a token count.
