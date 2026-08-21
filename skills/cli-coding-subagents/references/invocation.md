# Invocation reference

Verified against `codex-cli 0.147.0` and GitHub Copilot CLI (Aug 2026).

## Token discipline (the whole point)

A subagent's streamed transcript is worthless to you and expensive to read. Two
independent levers, **use both**:

1. **Redirect the transcript to a log file** so it never enters your context.
   Read the log only when the agent fails.
2. **Tell the agent to be terse** in its final message (see `prompt-template.md`
   §Output contract). Ask for a fixed, small report shape.

Never pipe a subagent's stdout straight into your context.

> Measured on a real dispatch: a 1001-line transcript went to the log while the
> report you actually read was 174 bytes.

## Shell-state warning

Each Bash tool call is a **fresh shell** — variables do not survive between
calls. Assign every variable you use (`SK`, `WT`, `SLUG`, `LOG`, `OUT`) in the
*same* call that uses them, or use absolute paths. Copy the blocks below whole.

---

## Codex

Always: model `gpt-5.6-sol`, no sandbox, full permissions. Effort is per task.

```bash
SLUG=p2-parser
WT=/abs/path/to/worktree              # from: wt.sh new "$SLUG"
PLAN_DIR=/abs/repo/.plan/my-plan
PROMPT_FILE="$PLAN_DIR/prompts/$SLUG.md"
LOG="$PLAN_DIR/logs/$SLUG.log"
OUT="$PLAN_DIR/logs/$SLUG.out.md"
mkdir -p "$PLAN_DIR/logs"

codex exec \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  --dangerously-bypass-approvals-and-sandbox \
  -C "$WT" \
  --color never \
  -o "$OUT" \
  "$(cat "$PROMPT_FILE")" < /dev/null > "$LOG" 2>&1
echo "exit=$?"
```

Swap `high` for `xhigh` on the hardest tasks. **Never put a `#` comment on a
continued line** — the backslash escapes the space, not the newline, and the rest
of the command is silently dropped. Keep `< /dev/null`: codex reads the prompt
from stdin when stdin is a pipe, and a dispatch without it can hang waiting.

### Long runs get killed

Long codex runs on this machine are sometimes SIGKILLed partway. Two defenses:

- **Require incremental commits** in the prompt ("commit after each green step"),
  so a killed run leaves salvageable committed work rather than nothing.
- **Resume instead of restarting.** Recover the session id with
  `scripts/codex-session.py "$WT"` (see Follow-ups below), then:
  ```bash
  SESSION_ID=$(python3 "$SK/scripts/codex-session.py" "$WT")   # quote it
  CONTINUE="continue: finish the tests for the parser"
  cd "$WT" && codex exec resume "$SESSION_ID" \
    -m gpt-5.6-sol -c model_reasoning_effort="high" \
    --dangerously-bypass-approvals-and-sandbox \
    --color never -o "$OUT" \
    "$CONTINUE" < /dev/null >> "$LOG" 2>&1
  ```
  `-C/--cd` is **rejected** by `codex exec resume` — `cd` into the worktree instead.

After a kill, check the worktree for uncommitted-but-complete work: verify the
critical-path tests and commit it yourself rather than discarding it.

| Flag | Why |
|---|---|
| `-m gpt-5.6-sol` | Required model. |
| `-c model_reasoning_effort="high"` | Effort. The config file default is `medium`, so pass this **every time** or you silently get weaker work. Use `high` normally; `xhigh` for deep/subtle work (tricky concurrency, refactors across many seams, architecture). |
| `--dangerously-bypass-approvals-and-sandbox` | No sandbox + full permissions, no approval prompts. Non-negotiable for unattended runs — without it the agent blocks forever on a prompt nobody will answer. |
| `-C "$WT"` | Run with the worktree as its root. Without it the agent edits your main tree. |
| `-o "$OUT"` | Writes **only the final message** to a file. This is what you read. |
| `--color never` | Keeps the log clean. |

`--skip-git-repo-check` is only needed outside a git repo; worktrees are repos, so skip it.

**Usage data:** codex writes `rate_limits` into `token_count` events inside
`~/.codex/sessions/**/rollout-*.jsonl`. `precheck.sh` reads the newest one — free,
no API call. There is no `codex usage` subcommand.

**Login:** `codex login status` prints `Logged in using ChatGPT` or `Not logged in`.
Note the second contains the first as a substring — match it anchored. Fix: `codex login`.

---

## Copilot

Used for the **more straightforward** tasks. Always `--effort high`.

> **Node >= 24 required.** The user's default `node` is often older, and the CLI
> aborts with "requires Node.js v24 or higher".
>
> **Do not fix this by prepending Node 24 to `PATH`.** The agent's own shell
> commands would inherit it, so `npm test` would run under a Node the project
> never targets — a verified way to make a healthy suite fail (observed: `node
> --test test/` works on v18, dies with `Cannot find module '.../test'` on v24).
> The agent then reports a phantom failure.
>
> Instead run the CLI's JS entrypoint with the v24 binary explicitly and leave
> `PATH` alone. `precheck.sh` prints the exact command as `launch: <node> <js>`.

```bash
SLUG=p2-scaffold
WT=/abs/path/to/worktree
PLAN_DIR=/abs/repo/.plan/my-plan
LOG="$PLAN_DIR/logs/$SLUG.log"
mkdir -p "$PLAN_DIR/logs"
# from precheck's "launch:" line — NOT an export
NODE24="$HOME/.nvm/versions/node/v24.3.0/bin/node"
COPILOT="$HOME/.nvm/versions/node/v18.18.0/bin/copilot"

"$NODE24" "$COPILOT" -p "$(cat "$PLAN_DIR/prompts/$SLUG.md")" \
  --model claude-sonnet-5 \
  --effort high \
  --allow-all-tools \
  --allow-all-paths \
  --no-ask-user \
  -C "$WT" \
  --no-color \
  --log-level none \
  -s < /dev/null > "$LOG" 2>&1
echo "exit=$?"
```

If `copilot` is already on a Node 24 PATH by default, plain `copilot ...` is fine —
the explicit launcher only matters when you would otherwise have to override PATH.

| Flag | Why |
|---|---|
| `-p "$PROMPT"` | Non-interactive; exits when done. |
| `--model` | `claude-sonnet-5` or `gpt-5.6-sol` (see below). Verified valid; most other spellings are rejected. |
| `--effort high` | Always high for real work. |
| `--allow-all-tools` | **Required** in non-interactive mode — without it the agent runs no tools at all. |
| `--allow-all-paths` | So it can range over the worktree freely. |
| `--no-ask-user` | Disables the `ask_user` tool so it never blocks waiting on a human. |
| `-s` / `--silent` | Prints only the agent response, no stats banner. |
| `--log-level none` | Suppresses CLI logging noise. |

Copilot has no `-o` equivalent, so `-s` + redirect is how you keep it quiet; the
final message lands at the end of `$LOG` (`tail -40 "$LOG"`).

**Which copilot model:** default to **`claude-sonnet-5`** — it follows the strict
output contract and scope rules more reliably. Use `gpt-5.6-sol` when the task is
mostly mechanical or when sonnet has already failed on it.

**Usage data:** the CLI only shows quota through interactive `/usage`. The
scriptable source is the GitHub API:
`gh api /copilot_internal/user` → `.quota_snapshots.premium_interactions`
(`entitlement`, `credits_used`, `overage_count`, `overage_entitlement`,
`overage_permitted`, `percent_remaining`). `precheck.sh` parses this. It is an
undocumented internal endpoint, so precheck **fails closed**: if quota cannot be
read, it returns 20 (ask the user) rather than assuming headroom.

**Login:** `~/.copilot/config.json` → `loggedInUsers`, or one of
`COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` (an ambient token may not
actually carry Copilot access). Fix with `copilot login`.

---

## Follow-ups: resume, don't re-dispatch

When a report comes back with `QUESTION:` or `BLOCKED:`, answer it by **resuming
the same session**. The agent keeps its context, so the follow-up costs a fraction
of a fresh dispatch and it does not re-read the codebase.

### Copilot — choose the id up front (easiest)

`--session-id` sets the UUID for a *new* session, so you never have to scrape it:

```bash
SID=$(uuidgen)
"$NODE24" "$COPILOT" -p "$(cat "$PROMPT_FILE")" --session-id "$SID" \
  --model claude-sonnet-5 --effort high --allow-all-tools --allow-all-paths \
  --no-ask-user -C "$WT" --no-color --log-level none -s < /dev/null > "$LOG" 2>&1

# follow-up, same session, context retained
"$NODE24" "$COPILOT" -p "Yes - use the existing Result type, do not add a new one." \
  --resume="$SID" --allow-all-tools --allow-all-paths --no-ask-user \
  -C "$WT" --no-color --log-level none -s < /dev/null >> "$LOG" 2>&1
```

Record `$SID` in the agent's status file so a resumed orchestrator can find it.

### Codex — recover the id from the rollout, matched by worktree

Codex has no flag to pre-set a session id, but every rollout's first line is a
`session_meta` record carrying both `session_id` and `cwd`. Matching on `cwd` is
**parallel-safe**; "newest file" is not, because concurrent agents race.

```bash
# scripts/codex-session.py <worktree>  -> prints the session id
SID=$(python3 "$SK/scripts/codex-session.py" "$WT")
cd "$WT" && codex exec resume "$SID" \
  -m gpt-5.6-sol -c model_reasoning_effort="high" \
  --dangerously-bypass-approvals-and-sandbox --color never -o "$OUT" \
  "Yes - use the existing Result type, do not add a new one." \
  < /dev/null >> "$LOG" 2>&1
```

`-C/--cd` is **rejected** by `codex exec resume` — `cd` into the worktree instead.
`codex exec resume --last` exists but is unsafe with parallel agents; always pass
an explicit id.

### Batch the questions

With 2-4 agents running, do not interrupt the user once per agent. Collect every
`QUESTION:` at the phase barrier, answer the ones you can yourself, and put only
the genuine judgement calls to the user — once, together. Then resume each
affected session with its answer.

Answer it yourself when the plan already decides it, the codebase has an
established convention, or the assumption is cheap to reverse. Escalate when it
changes a contract, costs money, or is irreversible.

---

## Choosing the tool

| Situation | Tool |
|---|---|
| Multi-file feature, subtle design, refactor across seams | codex, `high` |
| Hardest work: concurrency, tricky algorithms, architecture | codex, `xhigh` |
| Straightforward: scaffolding, mechanical edits, test fill-in, docs, wiring | copilot, `--effort high` |
| Code review / security pass | codex (or a Claude `Agent`) — needs judgment |

When copilot is in paid overage, prefer codex for everything and only fall back
to copilot with the user's explicit go-ahead.
