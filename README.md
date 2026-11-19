# skills

I use four coding agents — Claude Code, Codex, Copilot, Tabnine — and I got
tired of teaching each one the same lessons. How I want plans written. How I
want commits to explain *why*. Which functional patterns I actually want in
TypeScript. So the lessons live here once, and a small installer links them
into every agent at the same time.

They're ordinary [Agent Skills](https://agentskills.io) — a folder with a
`SKILL.md` — which is why one copy can serve every tool. The format is the same
everywhere; only the directory each agent watches differs, and the installer
knows all of them.

## Install

```bash
git clone https://github.com/MatanelGordon/skills.git
cd skills
npm install
npm run install-skills
```

It detects your agents, asks which skills you want, and symlinks them in. That
last part matters: symlinks mean a single `git pull` here updates every agent at
once. If you'd rather have independent copies you can edit per agent, pick copy
mode when it asks. Reinstalls identify links and copies created by this repo.
An edited managed copy, a foreign link, or an unrelated same-named file is a
conflict: interactive installs offer to move it to a timestamped backup first;
noninteractive installs keep it in place, report the conflict, and exit nonzero.

In a hurry, or scripting it:

```bash
node install/index.mjs --yes          # everything, every detected agent
node install/index.mjs --yes --copy   # copies instead of symlinks
node install/index.mjs --yes --all    # force every platform, detected or not
```

You can also try it without cloning — `npx github:MatanelGordon/skills` — which
installs copies (npx runs from a temporary cache, so symlinks would eventually
break; the installer notices and does the right thing).

Afterwards there's a small toolbox for living with it:

```bash
node install/index.mjs list        # what's installed where, and how
node install/index.mjs doctor      # finds broken links (e.g. you moved this repo)
node install/index.mjs uninstall   # clean removal from any or all agents
```

## Where things land

| Agent | Skills directory |
|---|---|
| Claude Code | `~/.claude/skills/` |
| OpenAI Codex | `~/.codex/skills/` and the shared `.agents/skills/` convention |
| GitHub Copilot | `~/.copilot/skills/` |
| Tabnine | `~/.tabnine/agent/skills/` |
| Shared convention | `~/.agents/skills/` |

That last row is worth knowing about: `~/.agents/skills/` is a cross-tool
convention used by several agents. OpenAI's
[current CLI installation table](https://developers.openai.com/api/reference/cli)
documents project `.agents/skills/` and user `~/.agents/skills/`, while its
[skills-eval article](https://developers.openai.com/blog/eval-skills) uses
project `.codex/skills/` and user `~/.codex/skills/`.
Both conventions therefore remain supported here; discovery behavior can vary
by Codex version and installation method. Copilot, Tabnine, OpenCode, Cursor,
and Gemini CLI also use the shared convention.

After installing: `copilot skill list` or `tabnine skills list` to confirm;
Claude Code and Codex pick skills up on the next session.

**Windows note:** the installer falls back to copying where symlinks need
developer mode, but several skills ship `.sh`/`.py` helper scripts that want a
POSIX shell — use Git Bash or WSL for those.

## What's in the box

Twenty-four skills. The short version of each:

**Planning and execution**

- **development-workflow** — the spine: research → plan → test-first →
  implement → review → commit-with-why, each stage deferring to its dedicated
  skill, with a proportionality table so a typo doesn't get the ceremony a
  feature does.
- **deep-plan** — turns "build X" into a plan someone with zero context could
  execute: a clarity gate before anything is written, a file map where every
  path has exactly one owner, edge cases enumerated with a status each, and
  test commands quoted verbatim. Owns the `.plan/` directory.
- **council** — pressure-tests consequential architecture choices through
  isolated, contrast-written sub-agent personas, anonymized cross-review, and
  a chairman verdict that preserves dissent and weights falsifiers over
  confidence theatre; built for weak single-model harnesses on closed networks.
- **prototype** — throwaway code that answers a design question before real
  implementation burns tokens on the wrong thing. Greenfield mode is the
  familiar one (no abstractions, hardcode everything, delete it after);
  brownfield inverts it — deliberately bad code behind exactly one seam, so the
  real implementation lands as a one-line swap and nothing else in the system
  knows the difference.
- **get-the-job-done** — the guard against work that *looks* finished: the done
  report at 80%, the scope that quietly shrank, the summary with a number nobody
  checked. Turns completion claims into `GATES.md` entries with a runnable
  `CHECK` behind each, and ships a checker that re-runs them — so a ticked box
  that has since become false is caught rather than believed. Read-only and
  hook-free on purpose: it survives six concurrent agents, and a blocker you
  can't cleanly remove is worse than the premature "done" it prevents.
- **parallel-build** — executes a plan across parallel subagents in three
  phases (foundation → implementation → review), with a `PROGRESS.md` designed
  so a fresh session can resume after a crash.
- **cli-coding-subagents** — the machinery underneath: runs codex and copilot
  as autonomous workers in git worktrees, with quota pre-flight (it asks before
  spending paid overage), strict prompt contracts, and merge + cleanup that
  never leaves a worktree behind.
- **openrouter-cli-subagent** — the same workflow routed through OpenRouter via
  the `ori` CLI, so subagent work costs cents rather than dollars. Discovers
  which models can actually call tools (a free million-token model that turns
  out to be a *music* model is not a coding agent), under a price ceiling
  defaulting to $0.50 per 1M output tokens — because free-only leaves one model
  family and a 20 req/min cap, while a few cents buys out of both. Checks the
  wallet before recommending anything paid, and splits author and reviewer
  context floors so cross-model review is genuinely possible.

**Decisions and memory**

- **critical-thinking** — when a summary flags anything for your decision, it
  arrives as an honest comparison table (pros, cons, cost, reversibility, a
  recommendation that admits its own downside, and the do-nothing default)
  instead of a "you might want to consider…" paragraph.

- **research-first** — before building, sweep registries and GitHub for a
  product that already fits; before any consequential answer, stand it on two
  independent sources ("redundant" code gets checked against both the code and
  its git history; internet answers always cite at least two origins).
- **confidence-ranker** — builds justified confidence before an answer drives
  an action: isolates the deciding claims, gathers the cheapest decisive
  evidence, ranks each claim, and reports READY / READY WITH CAVEAT / NOT
  READY. `/confidence` audits the previous answer.
- **adr** — Architectural Decision Records as small files in `.adr/`, read
  *before* planning so past decisions don't get undone by accident.
- **bookkeeper** — durable, non-derivable repository facts as small tagged
  entries in `.memory/`, with an index read first for cheap PageIndex lookup.

**Code style**

- **functional-typescript** — discriminated unions, `Result` over thrown
  exceptions, zod on both sides of every JSON boundary.
- **functional-csharp** — records, sealed-record unions, railway-oriented
  error handling.
- **functional-python** — frozen dataclasses, tagged unions with exhaustive
  `match`, `Result` over raising.

**Interfaces**

- **ux** — a style-agnostic way to answer "is this good UX?" with a rubric
  instead of an opinion: severity-rated heuristics plus metrics with published
  thresholds.
- **terminal-ux** — building terminal dashboards and visualisations with Ink,
  including the testing traps I hit so you don't have to.
- **tui-builder** — full-screen TUI work, with hard-won terminal-resize rules.
- **visual-plan** — turns text plans into reviewable visual plans with
  diagrams, file maps, and annotated code.

**Driving and observing** — manual testing by hand, not test suites

- **terminal-interaction** — drives a CLI, TUI, REPL or installer the way a
  human tester would: launch, send keys, read the screen back, report the
  finding. Searches for an existing MCP server or skill first, ships a
  zero-install PTY driver for when nothing is available, and replaces
  `sleep 2` with polling for the output you actually expect.
- **browser-interaction** — clicks through a page and reports what happened
  with evidence: structured ARIA snapshots rather than pixels, console and
  network errors, and the cross-browser truth that a green WebKit run is not
  Safari coverage. Searches for an MCP browser server first and recommends one
  when nothing is installed.
- **desktop-interaction** — drives Electron, Tauri and pywebview apps, either
  launched under control or attached to a running one over a debugging port.
  Honest about the support gradient: Electron is strong, `tauri-driver` has no
  macOS support at all, and pywebview on macOS can't be driven programmatically.
  Webview apps only — native Swift/Qt/WinUI is explicitly out of scope.

**Architecture**

- **vertical-slice** — organise code by feature, not by technical layer.

## Things that need more than markdown

Most skills are pure guidance and run anywhere. A few assume real tooling — the
installer flags these at the end of a run, auto-selects dependencies
(`parallel-build` pulls in `cli-coding-subagents` and `deep-plan`), and skips
platform-locked skills on the wrong OS:

| Skill | Needs |
|---|---|
| `cli-coding-subagents` | codex + copilot CLIs, installed and authenticated |
| `parallel-build` | the above, plus git worktrees |
| `terminal-ux` / `tui-builder` | Node ≥ 22 (Ink) |

## Writing your own portable skill

The body is just markdown — write whatever helps. Frontmatter is where
portability lives or dies, because Claude Code rejects any key it doesn't
recognise while other agents happily accept extras. Stick to this and you're
safe everywhere:

```yaml
---
name: my-skill
description: >
  What it does and, crucially, when an agent should reach for it. This field
  is the trigger — describe situations, not features.
license: MIT
metadata:
  author: You
---
```

The `metadata` block is free-form: this repo uses it for `requires` (prose,
shown after install), `depends` (machine-read by the installer), and `platform`
(gates installation by OS). One honest warning from experience: don't use
`when_to_use` — Codex and Tabnine read it, Claude Code refuses to load the
skill.

`npm run validate` checks all of this plus the subtle stuff (unbalanced code
fences, literal escape characters, script syntax, eval schemas, README coverage,
and aligned release metadata). `npm test` exercises the installer, validator,
package contents, and eval harness. CI runs both across Node 18/20/22 on Linux,
macOS, and Windows.

Eval JSON is executable rather than decorative. To run one case, provide any
candidate and judge commands that read a prompt from stdin and write their
answer to stdout; the judge must return `{ "pass": boolean, "details": string }`:

```bash
node install/run-evals.mjs --skill research-first --id 4 \
  --candidate codex --candidate-arg exec --candidate-arg=- \
  --judge codex --judge-arg exec --judge-arg=-
```

## Agents

Two original subagents live in `agents/` — dispatchable workers, not restated
guidance. Each exists because the job needs what a subagent uniquely has:
fresh context and a disposable budget.

| Agent | Why it's a separate agent |
|---|---|
| `plan-reviewer` | reviews a `plan.md` before dispatch — the author is the worst-placed person to spot their own missing seam, so this runs with zero authoring context. Returns VERDICT / BLOCKERS / NON-BLOCKING. |
| `code-archaeologist` | answers "why does this exist / safe to remove?" by walking both the code graph and git history — the dig is bulky, the caller only needs the verdict with shas. Read-only. |

The installer links them into `~/.claude/agents/` when Claude Code is a target
(they're Claude subagent format; other platforms don't consume them yet). Both
carry paired `.evals.json` suites, enforced by `npm run validate`.

### Recommended from upstream

The other agents I use are cherry-picks from
[github/awesome-copilot](https://github.com/github/awesome-copilot) (MIT,
GitHub's community pack) — they stay upstream's and install from there:

| Agent | What it does |
|---|---|
| `ai-team-dev` / `ai-team-producer` / `ai-team-qa` | a three-role AI team — implementation, sprint coordination, QA |
| `implementation-plan` | generate an implementation plan for a feature or refactor |
| `debug` | structured find-and-fix debugging |

Each has a one-click VS Code install button in the awesome-copilot README, or
drop the `.agent.md` into `~/.copilot/agents/`. When I write agents of my own,
they'll land here in an `agents/` directory with the same installer treatment.

## Good skills that live elsewhere

Deliberately not vendored — they belong to their authors and install fine from
upstream:

- [openai/skills](https://github.com/openai/skills) (Apache-2.0, OpenAI):
  `aspnet-core`, `chatgpt-apps`, `cli-creator`, and `frontend-skill` are installed
  as independent Codex copies with their bundled licenses and per-copy
  `ATTRIBUTION.txt`. Their exact installed revision was not recorded; update
  through the Codex curated installer rather than assuming they track `main`.
  `aspnet-core` incorporates material from
  [dotnet/AspNetCore.Docs](https://github.com/dotnet/AspNetCore.Docs), and
  `chatgpt-apps` references
  [openai/openai-apps-sdk-examples](https://github.com/openai/openai-apps-sdk-examples).
- [github/awesome-copilot](https://github.com/github/awesome-copilot) (MIT,
  GitHub): 29 Copilot copies are installed independently — `acquire-codebase-knowledge`,
  `batch-files`, `context-map`, `conventional-branch`, `conventional-commit`,
  `csharp-async`, `csharp-docs`, `csharp-xunit`, `dotnet-best-practices`,
  `dotnet-design-pattern-review`, `doublecheck`, `draw-io-diagram-generator`,
  `drawio`, `first-ask`, `mini-context-graph`, `nuget-manager`,
  `postgresql-code-review`, `postgresql-optimization`, `prd`,
  `premium-frontend-ui`, `prompt-optimizer`, `react-audit-grep-patterns`,
  `react-container-presentation-component`, `react18-batching-patterns`,
  `react18-dep-compatibility`, `react18-lifecycle-patterns`, `refactor`,
  `sql-code-review`, and `sql-optimization`. Each attribution pins the upstream
  tree SHA embedded by `gh skills install`; no frontmatter normalization was
  recorded. These are editable copies, not auto-updating links.
- [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, Paul
  Bakaus) — frontend design guidance with teeth: one skill behind
  `/impeccable <command>` with 24 commands (`shape`, `critique`, `audit`,
  `polish`, `bolder`, `quieter`, `distill`, `harden`, `animate`, `live`…), 61
  deterministic detector rules that run with no LLM and no API key, and live
  browser iteration. It started from Anthropic's
  [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
  and went considerably further. Installed globally 2026-10-02 — skill 4.5.0,
  engine 0.1.11 — for Claude Code, Codex and Copilot; caveats recorded in each
  copy's `ATTRIBUTION.txt`:
  - `npx impeccable install --yes --global --no-hooks --providers=claude,codex,copilot`
    needs Node ≥ 22.18 (nvm v24 here; the default v18 is too old). Run it from a
    neutral directory — without `--no-hooks` it also writes a project hook
    manifest into whatever repo you happen to be standing in.
  - Frontmatter is clean as shipped (`version` / `user-invocable` /
    `argument-hint` / `license`), so no normalization is needed for Claude Code.
  - **Its global provider dirs are not where two of these three CLIs read.**
    Upstream maps `copilot` → `~/.github/skills/`, but Copilot CLI reads
    `~/.copilot/skills/` (`copilot skill list` showed nothing until it was
    linked); and `codex` → `~/.agents/skills/`. OpenAI material currently
    documents both `.agents/skills/` and `.codex/skills/`; in this installation,
    Codex 0.152.1 did not discover the upstream `.agents` copy, so the existing
    compatibility link into `$CODEX_HOME/skills` (default `~/.codex/skills`) is
    retained. Fix without forking the install: symlink
    `~/.codex/skills/impeccable` and
    `~/.copilot/skills/impeccable` at the upstream directories, so
    `npx impeccable update` keeps updating one real copy each.
  - No runtime of its own — `scripts/impeccable` is a POSIX launcher around a
    self-contained engine binary (vendored per copy under
    `scripts/bin/<os>-<arch>/`).
  - Hooks skipped on purpose: upstream's design detector hooks are
    project-scoped (`${CLAUDE_PROJECT_DIR}`, `.codex/hooks.json`). Re-run the
    installer inside a project to get them.
  - Ships four subagents; the installer places them in `~/.claude/agents/` and
    `~/.copilot/agents/` by itself.
- [obra/superpowers](https://github.com/obra/superpowers) — the most-adopted
  skills framework; its `writing-plans` shaped `deep-plan`.
- [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Matt Pocock):
  engineering workflow; his ADR format seeded the `adr` skill here. Twelve
  independent Copilot copies are installed: `codebase-design`, `domain-modeling`,
  `grill-me`, `grill-with-docs`, `grilling`, `handoff`,
  `improve-codebase-architecture`, `setup-matt-pocock-skills`, `tdd`, `teach`,
  `to-prd`, and `triage`. Their exact revisions were not preserved; no content
  or frontmatter normalization was identified during the provenance audit.
- `git-guardrails-copilot` is a local Copilot-only skill, not an external
  dependency. No upstream or separate license declaration was discoverable;
  its `ATTRIBUTION.txt` records that limitation rather than inventing provenance.
- [rampstackco/claude-skills](https://github.com/rampstackco/claude-skills) —
  `after-action-report`: blameless postmortem/AAR framework (timeline, root
  cause, contributing factors, action items). Note: its upstream frontmatter
  carries keys Claude Code rejects — fold `category`/`catalog_summary`/
  `display_order` under `metadata:` when installing.
- [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) — ADHD-friendly
  output shaping (lead with the next action, numbered bounded steps, visible
  wins; 22k+ stars, actively maintained). Opt-in via `/i-have-adhd`; installs
  cleanly alongside these skills.
- [tjboudreaux/cc-thinking-skills](https://github.com/tjboudreaux/cc-thinking-skills)
  — 28 mental-model skills; `thinking-kepner-tregoe` and `thinking-pre-mortem`
  pair well with `critical-thinking` here, which escalates to them for one-way,
  expensive decisions.
- [affaan-m/ECC](https://github.com/affaan-m/ECC) — agent-harness system with
  ~39 skills under `.agents/skills/`. Installed four as a set:
  `coding-standards` (naming, KISS/DRY/YAGNI, immutability, code smells) plus
  the three it explicitly defers to — `frontend-patterns` (React/Next.js state,
  rendering, data fetching), `backend-patterns` (repository/service layers, N+1,
  pooling) and `api-design` (REST resource naming, status codes, pagination,
  versioning). Install them together or the deferrals dangle.
  **Caveats:** frontmatter is clean (`name`/`description` only, no
  normalization needed), but each skill ships an `agents/openai.yaml` — Codex
  harness display metadata, not a sub-agent, and not needed by Claude Code.
  `coding-standards` also points at `rules/common/coding-style.md`, a path
  relative to the ECC repo root; that file is not installed, so the pointer
  dangles. It is a *different* file from the identically-pathed one in a local
  `~/.claude/rules/` layer, which can serve as the substitute. Finally,
  `coding-standards` is the weakest of the four: its immutability and
  error-handling material restates what a `rules/common/` layer and the
  `functional-*` skills already cover, and its examples come from a
  Next.js/Supabase codebase. The three framework-specific siblings are where
  the actual value is.
  **Also the rules layer.** ECC's `rules/common/` is the origin of several
  files in the local `~/.claude/rules/common/` layer — `coding-style.md`,
  `hooks.md`, `patterns.md` and `security.md` are byte-identical copies.
  `coding-style.md` was re-synced 2026-08-22 to upstream `adebf3e`, having sat
  on the 2026-02-05 version for four months; the update adds Core Principles
  (KISS/DRY/YAGNI), Naming Conventions and Code Smells. The rest of that
  directory (`agents.md`, `development-workflow.md`, `testing.md`,
  `git-workflow.md`, `performance.md`) is locally customized to reference the
  skills here and must not be blind-synced. Provenance per file is recorded in
  `~/.claude/rules/common/ATTRIBUTION.txt`.
- [TerminalSkills/skills](https://github.com/TerminalSkills/skills) — ~1000
  tool-specific skills.
- [Claude plugin marketplace](https://github.com/anthropics/claude-plugins-official)
  — including `skill-creator`, whose validator these skills pass.

## Credits

Everything here is by **Matanel Gordon**, MIT licensed. Where a skill builds on
published thinking it says so inline — notably
[Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
and [MADR](https://adr.github.io/madr/) for ADR templates, and the
[Lore protocol](https://arxiv.org/html/2603.15566v1) for the git trailer schema.

Changes are tracked in [CHANGELOG.md](CHANGELOG.md). License: [MIT](LICENSE).
