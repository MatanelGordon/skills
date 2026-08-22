---
name: cli-coding-subagents
description: >
  Delegate coding work to codex and copilot CLIs as autonomous subagents in separate git worktrees. Use when the user asks for codex/copilot/CLI agents, farming work out, parallel implementation, or concurrent agents clearly beat one session. Covers mandatory login/quota pre-flight (including copilot paid-overage approval), exact flags, cheap output, prompts with acceptance criteria/critical-path tests/file ownership, and worktree merge/cleanup. For whole phased assignments, use parallel-build.
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
2. Never let a subagent's transcript into your context — redirect it to a log.
3. Never send a prompt lacking acceptance criteria, critical-path tests, and file ownership.
4. Never leave a worktree behind after merging.

**Shell state does not persist between Bash calls.** Set `SK` (and `WT`, `SLUG`,
`LOG`, …) in the same call that uses it. This skill may be installed under any
agent's skills directory, so locate it rather than assuming one:

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

It prints a line per tool plus an `-> action`. **Read the per-tool lines** — the
exit code is the worst status across tools, so "codex fine, copilot blocked"
cannot be expressed by the code alone. Use `--json` for per-tool codes.

| Code | Meaning | What you do |
|---|---|---|
| `0` | Logged in, quota healthy | Dispatch. |
| `10` | **Not logged in** | **Stop and ask the user to log in**: `codex login` / `copilot login`. You cannot do this for them — it is a browser OAuth flow. Re-run precheck after they confirm. |
| `20` | **Paid overage, or quota unreadable** | **Stop and ask the user before using the flagged tool.** For copilot this means their monthly entitlement is spent and further work bills the paid overage budget, or quota could not be read — spending blind is not your call. Codex can also report 20 when its quota is unreadable. Quote the numbers precheck printed and offer to route the work to the other tool. Proceed only if they say yes. |
| `30` | Quota exhausted | Stop. Report which tool and when it resets. Offer the other tool if it is healthy. |
| `40` | Binary missing / Node < 24 / no python3 | Stop and report. |

Exit 20 is not a warning to note in passing — it costs the user real money. Ask,
in a plain sentence, and wait for an answer. Approval is **session-scoped**: once
they say yes, dispatch freely for the rest of this session, but ask again in a new
one.

---

## 2. Pick the tool

| Work | Tool |
|---|---|
| Multi-file feature, subtle design, refactor across seams | **codex**, effort `high` |
| Hardest: concurrency, tricky algorithms, architecture, wide blast radius | **codex**, effort `xhigh` |
| Straightforward: scaffolding, mechanical edits, filling in tests, docs, wiring | **copilot**, `--effort high`, `claude-sonnet-5` (default) or `gpt-5.6-sol` |
| Code review / security audit | **codex** or a Claude `Agent` |

Codex always runs `gpt-5.6-sol`, no sandbox, full permissions.
When copilot is in overage, route everything to codex unless the user says otherwise.

---

## 3. Dispatch

**Read `references/invocation.md` and copy its command blocks verbatim** — they
are verified to pass every required flag. A dropped
`--dangerously-bypass-approvals-and-sandbox` makes the agent hang forever; a
dropped `-C` makes it edit your main tree instead of its worktree.

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
SLUG=p2-parser
WT=$("$SK/scripts/wt.sh" new "$SLUG")        # worktree + branch sa/$SLUG
echo "$WT"
```

Then dispatch per `invocation.md`, writing logs to `$PLAN_DIR/logs/$SLUG.log`
(not `/tmp` — macOS purges it, and you want the log after a crash).

**Run concurrent dispatches in the background** so they actually overlap — launch
each with `run_in_background: true` and collect them as they finish. Serial
`&&`-chained dispatches defeat the entire purpose.

**Keep output cheap.** Two levers, use both:
- Redirect the transcript to `$LOG`. Read `$OUT` (codex) or `tail -40 "$LOG"`
  (copilot) — nothing else. Open the full log only to diagnose a failure.
- The prompt's output contract caps the final message at ~200 words in a fixed
  shape. See `references/prompt-template.md`.

**Watch for hangs.** An agent that has not touched its status file or log in
~15 minutes with no commits is probably stuck on a prompt. Check
`tail -5 "$LOG"`; kill and re-dispatch with the missing flag rather than waiting.

---

## 4. Write the prompt

Use `references/prompt-template.md`. Write it to a file and pass `"$(cat ...)"` —
do not fight shell quoting with a huge inline string.

Non-negotiable sections: **Acceptance criteria** (objectively checkable),
**Critical-path tests** (exact commands the agent must run and pass; weakening or
deleting a failing test is not allowed), **Scope / Off-limits** (exact paths it
owns, and the paths concurrent agents own).

Shared files — `package.json`, lockfiles, DI containers, route registries, barrel
exports, migrations — are where parallel agents collide. Assign them to one agent
and mark them off-limits for the rest. Two concurrent agents needing the same file
is a planning bug: resplit.

---

## 5. Collect, merge, clean up

Verify **inside the worktree** first — the work is not in your tree yet:

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
SLUG=p2-parser
WT=$("$SK/scripts/wt.sh" path "$SLUG")
(cd "$WT" && npm test)                       # the critical-path tests
"$SK/scripts/wt.sh" merge "$SLUG"            # merges, then REMOVES worktree + branch
```

**Questions come back in the report, not as prompts.** A subagent never blocks on
a prompt — nobody is watching its terminal. It reports `QUESTION:` (proceeded on
an assumption, confirm it) or `BLOCKED:` (could not proceed). Answer either by
**resuming that session**, not re-dispatching — see `references/invocation.md`
§Follow-ups. Batch questions from concurrent agents and ask the user once.

Read the agent's report before merging:
- `STATUS: DONE` → verify the critical-path tests actually pass, then merge.
- `PARTIAL` / `BLOCKED` → read `BLOCKED`, decide: re-dispatch with a sharper
  prompt, finish it yourself, or merge what is good and track the rest.

Merge one agent at a time and resolve conflicts as they appear.

`wt.sh` exit codes: `0` ok · `1` error · `2` **merge conflict** · `3` **merge not
attempted** (main tree dirty, or a merge already in progress) · `64` bad usage.

- **Exit 2** — the conflict is in your **main working tree**, not the worktree.
  Fix the conflicted files there, `git add`, `git commit`, then rerun `merge`
  (or `git merge --abort` to back out). The worktree is kept meanwhile.
- **Exit 3** — commit or stash your own changes first; nothing was merged.

`merge` refuses when the worktree has uncommitted changes (removal would destroy
them). **Never `git worktree remove` by hand** — use `wt.sh`, which also deletes
the branch, prunes, and tells you if removal failed instead of claiming success.

Other commands: `wt.sh list` (slug, branch, clean/UNCOMMITTED, merged state,
commits ahead), `wt.sh drop <slug>` (discard unmerged), `wt.sh gc` (sweep merged
worktrees; skips any with uncommitted work), `wt.sh path <slug>`.

---

## 6. Verify before you report

A subagent saying `DONE` is a claim, not evidence. Before telling the user the
work is complete, run the critical-path tests yourself on the merged result. If
they fail, say so with the output — never report success you have not confirmed.

---

## Failure modes

| Symptom | Cause / fix |
|---|---|
| Copilot: "requires Node.js v24 or higher" | Default node is older. Run it as `<node24> <copilot-js>` (precheck prints this as `launch:`) — do **not** prepend Node 24 to `PATH`, or the agent's own `npm test` runs under the wrong Node and reports phantom failures. |
| Copilot runs no tools / does nothing | Missing `--allow-all-tools` — required in non-interactive mode. |
| Agent hangs forever | Missing `--dangerously-bypass-approvals-and-sandbox` (codex) or `--no-ask-user` (copilot); it is blocked on a prompt no one will answer. |
| Agent edited your main tree | Missing `-C "$WT"`. |
| Whole command silently lost its flags | A `#` comment after a line-continuation `\`. The backslash escapes the space, not the newline. Never comment a continued line. |
| Merge conflict between agents | Their scopes overlapped. Resolve in the main tree, then fix the split. |
| Agent's work vanished | It never committed. The prompt's Commit section is mandatory. |
| Context blown up by agent output | You read the log instead of `$OUT` / `tail`. |
| `$SK`/`$WT` empty, "No such file or directory" | Shell state does not persist between Bash calls. Re-assign in the same call. |
