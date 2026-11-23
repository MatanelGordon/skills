# Invocation reference

Flags checked against `codex exec --help` and `codex exec resume --help` on codex-cli 0.170.0 (Nov 2026); first verified by full dispatch on 0.147.0 and GitHub Copilot CLI (Aug 2026).

## Codex

Native codex always uses model `gpt-5.6-sol`, no sandbox, and full
permissions. Effort depends on the task.

```bash
SLUG=p2-parser
WT=/abs/path/to/worktree              # from: wt.sh new "$SLUG"
RUN_DIR=/abs/path/to/run-directory
PROMPT_FILE="$RUN_DIR/prompts/$SLUG.md"
LOG="$RUN_DIR/logs/$SLUG.log"
OUT="$RUN_DIR/logs/$SLUG.out.md"
mkdir -p "$RUN_DIR/logs"

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

Swap `high` for `xhigh` on the hardest tasks. Keep `< /dev/null`: codex reads
the prompt from stdin when stdin is a pipe, and a dispatch without it can hang
waiting.

### Long runs get killed

Long codex runs on this machine are sometimes SIGKILLed partway. Two defenses:

- Require incremental commits in the prompt (`commit after each green step`),
  so a killed run leaves salvageable committed work rather than nothing.
- Resume instead of restarting. Recover the id and use the command in
  [Follow-ups](#follow-ups-resume-dont-re-dispatch).

After a kill, check the worktree for uncommitted-but-complete work. Verify the
critical-path tests and commit it yourself rather than discarding it.

| Flag | Why |
|---|---|
| `-m gpt-5.6-sol` | Required native codex model. |
| `-c model_reasoning_effort="high"` | The config default is `medium`, so pass effort every time or silently get weaker work. Use `high` normally and `xhigh` for deep or subtle work such as tricky concurrency, many-seam refactors, and architecture. |
| `--dangerously-bypass-approvals-and-sandbox` | No sandbox, full permissions, and no approval prompts. It is non-negotiable for unattended runs because otherwise the worker blocks forever on a prompt nobody will answer. |
| `-C "$WT"` | Run with the worktree as root. Without it the worker edits the main tree. |
| `-o "$OUT"` | Write only the final message to the report file. |
| `--color never` | Keep the log clean. |

`--skip-git-repo-check` is needed only outside a git repository. Worktrees are
repositories, so omit it there.

**Usage data:** codex writes `rate_limits` into `token_count` events under
`~/.codex/sessions/**/rollout-*.jsonl`. `precheck.sh` reads the newest one for
free, with no API call. There is no `codex usage` subcommand.

**Login:** `codex login status` prints `Logged in using ChatGPT` or
`Not logged in`. The latter contains the former as a substring, so matching
must be anchored. Fix login with `codex login`.

## Copilot

Use copilot for the more straightforward tasks. Always pass `--effort high`.

> **Node >= 24 required.** The user's default `node` is often older, and the
> CLI aborts with "requires Node.js v24 or higher".
>
> **Do not fix this by prepending Node 24 to `PATH`.** The worker's own shell
> commands would inherit it, so `npm test` would run under a Node the project
> never targets. This was verified to make a healthy suite fail: `node --test
> test/` works on v18 but dies with `Cannot find module '.../test'` on v24.
> The worker then reports a phantom failure.
>
> Run the CLI's JavaScript entrypoint with the v24 binary explicitly and leave
> `PATH` alone. `precheck.sh` prints the exact command as
> `launch: <node> <js>`.

```bash
SLUG=p2-scaffold
WT=/abs/path/to/worktree
RUN_DIR=/abs/path/to/run-directory
PROMPT_FILE="$RUN_DIR/prompts/$SLUG.md"
LOG="$RUN_DIR/logs/$SLUG.log"
mkdir -p "$RUN_DIR/logs"
# Take both paths from precheck's "launch: <node> <copilot-js>" line. They are
# machine-specific; this example is an nvm v24 node plus the copilot JS entry.
NODE24="/path/to/node24/bin/node"
COPILOT="/path/to/copilot"

"$NODE24" "$COPILOT" -p "$(cat "$PROMPT_FILE")" \
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

If `copilot` already uses Node 24 from its default `PATH`, plain `copilot ...`
is fine. The explicit launcher matters only when an override would otherwise be
needed.

| Flag | Why |
|---|---|
| `-p "$PROMPT"` | Non-interactive; exits when done. |
| `--model` | Use `claude-sonnet-5` or `gpt-5.6-sol`. These spellings were verified; most others are rejected. |
| `--effort high` | Always high for real work. |
| `--allow-all-tools` | Required in non-interactive mode; without it the worker runs no tools. |
| `--allow-all-paths` | Let it range over the worktree freely. |
| `--no-ask-user` | Disable the `ask_user` tool so the unattended worker never waits on a human. |
| `-s` / `--silent` | Print only the worker response, without the statistics banner. |
| `--log-level none` | Suppress CLI logging noise. |

Copilot has no `-o` equivalent. Its final message lands at the end of `$LOG`.

**Which copilot model:** default to `claude-sonnet-5`; it follows the strict
output contract and scope rules more reliably. Use `gpt-5.6-sol` for mostly
mechanical work or after sonnet has failed on the task.

**Usage data:** the CLI exposes quota only through interactive `/usage`. The
scriptable source is `gh api /copilot_internal/user`, specifically
`.quota_snapshots.premium_interactions` and its `entitlement`, `credits_used`,
`overage_count`, `overage_entitlement`, `overage_permitted`, and
`percent_remaining` fields. `precheck.sh` parses this undocumented internal
endpoint and fails closed with code 20 if quota cannot be read, rather than
assuming headroom.

**Login:** `~/.copilot/config.json` records `loggedInUsers`. A credential can
also come from `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`, though an
ambient token may lack Copilot access. Fix login with `copilot login`.

## Follow-ups: resume, don't re-dispatch

When a report contains `QUESTION:` or `BLOCKED:`, answer by resuming the same
session. The worker keeps its context, so a follow-up costs a fraction of a new
dispatch and avoids re-reading the codebase.

### Copilot: choose the id up front

`--session-id` sets the UUID for a new session, so it never needs scraping:

```bash
SID=$(uuidgen)
"$NODE24" "$COPILOT" -p "$(cat "$PROMPT_FILE")" --session-id "$SID" \
  --model claude-sonnet-5 --effort high --allow-all-tools --allow-all-paths \
  --no-ask-user -C "$WT" --no-color --log-level none -s < /dev/null > "$LOG" 2>&1

# Follow-up in the same session, with context retained.
"$NODE24" "$COPILOT" -p "Yes - use the existing Result type, do not add a new one." \
  --resume="$SID" --allow-all-tools --allow-all-paths --no-ask-user \
  -C "$WT" --no-color --log-level none -s < /dev/null >> "$LOG" 2>&1
```

Record `$SID` in the worker's status file so a resumed orchestrator can find it.

### Codex: recover the id by worktree

Codex cannot pre-set a session id. Each rollout's first `session_meta` record
contains `session_id` and `cwd`. Matching `cwd` is parallel-safe; choosing the
newest file is not, because concurrent workers race.

```bash
# codex-session.py <worktree> prints the matching session id.
SID=$(python3 "$SK/scripts/codex-session.py" "$WT")
cd "$WT" && codex exec --color never resume "$SID" \
  -m gpt-5.6-sol -c model_reasoning_effort="high" \
  --dangerously-bypass-approvals-and-sandbox -o "$OUT" \
  "Yes - use the existing Result type, do not add a new one." \
  < /dev/null >> "$LOG" 2>&1
```

`-C/--cd` is rejected by `codex exec resume`; change into the worktree instead.
`codex exec resume --last` exists but is unsafe with parallel workers, so always
pass an explicit id.

### Batch the questions

With two to four workers running, do not interrupt the user once per worker.
Collect every `QUESTION:` at the phase barrier, answer the ones you can, and put
only genuine judgment calls to the user once, together. Resume each affected
session with its answer.

Answer a question yourself when the plan already decides it, the codebase has
an established convention, or the assumption is cheap to reverse. Escalate
when it changes a contract, costs money, or is irreversible.
