# Changelog

## 1.16.1 — 2026-08-22

- README: recommend four skills from [affaan-m/ECC](https://github.com/affaan-m/ECC)
  (MIT, active, not a fork) — `coding-standards` plus the three it explicitly
  defers to, `frontend-patterns`, `backend-patterns` and `api-design`. Installed
  as a set, because the deferrals dangle otherwise.
- No normalization required: all four use only `name` and `description`, both of
  which Claude Code accepts.
- Recorded two caveats found while installing. Each skill ships an
  `agents/openai.yaml` that is Codex harness display metadata rather than a
  sub-agent, so nothing extra needed installing. And `coding-standards` largely
  restates `rules/common/coding-style.md` and the `functional-*` skills on
  immutability and error handling — the three framework-specific siblings are
  where the real gap was.

## 1.16.0 — 2026-08-22

- **The three functional skills now say where they apply.** Each states that the
  rules govern domain boundaries and new code, and that framework conventions
  and stdlib culture win where they conflict — an unscoped style mandate gets
  discarded wholesale the first time it collides with Django or ASP.NET.
- **`functional-csharp` gained the compiler-setup section** its TypeScript
  sibling already had. Without `<Nullable>enable</Nullable>` and
  warnings-as-errors, the diagnostics the rest of the skill relies on never fire.
- **Two C# corrections.** `ImmutableArray` is the right default for read-heavy
  domain collections, with `ImmutableList` for rebuild-heavy ones. And switch
  exhaustiveness over a sealed hierarchy is only the CS8509 *warning*, not a
  guarantee — so union boundaries get an explicit `Match`. This reverses the
  previous "omit the default arm and let the compiler warn" advice.
- Async composition notes added to all three — the gap most likely to send a
  reader back to exceptions the first time a `Result` meets an `await`.
- Authored by ox-alpha in a worktree; reviewed before merge, one duplicated
  checklist bullet fixed, and all three referenced files verified to exist.

## 1.15.0 — 2026-08-22

- **`ori-free-models.sh` is now `ori-models.sh`, with a price ceiling.**
  Free-only was the wrong default: at a 1M context floor it yields 3 models from
  a single family, while a $0.50/1M-output ceiling yields 18 across many —
  cheapest at $0.13/1M with a 1M window. Free models still sort first, and
  `--free-only` restores the old behaviour exactly.
- **Wallet check before recommending anything paid.** Queries the remaining
  credit and exits `10` rather than suggesting models that cannot be paid for.
  The key is sent as a bearer token and never printed, logged, or emitted in
  `--json`.
- **The rate limit is free-tier only**, which reframes it as a reason to spend
  cents rather than a hard constraint to design around. Recorded in the
  limitations table alongside the observed 429s.
- Cross-OS: `pty-drive.py` guarded so Windows gets exit `40` and a pointer to
  WSL / node-pty / pywinpty, instead of an ImportError from a module-level
  `import pty`. Every other repo script audited — no GNU-only or BSD-only flags,
  all shebangs via `/usr/bin/env`, so macOS and Linux needed no changes.

## 1.14.0 — 2026-08-22

- **New skill: `openrouter-cli-subagent`.** Runs the `cli-coding-subagents`
  workflow through OpenRouter via `ori`, referencing that skill rather than
  restating it. Two executable scripts, both run here.
- **`ori-precheck.sh`** — exit 0 / 10 / 40 matching the existing precheck
  contract, all three paths tested. On exit 10 it stops and asks the user to run
  `ori login`, because browser OAuth is not something an agent can do for them.
  Never prints the key, the credentials file, or the account identifier.
- **`ori-free-models.sh`** — filters on `supported_parameters` containing
  `tools`, not on the model name, which is what stops a free million-token
  *music* model being recommended as a coding agent. Also checks every pricing
  field, since `request` and `image` can be non-zero on a "free" model.
- **Two context tiers, because one floor made review a fiction.** Measured
  today: a 1M floor yields one stable family, a 256K reviewer floor yields nine.
  Reviewers read a diff, so they do not need the author's context.
- **Corrects the model flag.** `--model` belongs to `ori`, before the `--`;
  placed after it, an OpenRouter id reaches the harness's own flag and fails.
- **Leads with the limitations.** 20 req/min that credits cannot raise, 50
  req/day under $10 of credits, and failed calls counting against quota — which
  together mean wide fan-out and retry loops actively hurt. The 750K ceiling is
  stated as structurally enforced by iteration slicing, not measured, because no
  per-run token accounting from `ori` was verified.

## 1.13.0 — 2026-08-22

- **New skill: `desktop-interaction`.** Drives webview-based desktop apps —
  Electron, Tauri, pywebview, Neutralino — either launched under control or
  attached to a running instance over a debugging port. Native Swift/Qt/WinUI is
  explicitly out of scope rather than vaguely implied.
- **Documents the support gradient instead of averaging it.** Electron bundles
  Chromium and speaks CDP, so it is strong. Everything on the OS webview
  inherits that platform's limits: `tauri-driver` has **no macOS support**, and
  pywebview on macOS exposes no remote debugging port at all.
- **Two verified findings.** Playwright Python has no `_electron` — Electron
  launch is Node-only. And attach-over-CDP → click → ARIA snapshot works from
  Python, confirmed here against a Chromium process standing in for Electron.
- Polls for the debugging port rather than sleeping, after a fixed sleep
  produced `ECONNREFUSED` during verification and polling connected first try.

## 1.12.0 — 2026-08-22

- **New skill: `browser-interaction`.** Clicks through a page as a manual tester
  would and reports the finding with evidence. Exploratory only; suites and CI
  stay out of scope.
- **Structure over pixels.** `locator.aria_snapshot()` is the default evidence —
  smaller than an image, quotable in a report, and it exposes missing accessible
  names that a screenshot cannot. Verified by execution here, which also caught
  that `page.accessibility.snapshot()` no longer exists in current Playwright
  despite still appearing in circulating documentation.
- **Says the quiet part about Safari.** Playwright's WebKit tracks WebKit main
  and cannot drive branded Safari at all, so a green WebKit run is not Safari
  coverage; `safaridriver` is named as the only real answer.
- Searches for an MCP browser server before automating, and recommends a
  specific tool with its install command when nothing is configured.

## 1.11.0 — 2026-08-22

- **New skill: `terminal-interaction`.** Drives a CLI, TUI, REPL or installer as
  a manual tester would — launch, send keys, capture the screen, report the
  finding. Exploratory verification only; assertions and CI are out of scope.
- **Searches before it builds.** MCP server, then published skill, then CLI,
  then an explicit "nothing fits" — the terminal-driving landscape is unusually
  well populated and hand-rolling a driver is normally the wrong move.
- **Ships `scripts/pty-drive.py`, verified by execution here.** tmux is absent
  from stock macOS, so the fallback had to be real: Python stdlib only, genuine
  PTY, regex-driven steps, JSON output, exit codes 0/1/2/64 all tested.
- Encodes the rule that fixes most flaky terminal driving: poll for the output
  you expect, never sleep a fixed amount.

## 1.10.0 — 2026-08-22

- **New skill: `prototype`.** Throwaway code that answers a design question
  before implementation spends tokens on the wrong thing. Question stated and
  answer predicted before running, so a prototype can actually surprise you.
- **Two modes, and the tension between them is named rather than smoothed
  over.** Greenfield says no abstractions. Brownfield says exactly one — a seam
  designed against the *real* implementation — because bad code with no seam
  fuses to the system and becomes permanent by default rather than by decision.
  The one-line-swap test decides whether the seam is in the right place.
- Question-shaped-prototype framing adapted from Matt Pocock's prototype skill
  (MIT), credited in the description and body; the seam material is new here.

## 1.9.1 — 2026-08-21

- README: recommend rampstackco's `after-action-report` (blameless AAR /
  postmortem, 568 stars, active) from upstream, with the frontmatter
  normalization Claude Code requires.
- New standing contract: every externally sourced skill installed on any
  agent gets recorded here — this README is the canonical registry of the
  skills in use across all models and machines.

## 1.9.0 — 2026-08-21

- **Removed: `sweat-dreams`**, at the operator's direction — skill, evals,
  vendored CLI, menubar sources, and the installer's PATH-install step. Prior
  entries stand as history; the code remains recoverable from git.

## 1.8.1 — 2026-08-21

- README: recommend ayghri/i-have-adhd (ADHD-friendly output shaping) from
  upstream — thriving 22k-star repo, so adopt-not-adapt applies.
- Trigger tuning from live probes: research-first now fires on imperative
  build requests (verified fixed by re-probe); adr's read side broadened.

## 1.8.0 — 2026-08-21

- **New skill: `bookkeeper`.** Durable repository facts live as small tagged
  entries in committed `.memory/` files; `index.md` is the PageIndex map read
  first, and every write updates both index tables with the entry.
- **Memory-aware git linkage.** `adr-in-git` now names `.memory/<file>` paths as
  valid `Refs:` targets so commits can point to the facts they add or depend on.

## 1.7.0 — 2026-08-21

- **sweat-dreams goes cross-platform**: caffeinate (macOS), systemd-inhibit /
  gnome-session-inhibit (Linux), PowerShell SetThreadExecutionState
  (Windows & WSL) behind one lease/daemon lifecycle. Laptops (battery
  detected) keep the display awake by default; `--no-display` /
  `SWEAT_DREAMS_DISPLAY` override. Fixed a pid-capture bug where the
  keep-awake process could leak unkillable. Linux/Windows paths are
  implemented to spec but verified only on macOS — reports welcome.

## 1.6.0 — 2026-08-21

- **Evals for every skill**, and CI now fails any skill (or agent) without a
  valid suite — schema-checked: matching name, unique ids, non-empty prompts
  and expectations.
- **First original agents**: `plan-reviewer` (fresh-eyes plan review before
  dispatch) and `code-archaeologist` (both-legs "why does this exist" digs).
  Chosen by a worth-it test — each needs a subagent's fresh context and
  disposable budget; candidates that merely restated skills were dropped.
- Installer installs, lists, uninstalls and doctors agents (Claude Code target).

## 1.5.0 — 2026-08-21

- **research-first: conclusiveness grading.** One source may stand alone when
  it is direct, deterministic, and unskewed (you ran it, or it is the
  authoritative origin for the exact version); any slight chance of misleading
  requires a second origin. Documentation is never conclusive about runtime
  behavior.
- **README: recommended agents.** The agents in use turned out to be
  awesome-copilot cherry-picks, so they are referenced upstream rather than
  vendored; an `agents/` directory is reserved for original ones.

## 1.4.0 — 2026-08-21

- **New skill: `development-workflow`.** The umbrella pipeline (research →
  plan → red-green-refactor → review → commit-with-why) that sequences the
  other skills, with proportionality rules and the "skips are decisions, not
  drift" contract. Deliberately overlaps research-first — repetition as
  emphasis, by design.

## 1.3.0 — 2026-08-21

- **New skill: `research-first`.** Buy-before-build sweeps when asked to
  implement anything; a two-independent-sources rule for consequential answers
  (running the code counts as a source; memory doesn't, for volatile facts);
  the Chesterton's-fence check — code judged against both the code graph and
  git history; a disagreement protocol; and a proportionality gate so trivia
  stays ceremony-free.

## 1.2.0 — 2026-08-21

- **New skill: `critical-thinking`.** Flagged decisions in work summaries become
  honest comparison tables — pros, cons, concrete cost, reversibility, a
  recommendation that restates its own downside, and the do-nothing default.
  Escalates one-way expensive calls to Kepner-Tregoe / pre-mortem frameworks
  rather than overreaching with a table.

## 1.1.0 — 2026-08-21

The portability release: the repo now actually delivers what the README promised.

- **Skill bodies no longer assume Claude Code.** Scripts are located through a
  five-platform glob instead of a hardcoded `~/.claude/skills/` path, so
  `cli-coding-subagents`, `parallel-build` and `adr-in-git` work when installed
  under any agent.
- **sweat-dreams ships its CLI.** The installer offers to put it on your PATH
  (macOS only); the skill no longer references a tool that was never installed.
- **Installer grew up**: `list`, `doctor` (finds broken/stale symlinks),
  `uninstall`, `--help`; dependency auto-selection via `metadata.depends`;
  platform gating via `metadata.platform` (sweat-dreams is skipped off-macOS);
  and npx-cache detection that forces copy mode so links can't dangle.
- **CI validation** (`npm run validate` + GitHub Action): frontmatter rules,
  fence balance, control characters, script syntax, dependency existence.
- **Evals** added for `deep-plan`, `ux`, `adr-in-git` (triggering boundaries).
- Personal-machine paths scrubbed from examples.

## 1.0.0 — 2026-08-21

Initial release: 14 skills and a cross-platform interactive installer.
