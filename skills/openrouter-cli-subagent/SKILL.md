---
name: openrouter-cli-subagent
description: >
  Run codex and claude coding subagents through OpenRouter with the ori CLI, so
  subagent work costs nothing when free models suffice. Use when asked to run
  agents on OpenRouter, use ori, work on free models or cheap ones under a price
  ceiling, cut subagent cost, escape free-tier rate limits, or route work to a
  specific OpenRouter model. Covers the login pre-flight that stops
  rather than attempting browser OAuth, discovering which free models are
  genuinely usable for coding today, routing claude for orchestration and codex
  for fixes, mandatory cross-model code review and plan review because these
  models are not trusted, and staying under a token ceiling with handoff-file
  iterations. Also use when free-model work stalls on rate limits, dropped tool
  calls, or a model that vanished mid-run. Builds on cli-coding-subagents.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: the ori CLI (openrouter) on PATH and an OpenRouter credential; builds on cli-coding-subagents
  depends: cli-coding-subagents
---

# OpenRouter CLI subagents

Run the `cli-coding-subagents` workflow through OpenRouter via `ori`, so the work
costs nothing when free models are good enough — and stays honest about the fact
that they often aren't.

**This skill does not restate `cli-coding-subagents`.** Worktrees, the prompt
contract, terse output, merge and cleanup all come from there unchanged. What
follows is only what differs under `ori`.

> **What was verified, on 2026-08-22 against `ori` v0.1.9:** `--help` on each
> subcommand used below; both bundled scripts executed through every exit path;
> and one live `ori claude --model … -- -p` round trip. **Not verified:** the
> published rate-limit numbers (sourced, not measured — see §6). Individual
> claims below carry their own status where it matters.

---

## 1. Pre-flight — always, before dispatching anything

```bash
./scripts/ori-precheck.sh          # or --json
```

| Exit | Meaning | Do |
|---|---|---|
| `0` | A credential resolves | Dispatch |
| `10` | Not logged in | **STOP.** Ask the user to run `ori login` |
| `40` | `ori` or `python3` missing | Stop; the install pointer is in the output |

Both bundled scripts are bash + `python3` and run on macOS and Linux. On Windows
run them under WSL or Git Bash; they use no GNU-only or BSD-only flags, so they
behave the same on either.

**On exit 10, stop and ask.** `ori login` is browser OAuth and you cannot do it
for the user. Do not attempt it, do not open a browser, do not improvise with a
key. The non-interactive escapes exist but are the user's to run:
`ori login --with-key` (piped from stdin) or exporting `OPENROUTER_API_KEY`.

The script reports which **credential source** resolved — global or workspace —
because a workspace-scoped credential may not resolve inside the worktrees your
subagents run in. It never prints the key, the contents of
`~/.ori/credentials.json`, or the account identifier.

## 2. Pick models — from the script, never from memory

```bash
./scripts/ori-models.sh                          # default: out <= $0.50 / 1M tokens
./scripts/ori-models.sh --free-only              # free models only
./scripts/ori-models.sh --max-output-price 0.10  # tighter ceiling
./scripts/ori-models.sh --json                   # machine
./scripts/ori-models.sh --all                    # what was rejected, and why
```

**Free is not the only sensible ceiling, and often not the best one.** A few
cents per million output tokens buys out of the two problems that actually break
this workflow — the 20 req/min free cap, and a free author tier that is routinely
one model family. Measured today: at ≥1M context, free gives **3 models from 1
stable family**; a $0.50/1M output ceiling gives **18 models across many
families**, the cheapest at $0.13/1M output with a 1M window. A full subagent run
at those rates costs cents.

So the default ceiling is **$0.50 per 1M output tokens**, not zero. Free models
still sort first, so the cheapest safe option is always the top row. Use
`--free-only` when spending nothing is a hard requirement.

Free and large-context is not enough — a model must be able to **call tools**, or
it cannot drive an editor or apply a patch however well it writes prose. The
script decides from `supported_parameters` and `architecture`, never from the
name. That distinction is not academic: it is what stops `google/lyria-*`, which
are *music* models, being recommended as coding agents.

**Two tiers, because one floor makes review a fiction.** Authors need the
context; reviewers read a diff and do not.

```
AUTHOR / ORCHESTRATOR  (context >= 1,000,000)
REVIEWER               (context >=   200,000)
```

**The wallet is checked before paid models are recommended.** Above a zero
ceiling the script asks OpenRouter what credit remains and exits `10` rather than
suggesting models you cannot pay for. It reads the key only to send it as a
bearer token — never printing, logging, or emitting it in `--json`.

The set is volatile. **Never hardcode a model list in docs or prompts** — re-run
the script at the start of every run, and again if a model starts failing.

## 3. Routing

**claude for orchestration and complex work; codex for simpler tasks and fixes.**
That is the default split. Orchestration holds the most context and makes the
decisions that are expensive to get wrong; mechanical fixes do not.

### Codex needs an isolated CODEX_HOME

`ori codex` injects OpenRouter auth into the environment, but the Codex CLI
still reads its config, instructions, rules, and skills from `CODEX_HOME` —
which defaults to `~/.codex`. Sharing the interactive home risks clobbering
session state and leaking the wrong model config into a subagent run. Before
dispatching any `ori codex` subagent, prepare an isolated home:

```bash
"$SK/scripts/ori-codex-home.sh"   # idempotent; creates $HOME/.ori-codex with symlinks to AGENTS.md, rules/, and skills/
```

Then launch every codex subagent through it:

```bash
CODEX_HOME="$HOME/.ori-codex" ori codex --model <openrouter-model-id> -- \
  exec --dangerously-bypass-approvals-and-sandbox -C "$WT" -o "$OUT" "$(cat prompt.md)" < /dev/null > "$LOG" 2>&1
```

**Unsandboxed is required** (`--dangerously-bypass-approvals-and-sandbox`):
without it the agent hangs on a prompt nobody will answer — see
`cli-coding-subagents/references/invocation.md` for why this flag is load-bearing.
For everything else (worktrees, prompt contract, terse output, merge, cleanup,
resume), follow `cli-coding-subagents` unchanged; it owns those mechanics.

The model is an **`ori` flag**, before the `--`:

```bash
ori claude --model nvidia/nemotron-3-ultra-550b-a55b:free -- -p "$(cat prompt.md)"
```

**Not** `ori claude -- --model …`. Everything after `--` is passed to the harness
untouched, so a model id placed there reaches Claude Code's own `--model`, which
does not understand OpenRouter ids. `ori` also owns `--reasoning-effort`.

*Verified by execution: `ori claude --model z-ai/glm-5.2:free -- -p "…"` and the
same against `nvidia/nemotron-3.5-lightning:free` both returned the requested
output, confirming the flag reaches OpenRouter and the harness runs on the chosen
model. `ori claude --help` and `ori codex --help` both document
`--model string  Model to use (any OpenRouter model id)`.*

Other harnesses exist (`ori grok`, `ori opencode`, `ori pi`, `ori hermes`,
`ori prime-agent`, …). This skill scopes to claude and codex.

**Piped output is JSON by default.** `ori` emits machine JSON when stdout is
redirected. Use `--human` when you want the text, `--json` when you parse it.

## 4. Decomposition and dispatch

Per `cli-coding-subagents`: smallest independently-runnable subtasks, one git
worktree each via `wt.sh`, one prompt file each, terse output contract, merge and
cleanup.

**What differs under ori:** you cannot fan out as wide. Free models share a
**20 requests/minute** cap that buying credits does not raise, so eight
concurrent subagents do not go eight times faster — they collide, retry, and
burn daily quota on failures. Prefer two or three concurrent subagents over
eight, and serialise when the daily quota is tight. See §6.

## 5. Two mandatory review gates

These models are not trusted, so nothing they produce merges unreviewed.

| Gate | When | Who | Output |
|---|---|---|---|
| **CR** — code review | After every code generation | A different model from the author, ideally a different family | Findings on correctness and scope. **Does not rewrite** |
| **PR** — plan review | After every plan | A different model from the planner | `VERDICT` / `BLOCKERS` / `NON-BLOCKING`, per this repo's existing `plan-reviewer` agent contract |

Reuse the `plan-reviewer` contract rather than inventing one — same three
headings, same meaning — so plan reviews read the same whichever model produced
them.

**When only one usable free model exists**, there are exactly two honest options:

1. Accept same-model review and **label it as weaker**. Say so in the report: a
   model reviewing its own output shares its blind spots and will wave through
   the mistakes it is prone to. This is a smoke test, not independent review.
2. **Spend money on the review pass only.** Reviews read a diff, so they are
   cheap. This is usually the better trade.

Do not describe same-model review as independent. It isn't, and the tier split in
§2 exists specifically so you rarely have to.

## 6. Limitations, and how to get past them

The free tier's constraints shape the whole workflow, so they are stated up front
rather than discovered at hour three.

| Limitation | Why it bites | Work around it |
|---|---|---|
| **20 requests/minute** on free models, credits don't raise it | An agent loop is many small calls. Wide fan-out collides | 2–3 concurrent subagents, not 8. Or move off free: **the cap is free-tier only**, and a $0.13/1M model escapes it for cents |
| **50 requests/day** under $10 of credits | One real subagent session, maybe | **Spend $10 once** — permanently raises it to 1,000/day, *and* unlocks the cheap paid tier. Highest-leverage fix available |
| **Failed calls still count** against quota | A retry storm can eat the day's budget producing nothing | Fail fast, cap retries, never loop on a failing model — switch models instead |
| **Models vanish or change** without notice | A pinned id 404s mid-run | Re-run the discovery script at run start and on first failure. Never hardcode ids |
| **`stealth/*` and preview models are unstable** | Behaviour changes under you | Usable for one-shot work, never for a long multi-iteration run |
| **Tool calling is less reliable** on weaker models | Dropped or malformed tool calls look like the agent "doing nothing" | Smaller subtasks, explicit output contracts, verify by artifact — did the file change? — not by what the model claims |
| **Advertised context ≠ usable context** | Quality degrades well before the window fills | Budget ~150K per iteration regardless of a 1M window. Hand off early |
| **Provider throttling at peak** | Slow or failing calls unrelated to your quota | Retry later or switch models; don't debug your own code for it |
| **No per-run token accounting verified** | You cannot prove spend from `ori` | See §7 — the ceiling is enforced structurally, not measured |

*Status of these numbers: the per-minute and per-day figures come from
OpenRouter's published limits plus an independent secondary source, checked
2026-08-22. They were **not** measured here — doing so means deliberately
exhausting someone's quota. Treat them as current-but-changeable and re-check
before relying on the exact values.*

*Throttling, however, was observed directly.* Dispatching five concurrent
review subagents on free models produced an immediate `API Error: Request
rejected (429) · Provider returned error` on one of them, and a second 429 on a
retry minutes later. The same models succeeded when run one at a time. The
concurrency advice above is not theoretical caution — it is the failure this
workflow actually hits first.

To see the real limit for a given credential rather than the published default,
query `https://openrouter.ai/api/v1/key` with the key. An account holding
credits reports `is_free_tier: false` and gets the higher daily allowance.

## 7. Budget: 750K per subagent, enforced by structure

**750K tokens per subagent**, sliced into roughly **150K iterations**.

Each iteration **rewrites** `HANDOFF.md` — it does not append:

```md
# OBJECTIVE (verbatim, never paraphrased)
<the original task, copied exactly>

# DONE            — with evidence: commit shas, files, test output
# NEXT            — the single next action
# BLOCKED         — what stopped, and what would unblock it
# DECISIONS       — assumptions made so far, and why
```

Four rules make this work:

1. **Objective verbatim.** Never paraphrased. Paraphrase drift across five
   iterations is how these loops end up solving a different problem.
2. **Rewrite, don't append.** Iteration N+1 pays tokens to read everything left
   behind. A growing log makes each iteration more expensive than the last —
   exactly backwards.
3. **Stop at ~80% of the slice and write the handoff.** An iteration that dies
   mid-thought loses the handoff, which is the entire safety mechanism.
4. **Commit the progress, don't just write it.** A crashed iteration that never
   committed leaves nothing to resume from. `HANDOFF.md` is committed too.

**No-progress detection:** two consecutive iterations with the same `NEXT` and no
new commits means stop and surface it. Burning the remaining budget re-deriving
the same dead end helps nobody.

**How the ceiling is actually enforced — honestly.** `ori` exposes no per-run
token accounting that was verified here, so the 750K is **not measured**. It is
enforced by iteration slicing and human checkpoints: a fixed number of iterations
of a bounded size, with a checkpoint between each. If you need real accounting,
the harness's own reporting (Claude Code's cost view) or OpenRouter's activity
dashboard are the places to look — neither was tested here. Do not claim precise
token accounting for this loop.

**Relationship to `parallel-build`'s `PROGRESS.md`.** Deliberately the same
shape, different purpose: `PROGRESS.md` exists so a fresh session can resume
after an unplanned crash. `HANDOFF.md` plans for termination **on purpose** —
every iteration is expected to end and hand over. One is recovery, the other is
scheduled succession.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Attempting `ori login` for the user | Browser OAuth you cannot complete. Exit 10 means stop and ask. |
| Hardcoding a model id in docs or a prompt | The free set changes weekly and ids disappear. Run the script. |
| Picking a free model by its name | Names don't tell you about tool calling. `lyria` is a music model. |
| `ori claude -- --model <id>` | Reaches the harness's own flag, which rejects OpenRouter ids. It's an `ori` flag. |
| Fanning out eight concurrent subagents | 20 req/min is shared. They collide and burn quota on failures. |
| Retrying a failing model in a loop | Failed calls count against the daily quota. Switch models. |
| Same-model review described as independent | It shares the author's blind spots. Label it, or pay for the review. |
| A CR agent that rewrites the code | Then nobody reviewed the rewrite. Findings only. |
| Appending to `HANDOFF.md` | Each iteration pays to read it. Rewrite. |
| Paraphrasing the objective between iterations | Drift compounds and the loop solves the wrong problem. |
| Writing progress without committing | A crashed iteration leaves nothing to resume from. |
| Claiming a measured token spend | Not available from `ori`. The ceiling is structural. |
| Trusting a subagent's "done" without artifacts | Weak models drop tool calls and still report success. Check the diff. |
