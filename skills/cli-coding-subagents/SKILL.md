---
name: cli-coding-subagents
description: >
  Use when handing a coding task to a codex, copilot or OpenRouter (ori) CLI worker: login and quota pre-flight, model choice, exact flags, prompt contract, automatic git worktree, verify, merge, cleanup. To split a job across several workers, use parallel-build first.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: codex and copilot CLIs installed and authenticated; the ori CLI and an OpenRouter credential for OpenRouter mode; bash and python3.
---

# CLI coding subagents

## Purpose

Run one autonomous coding worker through the codex, copilot, or OpenRouter
(`ori`) CLI. The worker gets a fixed prompt contract, an isolated git worktree
when possible, and a small report that the orchestrator verifies before merge.

This skill owns how to run each worker. When a job has several pieces, use the
`parallel-build` skill first to decide the split, then apply this workflow to
each worker.

## Requirements

- Bash and Python 3 on macOS or Linux. On Windows, use WSL or Git Bash.
- Native mode: installed and authenticated codex and copilot CLIs.
- OpenRouter mode: `ori` plus an OpenRouter credential; read
  [references/openrouter.md](references/openrouter.md) before using it.

## Setup

The helpers are installed with this skill, not with the project. Run the
resolver below and use the first complete copy it prints. Later command blocks
start with `SK=<the path it printed>` because shell variables do not survive
between Bash calls. Never run `./scripts/...` from the project directory.

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

Prompts, logs, and status files go in a run directory that survives a reboot
and sits outside every worktree. With a plan, use its plan directory. Without a
plan in git, use `<git common dir>/sa-runs/<name>/`; it is untracked, reachable
from every worktree, and outside `.plan/`, which `deep-plan` owns. With no git,
use `.sa-runs/<name>/` in the project. Never use `/tmp`; macOS purges it, and
the log must remain available after a crash.

## Available scripts

| Script | Purpose | Arguments |
|---|---|---|
| `precheck.sh` | Check native CLI availability, login, and quota without spending API tokens. | `[codex\|copilot\|all] [--json]` |
| `wt.sh` | Create, locate, list, merge, drop, and garbage-collect worker worktrees. | `new <slug> [base-ref]`, `path <slug>`, `list`, `merge <slug> [-F file]`, `drop <slug>`, `gc` |
| `codex-session.py` | Find the newest codex session whose recorded working directory matches a worktree. | `<worktree-path>` |
| `ori-precheck.sh` | Check `ori`, Python, and resolved OpenRouter credentials without exposing secrets. | `[--json]` |
| `ori-models.sh` | Discover current tool-capable OpenRouter author and reviewer models under a price ceiling. | `[--max-output-price D] [--min-context N] [--review-min-context N] [--json] [--all] [--free-only]` |
| `ori-codex-home.sh` | Create or repair the isolated `CODEX_HOME` used by `ori codex`. | none |

## Instructions

### 1. Pre-flight

Run pre-flight before every dispatch session:

```bash
SK=<the path it printed>
"$SK/scripts/precheck.sh"                     # add: codex | copilot | --json
```

It prints a line per tool plus an `-> action`. Read the per-tool lines: the
exit code is the worst status across tools, so "codex fine, copilot blocked"
cannot be expressed by the code alone. Use `--json` for per-tool codes.

| Code | Meaning | What you do |
|---|---|---|
| `0` | Logged in, quota healthy | Dispatch. |
| `10` | **Not logged in** | **Stop and ask the user to log in** with `codex login` or `copilot login`. You cannot complete the browser OAuth flow for them. Re-run pre-flight after they confirm. |
| `20` | **Paid overage, or quota unreadable** | **Stop and ask the user before using the flagged tool.** For copilot, the entitlement is spent and further work bills the paid overage budget, or quota could not be read. Codex can also report 20 when quota is unreadable. Quote the printed numbers and offer the other tool. Proceed only after a yes. |
| `30` | Quota exhausted | Stop. Report the tool and reset time; offer the other tool if healthy. |
| `40` | Binary missing, Node below 24, or no Python 3 | Stop and report it. |

Exit 20 is not a warning to note in passing: it can cost real money. Approval
is session-scoped. After a yes, dispatch freely for the rest of this session,
but ask again in a new one.

### 2. Pick the worker

| Work | Tool |
|---|---|
| Multi-file feature, subtle design, refactor across seams | **codex**, effort `high` |
| Hardest: concurrency, tricky algorithms, architecture, wide blast radius | **codex**, effort `xhigh` |
| Straightforward: scaffolding, mechanical edits, filling in tests, docs, wiring | **copilot**, `--effort high`, `claude-sonnet-5` by default or `gpt-5.6-sol` |
| Code review or security audit | **codex** or a Claude `Agent` |

Native codex always runs `gpt-5.6-sol`, without a sandbox and with full
permissions. In OpenRouter mode, choose the model only from `ori-models.sh`.
When copilot is in paid overage, route work to codex unless the user approves
copilot.

### 3. Worktree

Whenever the project is a git repository, give every worker its own worktree
without asking the user. A worktree starts from the last commit, so first
commit anything the worker needs to see.

```bash
SK=<the path it printed>
SLUG=p2-parser
WT=$("$SK/scripts/wt.sh" new "$SLUG")
echo "$WT"
```

If `wt.sh new` exits 4, the project is not a git repository. Do not run
`git init` without asking. Dispatch with the project directory as the working
directory, leave the Commit section out of the prompt, and tell the user the
run is not isolated. There is nothing to merge. Run workers at the same time
only on paths that do not overlap.

### 4. Prompt

Use [references/prompt-template.md](references/prompt-template.md) in full. A
prompt is not ready without objectively checkable acceptance criteria, exact
critical-path test commands, and file ownership. The Scope and Off-limits lists
come from the split decided by `parallel-build`.

Require incremental commits after each green step. Long processes are
sometimes SIGKILLed, and committed work survives while uncommitted work may be
lost when a worktree is removed.

### 5. Dispatch

Read [references/invocation.md](references/invocation.md) and copy the command
for the chosen native CLI with all flags intact. For OpenRouter, use its
reference instead.

When there are several independent pieces, dispatch them at the same time;
that is the default. The `parallel-build` skill decides how to split them.
Launch simultaneous CLI calls with `run_in_background: true` so they actually
overlap; serial `&&`-chained dispatches defeat the purpose.

Redirect the transcript to the log and read only the report: `$OUT` for codex,
or `tail -40 "$LOG"` for copilot. Open a full transcript only to diagnose
a failure. On a measured dispatch, a 1001-line transcript went to the log while
the report was 174 bytes.

Watch for hangs. If a worker has not touched its status file or log in about 15
minutes and has made no commits, inspect `tail -5 "$LOG"`. Kill and
re-dispatch with the missing flag rather than waiting on an unattended prompt.

### 6. Collect, verify, merge

Run this sequence in order for a git worktree:

```bash
SK=<the path it printed>
SLUG=p2-parser
WT=$("$SK/scripts/wt.sh" path "$SLUG")
(cd "$WT" && npm test)                       # the worker's critical-path tests
"$SK/scripts/wt.sh" merge "$SLUG"            # merges, then removes the worktree and branch
npm test                                      # the same tests on the merged branch
```

Report the work as finished only after the last run passes. A worker's
`STATUS: DONE` is a claim, not evidence.

Read the report before merging. For `PARTIAL` or `BLOCKED`, inspect `BLOCKED`
and either resume with a sharper answer, finish the work yourself, or merge the
good part and track the rest. `QUESTION:` means the worker proceeded on an
assumption; `BLOCKED:` means it could not proceed. Answer both by resuming the
same session through invocation.md's Follow-ups section. Batch questions from
concurrent workers and ask the user once.

Merge one worker at a time and resolve conflicts as they appear. `wt.sh` exit
codes are `0` ok, `1` error, `2` merge conflict, `3` merge not attempted, `4`
not a git repository, and `64` bad usage.

- Exit 2 leaves the conflict in the main working tree and keeps the worktree.
  Fix the files there, run `git add` and `git commit`, then retry `merge`; or
  use `git merge --abort` to back out.
- Exit 3 means the main tree is dirty or a merge is already in progress.
  Commit or stash the changes, or finish or abort the active merge, then retry.
- Exit 4 means no worktree is possible; follow step 3's no-git fallback.

`merge` refuses a worktree with uncommitted changes because removal would
destroy them. Never run `git worktree remove` by hand. `wt.sh` also deletes the
branch, prunes, and reports removal failures. Other commands are `wt.sh list`
(state and commits ahead), `wt.sh drop <slug>` (discard unmerged work),
`wt.sh gc` (sweep merged clean worktrees), and `wt.sh path <slug>` (locate one).

## OpenRouter mode

Use this mode when the user requests OpenRouter, `ori`, or free OpenRouter models.

> **TEMPORARY: DO NOT USE CLAUDE WITH THIS SKILL.** `ori claude` is not working
> currently. Use `ori codex` only until this warning is removed.

Read [references/openrouter.md](references/openrouter.md) before dispatch. Differences:

- Run its own pre-flight before model discovery.
- Get the model from `ori-models.sh`, never from memory.
- Launch codex with the isolated `CODEX_HOME` prepared by its helper.
- Put the `ori` `--model` flag before `--`.
- Enforce both mandatory review gates.
- Run only two or three workers at once on free models.
- Cap each worker at 750K tokens using the `HANDOFF.md` protocol.

## Examples

Apply the six steps to every chosen worker.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Copilot says it requires Node.js v24 or higher | Run it as `<node24> <copilot-js>` from pre-flight's `launch:` line. Do not prepend Node 24 to `PATH`, because the worker's tests would inherit a runtime the project may not target and report phantom failures. |
| Copilot runs no tools or does nothing | `--allow-all-tools` is missing; it is required in non-interactive mode. |
| Worker hangs forever | Codex lacks `--dangerously-bypass-approvals-and-sandbox`, or copilot lacks `--no-ask-user`; it is waiting for a person who is not watching. |
| Worker edited the main tree | `-C "$WT"` was missing. |
| A continued command silently lost flags | A `#` comment followed a line-continuation backslash. The backslash escaped the space instead of the newline. Never comment a continued line. |
| Merge conflict between workers | Their scopes overlapped. Resolve it in the main tree, then correct the split. |
| Work vanished | The worker did not commit. The prompt's Commit section is mandatory for worktree runs. |
| Context filled with worker output | Follow step 5's report-only rule. |
| `$SK` or `$WT` is empty, or a command says “No such file or directory” | Re-run Setup and replace the placeholders with the absolute values it prints or creates. |

## Limitations

Availability changes; re-run every per-session check.
