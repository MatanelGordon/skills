# OpenRouter mode

Run the `cli-coding-subagents` workflow through OpenRouter via `ori`, so the
work costs nothing when free models are good enough and stays honest about the
fact that they often are not. Use the main skill for worktrees, the prompt
contract, native report handling, verification, merge, cleanup, and resume.

> **What was verified, on 2026-08-22 against `ori` v0.1.9:** `--help` on each
> subcommand used below; both bundled scripts executed through every exit path;
> and one live `ori claude --model … -- -p` round trip. **Not verified:** the
> published rate-limit numbers, which were sourced rather than measured. The
> individual claims below carry their own status where it matters.

## 1. Pre-flight: always before dispatch

`SK` is the path printed by the main skill's Setup section:

```bash
SK=/path/printed/by/setup
"$SK/scripts/ori-precheck.sh"          # or --json
```

| Exit | Meaning | Do |
|---|---|---|
| `0` | A credential resolves | Dispatch. |
| `10` | Not logged in | **Stop.** Ask the user to run `ori login`. |
| `40` | `ori` or Python 3 missing | Stop; the install pointer is in the output. |

The helpers use Bash and Python 3 and run on macOS and Linux. On Windows, run
them under WSL or Git Bash. They use no GNU-only or BSD-only flags, so they
behave the same on either.

**On exit 10, stop and ask.** `ori login` is browser OAuth and you cannot do it
for the user. Do not attempt it, do not open a browser, and do not improvise
with a key. Non-interactive alternatives exist, but the user must run them:
`ori login --with-key` with the key piped through stdin, or an exported
`OPENROUTER_API_KEY`.

The script reports whether the resolved credential is global or workspace
scoped. A workspace credential may not resolve inside the separate worktrees
where workers run. It never prints the key, the contents of the credential
file, or the account identifier.

## 2. Pick models from the script, never from memory

```bash
SK=/path/printed/by/setup
"$SK/scripts/ori-models.sh"                          # default: output <= $0.50 per 1M tokens
"$SK/scripts/ori-models.sh" --free-only              # free models only
"$SK/scripts/ori-models.sh" --max-output-price 0.10  # tighter ceiling
"$SK/scripts/ori-models.sh" --json                   # machine-readable
"$SK/scripts/ori-models.sh" --all                    # what was rejected, and why
```

**Free is not the only sensible ceiling, and often not the best one.** A few
cents per million output tokens buys out of the two problems that actually
break this workflow: the 20 requests/minute free cap and a free author tier
that is routinely one model family. Measured on the recorded run: at at least
1M context, free gave **3 models from 1 stable family**; a $0.50 per 1M output
ceiling gave **18 models across many families**, the cheapest at $0.13 per 1M
output with a 1M window. A full worker run at those rates costs cents, not
dollars.

The default ceiling is **$0.50 per 1M output tokens**, not zero. Free models
still sort first, so the cheapest safe option is the top row. Use `--free-only`
when spending nothing is a hard requirement.

Raising or removing the price ceiling is the user's decision. State the
proposed maximum cost per 1M output tokens, confirm the reported wallet covers
it, and wait for a yes before proceeding. Even if the user says "money is no
object," the two review gates remain mandatory.

Free and large-context is not enough. A model must be able to **call tools** or
it cannot drive an editor or apply a patch however well it writes prose. The
script decides from `supported_parameters` and `architecture`, never from the
name. That is what prevents `google/lyria-*`, which are music models, from being
recommended as coding workers.

**Two tiers, because one floor makes review a fiction.** Authors need the
context; reviewers read a diff and do not.

```
AUTHOR / ORCHESTRATOR  (context >= 1,000,000)
REVIEWER               (context >=   200,000)
```

**The wallet is checked before paid models are recommended.** Above a zero
ceiling, the script asks OpenRouter what credit remains. Exit 10 from
`ori-models.sh` means the wallet is empty; do not suggest models the user cannot
pay for. The helper reads the key only to send it as a bearer token, never
printing, logging, or emitting it in `--json`.

The set is volatile. Never hardcode a model id or list in documentation or a
prompt: re-run the script at the start of every run and again when a model
starts failing. IDs disappear, and names do not establish tool support.

## 3. Routing and launch

**Claude for orchestration and complex work; codex for simpler tasks and
fixes.** That is the default routing policy when both harnesses are usable.
Orchestration holds the most context and makes the decisions that are expensive
to get wrong; mechanical fixes do not. The warning in the main skill currently
restricts actual dispatch to `ori codex`.

### Codex needs an isolated CODEX_HOME

`ori codex` injects OpenRouter authentication, but Codex still reads its config,
instructions, rules, and skills from `CODEX_HOME`, which defaults to
`~/.codex`. Sharing the interactive home risks clobbering session state and
leaking the wrong model configuration into a worker run. Prepare an isolated
home before dispatch:

```bash
SK=/path/printed/by/setup
"$SK/scripts/ori-codex-home.sh"   # idempotent; links AGENTS.md, rules/, and skills/
```

Launch every OpenRouter codex worker through that home:

```bash
CODEX_HOME="$HOME/.ori-codex" ori codex --model <openrouter-model-id> -- \
  exec --dangerously-bypass-approvals-and-sandbox -C "$WT" -o "$OUT" "$(cat "$PROMPT_FILE")" < /dev/null > "$LOG" 2>&1
```

Unsandboxed execution is required. Without
`--dangerously-bypass-approvals-and-sandbox`, the worker hangs on an approval
prompt nobody will answer.

The model is an **`ori` flag**, before the `--`:

```bash
ori claude --model nvidia/nemotron-3-ultra-550b-a55b:free -- -p "$(cat "$PROMPT_FILE")"
```

Do not use `ori claude -- --model <id>`. Everything after `--` is passed to the
harness untouched, so the id reaches Claude Code's own `--model`, which does not
understand OpenRouter IDs. `ori` also owns `--reasoning-effort`.

*Verified by execution: `ori claude --model z-ai/glm-5.2:free -- -p "…"` and the
same command with `nvidia/nemotron-3.5-lightning:free` both returned the
requested output, confirming that the flag reaches OpenRouter and the harness
runs on the chosen model. `ori claude --help` and `ori codex --help` both
document `--model string  Model to use (any OpenRouter model id)`.*

Other harnesses exist, including `ori grok`, `ori opencode`, `ori pi`,
`ori hermes`, and `ori prime-agent`. This mode scopes itself to claude and
codex.

**Piped output is JSON by default.** `ori` emits machine JSON when stdout is
redirected. Use `--human` for text and `--json` when parsing.

## 4. Concurrency on free models

The `parallel-build` skill owns how jobs are divided. OpenRouter adds a tighter
concurrency limit: free models share a **20 requests/minute** cap that buying
credits does not raise. Eight simultaneous workers collide, retry, and burn
daily quota on failures instead of becoming eight times faster. Prefer two or
three concurrent workers and serialize when the daily quota is tight.

## 5. Two mandatory review gates

These models are not trusted, so nothing they produce merges unreviewed.

| Gate | When | Who | Output |
|---|---|---|---|
| **CR: code review** | After every code generation | A different model from the author, ideally a different family | Findings on correctness and scope. **Does not rewrite.** |
| **PR: plan review** | After every plan | A different model from the planner | `VERDICT`, `BLOCKERS`, and `NON-BLOCKING`, following this repository's `plan-reviewer` contract. |

Reuse the `plan-reviewer` contract instead of inventing one, so reviews keep
the same three headings and meaning whichever model produced the plan.

When only one usable free model exists, there are exactly two honest options:

1. Accept same-model review and **label it as weaker**. A model reviewing its
   own output shares its blind spots and will wave through its characteristic
   mistakes. This is a smoke test, not independent review.
2. **Spend money on the review pass only.** Reviews read a diff, so they are
   cheap. This is usually the better trade.

Never describe same-model review as independent. A code-review worker reports
findings only; if it rewrites the code, nobody has reviewed the rewrite.

## 6. Limitations and workarounds

The free tier's constraints shape the workflow, so expose them before hour
three rather than discovering them then.

| Limitation | Why it bites | Work around it |
|---|---|---|
| **20 requests/minute** on free models; credits do not raise it | A worker loop makes many small calls, so wide fan-out collides. | Run 2–3 concurrently, not 8. Or leave free tier: the cap applies only there, and a $0.13 per 1M model escapes it for cents. |
| **50 requests/day** below $10 of credits | Enough for perhaps one real worker session. | **Spend $10 once** to raise it permanently to 1,000/day and unlock the cheap paid tier. This is the highest-leverage fix. |
| **Failed calls still count** against quota | A retry storm can consume the day's budget without producing work. | Fail fast, cap retries, and switch models instead of looping on one that fails. |
| **Models vanish or change** without notice | A pinned id can return 404 mid-run. | Re-run discovery at the start and on the first failure; do not preserve ids in prompts. |
| **`stealth/*` and preview models are unstable** | Behavior changes during a run. | Use them for one-shot work, never a long multi-iteration run. |
| **Tool calling is less reliable** on weaker models | Dropped or malformed calls can look like a worker doing nothing, followed by a false claim of success. | Give smaller tasks and explicit output contracts; inspect the changed artifact or diff instead of trusting the report. |
| **Advertised context is not usable context** | Quality degrades well before the published window fills. | Budget about 150K per iteration even with a 1M window; hand off early. |
| **Provider throttling at peak** | Slow or failed calls can be unrelated to the user's quota. | Retry later or switch models instead of debugging the project. |
| **No verified per-run token accounting** | Spend cannot be proved from `ori`. | The next section enforces the ceiling structurally rather than claiming a measurement. |

*Status of these numbers: the per-minute and per-day figures came from
OpenRouter's published limits and an independent secondary source, checked on
2026-08-22. They were not measured here because doing so would deliberately
exhaust someone's quota. Treat them as current-but-changeable and re-check
before relying on exact values.*

*Throttling was observed directly.* Five concurrent review workers on free
models produced an immediate `API Error: Request rejected (429) · Provider
returned error` on one, and a second 429 on a retry minutes later. The same
models succeeded one at a time. The concurrency rule is based on the failure
this workflow encountered first.

To see the real limit for a credential, query
`https://openrouter.ai/api/v1/key` with the key. An account holding credits
reports `is_free_tier: false` and receives the higher daily allowance.

## 7. Budget: 750K per worker, enforced by structure

Use **750K tokens per worker**, sliced into roughly **150K iterations**.

Each iteration rewrites `HANDOFF.md`; it never appends:

```md
# OBJECTIVE (verbatim, never paraphrased)
<the original task, copied exactly>

# DONE            — with evidence: commit shas, files, test output
# NEXT            — the single next action
# BLOCKED         — what stopped, and what would unblock it
# DECISIONS       — assumptions made so far, and why
```

Four rules make this work:

1. **Objective verbatim.** Never paraphrase it. Drift across five iterations is
   how a loop ends up solving a different problem.
2. **Rewrite, do not append.** The next iteration pays tokens to read everything
   left behind. A growing log makes every iteration costlier than the previous
   one, which is exactly backwards.
3. **Stop at about 80% of the slice and write the handoff.** An iteration that
   dies mid-thought loses the handoff, which is the whole safety mechanism.
4. **Commit the progress, not just the file.** A crashed iteration without a
   commit leaves nothing to resume. Commit `HANDOFF.md` too.

**No-progress detection:** two consecutive iterations with the same `NEXT` and
no new commits means stop and surface the problem. Spending the remaining
budget re-deriving the same dead end helps nobody.

**How the ceiling is enforced, honestly.** `ori` exposes no per-run token
accounting that was verified here, so 750K is **not measured**. Iteration slices
and human checkpoints enforce it structurally: a fixed number of bounded
iterations with a checkpoint between them. The harness's own cost view or the
OpenRouter activity dashboard may provide real accounting, but neither was
tested here. The harness view means Claude Code's cost view when that harness is
usable. Do not claim precise token spend for this loop.

**Relationship to `parallel-build`'s `PROGRESS.md`.** They deliberately use the
same shape for different purposes. `PROGRESS.md` lets a fresh session resume
after an unplanned crash. `HANDOFF.md` schedules termination on purpose: every
iteration is expected to end and hand over. One is recovery; the other is
planned succession.
