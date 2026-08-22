---
name: cli-coding-subagents
description: >
  Delegate coding work to the codex and copilot CLIs as autonomous subagents, each in
  its own git worktree. Use when the user asks to use codex/copilot/CLI agents, to farm
  work out to subagents, to parallelize implementation across agents, or when a task is
  large enough that running several coding agents concurrently beats doing it in one
  session. Covers the mandatory pre-flight check (login + quota, including copilot
  paid-overage approval), exact invocation flags, keeping subagent output cheap, the
  prompt contract (acceptance criteria, critical-path tests, file ownership), and
  worktree merge + cleanup. For a whole large assignment planned and run in phases, use
  the parallel-build skill, which builds on this one.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: Drives the codex and copilot CLIs directly; needs both installed and authenticated.
---

# CLI coding subagents

Run `codex` and `copilot` as autonomous coding subagents. Each works in its own
git worktree, on its own branch, and reports back in a fixed tiny format.

**The four rules:**
1. Never dispatch without a passing pre-flight check.
2. Never let a subagent's transcript into your context — redirect to a log.
3. Never send a prompt lacking acceptance criteria, critical-path tests, and file ownership.
4. Never leave a worktree behind after merging.

**Shell state does not persist between Bash calls.** Set `SK` (and `WT`, `SLUG`,
`LOG`, …) in the same call that uses it. Locate skill rather than assuming one:

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
"$SK/scripts/precheck.sh"
```

---

## 1. Pre-flight (mandatory, every session)

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
"$SK/scripts/precheck.sh"                     # add: codex | copilot | --json
```

It prints a line per tool plus `-> action`. **Read per-tool lines** — exit code is worst status across tools. Use `--json` for per-tool codes.

| Code | Meaning | What you do |
|---|---|---|
| `0` | Logged in, quota healthy | Dispatch. |
| `10` | **Not logged in** | **Stop and ask user to log in**: `codex login` / `copilot login`. Browser OAuth flow — you cannot do it for them. Re-run precheck after they confirm. |
| `20` | **Paid overage, or quota unreadable** | **Stop and ask user before using flagged tool.** Copilot: monthly entitlement spent, further work bills paid overage, or quota unreadable — spending blind is not your call. Codex can also report 20 for unreadable quota. Quote precheck numbers, offer to route to other tool. Proceed only if they say yes. |
| `30` | Quota exhausted | Stop. Report which tool and when it resets. Offer other tool if healthy. |
| `40` | Binary missing / Node < 24 / no python3 | Stop and report. |

Exit 20 costs real money. Ask in a plain sentence, wait for answer. Approval is **session-scoped**: once yes, dispatch freely for session, but ask again in new one.

---

## 2. Pick the tool

| Work | Tool |
|---|---|
| Multi-file feature, subtle design, refactor across seams | **codex**, effort `high` |
| Hardest: concurrency, tricky algorithms, architecture, wide blast radius | **codex**, effort `xhigh` |
| Straightforward: scaffolding, mechanical edits, filling tests, docs, wiring | **copilot**, `--effort high`, `claude-sonnet-5` (default) or `gpt-5.6-sol` |
| Code review / security audit | **codex** or a Claude `Agent` |

Codex always runs `gpt-5.6-sol`, no sandbox, full permissions.
When copilot in overage, route to codex unless user says otherwise.

---

## 3. Dispatch

**Read `references/invocation.md` and copy command blocks verbatim** — verified to pass every required flag. Dropped `--dangerously-bypass-approvals-and-sandbox` makes agent hang forever; dropped `-C` makes it edit main tree instead of worktree.

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
SLUG=p2-auth
WT=$("$SK/scripts/wt.sh" new "$SLUG")
LOG="$WT/log"
codex -C "$WT" --dangerously-bypass-approvals-and-sandbox \
  --model gpt-5.6-sol --effort high \
  --output-last-message-only \
  "$(cat prompt.md)" \
  >"$LOG" 2>&1 &
```

Read only `$OUT` (codex) or `tail -40 "$LOG"` (copilot) — nothing else. Open full log only to diagnose failure. Prompt's output contract caps final message at ~200 words in fixed shape (see `references/prompt-template.md`).

**Watch for hangs.** Agent not touching status file or log in ~15 min with no commits → stuck on prompt. Check `tail -5 "$LOG"`; kill and re-dispatch with missing flag rather than waiting.

---

## 4. Write the prompt

Use `references/prompt-template.md`. Write to file and pass `"$(cat ...)"` — don't fight shell quoting with huge inline string.

Non-negotiable sections: **Acceptance criteria** (objectively checkable), **Critical-path tests** (exact commands agent must run and pass; weakening/deleting failing test not allowed), **Scope / Off-limits** (exact paths it owns, and paths concurrent agents own).

Shared files — `package.json`, lockfiles, DI containers, route registries, barrel exports, migrations — are where parallel agents collide. Assign to one agent, mark off-limits for rest. Two concurrent agents needing same file is planning bug: resplit.

---

## 5. Collect, merge, clean up

Verify **inside worktree first** — work not in your tree yet:

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
SLUG=p2-parser
WT=$("$SK/scripts/wt.sh" path "$SLUG")
(cd "$WT" && npm test)                       # critical-path tests
"$SK/scripts/wt.sh" merge "$SLUG"            # merges, then REMOVES worktree + branch
```

**Questions come back in report, not as prompts.** Subagent never blocks on prompt — nobody watching its terminal. Reports `QUESTION:` (proceeded on assumption, confirm it) or `BLOCKED:` (could not proceed). Answer by **resuming that session**, not re-dispatching — see `references/invocation.md` §Follow-ups. Batch questions from concurrent agents, ask user once.

Read agent's report before merging:
- `STATUS: DONE` → verify critical-path tests actually pass, then merge.
- `PARTIAL` / `BLOCKED` → read `BLOCKED`, decide: re-dispatch with sharper prompt, finish yourself, or merge what's good and track rest.

Merge one agent at a time, resolve conflicts as they appear.

`wt.sh` exit codes: `0` ok · `1` error · `2` **merge conflict** · `3` **merge not attempted** (main tree dirty, or merge already in progress) · `64` bad usage.

- **Exit 2** — conflict in **main working tree**, not worktree. Fix conflicted files there, `git add`, `git commit`, rerun `merge` (or `git merge --abort`). Worktree kept meanwhile.
- **Exit 3** — commit or stash your changes first; nothing merged.

`merge` refuses when worktree has uncommitted changes (removal would destroy them). **Never `git worktree remove` by hand** — use `wt.sh`, which also deletes branch, prunes, tells if removal failed instead of claiming success.

Other commands: `wt.sh list` (slug, branch, clean/UNCOMMITTED, merged state, commits ahead), `wt.sh drop <slug>` (discard unmerged), `wt.sh gc` (sweep merged worktrees; skips uncommitted), `wt.sh path <slug>`.

---

## 6. Verify before you report

Subagent saying `DONE` is a claim, not evidence. Before telling user work complete, run critical-path tests yourself on merged result. If they fail, say so with output — never report success you haven't confirmed.

---

## Failure modes

| Symptom | Cause / fix |
|---|---|
| Copilot: "requires Node.js v24 or higher" | Default node older. Run as `<node24> <copilot-js>` (precheck prints as `launch:`) — do **not** prepend Node 24 to `PATH`, or agent's `npm test` runs under wrong Node and reports phantom failures. |
| Copilot runs no tools / does nothing | Missing `--allow-all-tools` — required in non-interactive mode. |
| Agent hangs forever | Missing `--dangerously-bypass-approvals-and-sandbox` (codex) or `--no-ask-user` (copilot); blocked on prompt no one will answer. |
| Agent edited your main tree | Missing `-C "$WT"`. |
| Whole command silently lost its flags | `#` comment after line-continuation `\`. Backslash escapes space, not newline. Never comment a continued line. |
| Merge conflict between agents | Scopes overlapped. Resolve in main tree, then fix split. |
| Agent's work vanished | Never committed. Prompt's Commit section mandatory. |
| Context blown up by agent output | You read log instead of `$OUT` / `tail`. |
| `$SK`/`$WT` empty, "No such file or directory" | Shell state doesn't persist between Bash calls. Re-assign in same call. |
