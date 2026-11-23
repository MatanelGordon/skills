# Changelog

## 1.23.0 — 2026-11-24

- **Removing or renaming something now includes sweeping for what still names
  it.** `get-the-job-done` gains a rule: a removal or rename is not done until
  a sweep gate passes (a search that must come back empty outside history
  files) and every hit is fixed or listed for the user with its path. The sweep
  covers the repo (README tables, SVG text, eval cases, tests, other skills,
  CI, the installer), installed copies and links in every agent folder, and the
  user's own rules and memory. "It will dangle" is named as an anti-pattern.
  Four new eval cases (16 to 19): a removal, a flag rename, an agent report
  with dangling leftovers, and a negative case.
- `npm run validate` now fails when a current file names a skill that used to
  be under `skills/` and is not any more: by path (`skills/name`,
  `../name/SKILL.md`) anywhere, and a hyphenated name in any form. A
  single-word name (the retired `rank`) counts only as a path or, in docs, a
  `[rank](…)` link, because `` `rank` `` and **rank** are ordinary words there;
  that is the one form the check misses. Retired names come from git
  history, so committed and uncommitted removals and the old side of a rename
  are all caught with no list to maintain. `CHANGELOG.md` files, `.plan/` and `.adr/` are exempt. CI now checks
  out with full history, which the check needs, and a shallow clone under CI is
  reported instead of passing silently.
- `npm run install-skills` (and `uninstall`) prune links in the chosen agent
  folders that point into this repo's `skills/` or `agents/` and whose target
  is gone, printing each one. A real file or folder, a live link, a link
  elsewhere, and a target that exists but cannot be read are never touched.
  `doctor` now says so for such links. Running `install` from a branch that
  lacks a skill prunes that skill's link; installing again from the branch
  that has it restores it.

## 1.22.1 — 2026-11-21

- Redesigned the README opening around an original light/dark hero, a concise
  three-part value story, and a scannable contents list while preserving the
  repository's existing facts, workflow, and installation guidance.
- Replaced the old workflow illustration with a standard Mermaid flowchart so
  the default path and optional mutation branch render natively on GitHub.
- Removed the obsolete scratch-workspace fixtures, exclusions, validator
  bypasses, package rules, and historical named references. Skill directories
  are all validated normally; package tests keep their own isolated fixture.
- Removed the separately installed upstream `pbakaus/impeccable` provider
  builds, helper agents, and local updater state from this machine. The registry
  now states the intended policy directly: interface work uses the checked-in
  `impeccable-lite` skill, not the upstream full package.
- Refreshed all 27 checked-in skills as symlinks for Claude Code, OpenAI Codex,
  and GitHub Copilot, plus both Claude subagents, so each agent follows this
  checkout without independent copies drifting.
- Fixed the `council` helper, the validator, the eval runner, the root test
  runner, and `install/index.mjs` printing nothing and exiting 0 when started
  through a symlink, which is how a symlink-installed `council` skill is
  reached and which made the test runner report success without running a
  test. They compared the path as typed with the resolved module path; they now
  compare real paths, with a regression test per entry point.
- Fixed `npm test` exiting 9 before running anything on older Node 18 releases
  such as 18.18.0, which reject `--test-concurrency=1` as a bad option. The
  runner now asks the running Node whether it supports the flag and otherwise
  starts one test file at a time itself, so the suite stays serial.

## 1.22.0 — 2026-11-20

- **Added `test-hardening`.** The default post-implementation pass adds bounded
  tests for observable edge cases, produces any hand-fault red proof in a
  scratch copy/worktree, and returns production defects as failing regressions.
- **Added opt-in `mutation-testing`.** Five pinned adapters cover Mutmut,
  Stryker.NET, cargo-mutants, Gremlins, and StrykerJS with honest engine-specific
  scope. Raw labels stay separate from native meaning and workflow decisions:
  no coverage is actionable, native exclusions/out-of-scope work are counted,
  and pending, unrun, red-baseline, harness, or exhausted-budget work is
  incomplete.
- Updated `development-workflow` to keep hardening and independent review in the
  default feature path while selecting mutation testing only by explicit request
  or for configured, scoped, budgeted critical logic. Hosts without subagents or
  worktrees get fresh-context and disposable-clone fallbacks.
- Replaced candidate-history replay with a fail-closed, direct-parent Git gate.
  It uses plumbing immune to diff/submodule UI configuration, rejects hidden
  production history and unsafe file types, and imports only reported test paths
  with `git restore`. `FINAL: incomplete` stops the optional mutation stage for
  the user's risk decision and is never presented or committed as complete.
- Added 18 focused protocol regressions plus a dependency-free real worktree
  smoke that rejects a production-changing candidate, restores a reviewed test,
  and observes that test fail against its named boundary fault. `npm test` now
  discovers all repository tests portably instead of maintaining file lists.
- Corrected PSTACK provenance to `cursor/plugins`, added Lauren Tan's MIT
  attribution, and added a scheduled/opt-in upstream blob drift check. No
  external skill or runtime is vendored.
- Added the repository `browser-capture` companion with an exact-pinned
  Puppeteer runtime while preserving a Node-built-ins fallback inside copied
  and npx-installed Impeccable Lite skills. Chrome, Chromium, and Edge are
  discovered locally; no browser or dependency is downloaded during capture.
- Enforced the offline boundary with a process-owned deny proxy, exact preview
  bypass, page interception, new-target denial, worker/frame observation, and a
  pre-seeded WebRTC UDP preference. Real-Chrome regressions cover popup,
  prerender/speculation, frames, dedicated/shared/service workers, WebSocket,
  WebRTC, immutable evidence, and negative controls for flags/interception.
- Made diagnostics durable and actionable: mobile viewport mismatch, slight
  overflow, missing same-origin assets, unexpected navigation, nested cleanup
  failures, browser validation, symlink invocation, process-tree signals, stale
  staging, and relocatable evidence paths are covered.
- Kept the npm package single-bin so `npx github:MatanelGordon/skills` invokes
  the installer. Capture remains an explicit repository command.
- Clarified browser-interaction routing: installed libraries cover shell-only
  work, real-account mutations require confirmation, DevTools daemon policy is
  verified and URL-bounded on every call, and UA testing is limited to owned or
  authorized targets with native/headed mode first and no stealth claims.
- Added the browser and Impeccable suites to CI and consolidated repository
  executable syntax validation without entering nested dependencies.

## 1.21.1 — 2026-11-20

- Simplified `impeccable-lite` from a fresh contradiction audit: visual
  judgment is now the trigger, precise/function-only work bypasses the skill,
  open-ended ceremony is conditional, and the offline runtime is explicit
  opt-in for locally servable HTML.
- Clarified that the skill grants no network authority, `.impeccable-lite/` is
  the only runtime-state exception, standalone audit/capture work without an
  agent, and full workflow completion requires an independent reviewer.
- Fixed new-page workflows so direction and build can advance before the HTML
  artifact exists. Builder packets now carry only the selected direction and
  refuse to run without structured, path-contained edit ownership.
- Collapsed the redundant review phase into `audit`: non-ship findings return
  directly to `build`, while completion validates the audit, one isolated
  desktop/mobile capture generation, and the reviewer's session-bound ship
  return together. These project-local checks detect stale or altered evidence;
  they do not attest authorship or resist a malicious project writer.
- Documented and tested policy-failed capture generations as diagnostic output,
  while operational failures still publish nothing. Removed dead canonical-leaf
  and Chrome-argument code left over from the pre-generation capture layout.
- Expanded the bounded offline audit to catch remote static module imports,
  `importScripts`, and script-assigned remote resource URLs.
- Recompute audit findings at every evidence gate, recognize focus/reduced-motion
  rules in directly linked CSS, accept common valid unquoted/implicit/nested
  HTML patterns, and flag focus suppression or fixed-width CSS without requiring
  custom focus styling. Builder ownership now rejects symlinked paths both when
  recorded and when a packet is generated.
- Prevent preview symlinks from exposing dotfiles or `node_modules`, consolidate
  path-containment and safe-directory code, and remove an undocumented duplicate
  capture CLI wrapper.
- Correct the repository-wide MIT statement with the perception reference's
  explicit CC BY-SA 4.0 exception in the README, package metadata, and root
  license notice.
- Added automatic version 2 session migration to the smaller version 3 audit
  boundary, preserving resumability across this patch release.
- Corrected runtime documentation to distinguish persistent project outputs
  from temporary browser files, name the transitions with enforced evidence,
  and scope focus/reduced-motion checks to HTML plus directly linked CSS.
- Shortened repeated perception/runtime policy text, made mixed MIT/CC BY-SA
  licensing explicit, and replaced a duplicate refinement eval with a negative
  function-only frontend trigger. Regression coverage now exercises the smaller
  state machine, structured ownership, diagnostic publication, and added remote
  script patterns.

## 1.21.0 — 2026-11-19

- **Added a perception-first reference to `impeccable-lite`.** Explicit PFD,
  cognitive-load, first-impression, felt-fluency, trust-formation,
  stated-versus-observed behavior, and decision-architecture tasks can now load
  one compact local lens without activating a second default workflow.
- The reference is an original adaptation informed by Stefan Kovalik / Aurochs'
  [Perception-First Design](https://github.com/skovalik/perception-first-design),
  pinned to `1704ff61c18872a66d969e860c9b6e45a8f50f16` and attributed under
  CC BY-SA 4.0. No upstream skill, framework, corpus, commands, scripts, or
  learning logs are vendored.
- Resolved overlap explicitly: the user brief, product truth, accessibility,
  surface mode, local-only execution, evidence-based severity, and bounded
  verification outrank broad PFD triggers, fixed conversion heuristics, numeric
  scores, mandatory logs, corpus loading, and repeated Ralph loops.
- Added four behavioral evals covering perception/trust diagnosis, small-work
  bypass, expert-tool derivation with brief/accessibility precedence, and
  descriptive cross-regional analysis with explicit cultural calibration.

## 1.20.2 — 2026-11-19

- Removed upstream `pbakaus/impeccable` from the README's external-skill
  recommendations, including its download command and provider-path caveats.
  The repository now directs interface work to its checked-in, offline
  `impeccable-lite` skill instead. Upstream inspiration and license credit stay
  in `impeccable-lite`'s provenance and historical changelog entries.
- Documented the fail-closed manual recovery step for the unlikely case where a
  hard crash leaves Impeccable Lite's stale-lock recovery mutex behind.

## 1.20.1 — 2026-11-19

- **Installer ownership is now checked before replacement.** Only links owned
  by this repository and explicitly marker-owned copies refresh automatically.
  Foreign links, unmarked copies (even when byte-identical), unrelated
  same-named content, and edited managed copies are preserved. Interactive
  installs can make a timestamped backup before replacement; noninteractive
  installs report conflicts and exit nonzero. Agent files use the same policy.
- **Command parsing is strict and tested.** Unknown or duplicate commands and
  flags fail before installation, `--all --yes` really targets every platform,
  and incompatible platform selections (including dependencies) are rejected.
- **Validation now covers behavior and release surfaces.** It rejects malformed
  skill directories, checks eval schemas, README coverage,
  changelog and lockfile versions, and caught/fixed a duplicate `adr` eval key.
- **Eval suites can run.** `install/run-evals.mjs` executes a selected skill eval
  through caller-supplied candidate and judge processes with timeouts and a
  machine-readable verdict. Installer, validator, eval-runner, and npm-package
  integration tests run in CI on Linux, macOS, and Windows across Node 18–22.
- **Published package contents are allowlisted.** Runtime installer, skills, and
  agents ship; `.github` and local scratch workspaces do not.
- **External-skill provenance was backfilled.** Attribution now covers 42
  Copilot copies and four Codex curated copies, and the README records upstream,
  license, revision limitations, normalization, and update caveats. Codex docs
  now acknowledge both `.agents/skills` and `.codex/skills` conventions.
- Regenerated lockfile release metadata at 1.20.1.

## 1.20.0 — 2026-11-19

- **New skill: `impeccable-lite`.** A compact design workflow for designing,
  redesigning, critiquing and polishing user-facing interfaces. Its optional
  self-hosted runtime uses Node.js built-ins only: explicit phase state, bounded
  direction/builder/reviewer packets, static offline and accessibility checks,
  a loopback preview, and desktop/mobile captures through installed Chromium.
  It has no downloaded binaries, hooks, updater, telemetry, external catalog,
  package install, Docker dependency or mandatory product/design documents.
- **Kept the useful design core:** the brief outranks taste; refinement preserves
  while redesign may replace; the surface's job determines its priorities; one
  coherent direction beats averaged safe styles; common AI-design habits are
  warnings rather than universal bans; verification is one batched inspection,
  one fix batch and at most one confirmation.
- **Credited, but did not vendor, upstream Impeccable.** The new skill is an
  independently written local distillation inspired by
  [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, Paul
  Bakaus). None of its 16 MB runtime, command system, detector, catalog, hooks,
  binaries or external-service machinery is copied into this repository.
- Eight behavioral evals cover established-product redesign, focused
  refinement, read-only critique, the no-network boundary, backend trigger
  exclusion, narrow manual training, optional runtime routing, and a fresh
  read-only review handoff.
- The offline runtime fails closed at its boundaries: symlink-safe output,
  exact-origin browser interception, self-only preview CSP, isolated capture
  generations, atomic lock ownership, content-hashed audit/capture staleness
  checks, session-bound reviewer evidence, phase gates, inert JSON prompt data, and
  bounded inspection of local JS/CSS dependencies.
- Thirty Node tests cover workflow transitions, prompt containment, path
  and server boundaries, audit rules, CLI integration, browser isolation,
  capture rollback, and real 390px CSS viewport evidence.
- Synchronized the stale package-lock version metadata with the package version.

## 1.19.1 — 2026-10-02

- **Registered [pbakaus/impeccable](https://github.com/pbakaus/impeccable)**
  (Apache-2.0) under "Good skills that live elsewhere" — frontend design
  guidance with 24 commands, 61 deterministic detector rules, and live browser
  iteration; a descendant of Anthropic's `frontend-design`. Installed globally
  (skill 4.5.0, engine 0.1.11) for Claude Code, Codex and Copilot, not vendored.
- **Recorded the install caveat worth knowing:** upstream's global provider
  dirs miss two of the three CLIs here — `copilot` resolves to
  `~/.github/skills/` (Copilot CLI reads `~/.copilot/skills/`) and `codex` to
  `~/.agents/skills/` (Codex 0.152.1 reads `$CODEX_HOME/skills`). Both are
  symlinked from the dirs the CLIs actually read, so `impeccable update` still
  updates one real copy each. Also: the installer writes a project hook
  manifest into the current directory unless `--no-hooks` is passed.

## 1.19.0 — 2026-09-02

- **New skill: `council`.** Convenes a mechanically selected subset of eight
  contrast-written personas to pressure-test consequential architectural
  decisions on a weak, closed-network, single-model harness.
- **Round 1 stays independent.** Members spawn in isolated contexts with a
  forced vote-and-falsifier format; a string-comparable convergence check sends
  only unanimous high-confidence results through a Devil's Advocate gate.
- **Round 2 resists conformity.** Responses are anonymized under freshly
  shuffled labels, the persona-to-label mapping is recorded before prompts are
  built, and every member must steelman an opposing response before updating
  or defending its vote.
- **The chairman discounts correlated agreement.** Matching reasons count as
  one voice, confidence is bucketed rather than numerically weighted, and an
  observable `WOULD CHANGE MY MIND` falsifier is the credibility signal.
- **Weak-harness failures close mechanically.** Three usable responses make a
  quorum, malformed casting-director output becomes `NONE NEEDED`, sequential
  isolated spawning replaces unavailable parallel spawning, and a harness
  with no sub-agents declines instead of simulating a council in one context.
- Six behavioral evals cover trigger boundaries, convergence and DA stopping,
  casting-director rejection, falsifier credibility, and the Hupert-Graph
  in-stack-fix calibration that prevents incremental rewrites from masquerading
  as several small missions.

## 1.18.1 — 2026-09-02

- **`rank` hardened against the failure modes documented in real rating
  systems** (NATO Admiralty critiques, GRADE, 2025 LLM-calibration research):
  - **Prose must match the tag.** Readers weight sentence assertiveness over
    labels — "retries cap at 3 `[GUESS]`" still lands as fact. Below TRACED,
    the doubt goes in the words too; new anti-pattern row to match.
  - **VERIFIED covers exactly what was run.** One probe verifies that
    scenario; the "always" generalization is a separate, lower-ranked claim
    (GRADE's indirectness downgrade, applied to code).
  - **Corroborated claims name their legs**: `[TRACED ×2: path + git log]` —
    the Admiralty Code's missing corroboration count, made visible.
  - **A busted rank is a finding.** Ranked claims that later prove wrong get
    recorded (bookkeeper/ADR) with the rank they carried — the calibration
    feedback loop these scales rot without.
  - New eval covering generalization and prose-hedging.
- **`rank` wired into the pipeline** — previously nothing referenced it:
  `research-first` names it as the fixed vocabulary for single-source labels;
  `development-workflow` stage 0 requires ranked findings from undocumented
  code, with upgrade clauses becoming verify-first plan tasks.

## 1.18.0 — 2026-09-02

- **New skill: `rank`.** Attaches per-claim confidence ranks to answers built
  from reading undocumented code — automatically on research dives ("how does
  X work", "why does Y exist", "is it safe to change W"), manually via
  `/rank` on the previous answer or a single supplied claim.
- **The tag names the evidence, not the feeling.** VERIFIED (executed it) /
  TRACED (read the full path including callers) / INFERRED (names, types,
  partial reading) / PATTERN (convention from similar code) / GUESS — so a
  reader can tell what was observed from what was extrapolated. Boundary
  rules pin the edges where inflation lives: a function without its callers
  is INFERRED, an unrun test is TRACED, types are not execution.
- **Every rank below VERIFIED carries its upgrade**: one runnable clause
  (run X, read caller Y, `git log -S` Z) — the answer ships with its own
  verification to-do list. If the upgrade costs under a minute, it gets
  executed instead of tagged.
- **Calibration is anti-inflation by construction.** Torn between two ranks →
  the lower wins; undocumented + unfamiliar caps the default at INFERRED
  until the path is walked or run; a downgraded honest rank beats an
  inflated one because it fails openly instead of exactly when relied on.
- Over-ranking is named as the failure mode: documented behavior, verbatim
  quotes and trivia get no tag — ranks on everything are ranks on nothing.
- Serves as the fixed vocabulary for the confidence labels `research-first`
  already requires on single-sourced claims.

## 1.17.0 — 2026-08-22

- **New skill: `get-the-job-done`.** Guards against work that looks finished —
  the done report at 80%, the silently narrowed scope, the summary containing a
  number nobody checked. Completion claims become `GATES.md` entries with a
  runnable `CHECK` behind each; `scripts/gate-check.sh` re-runs them.
- **Catches the stale tick**: a box ticked earlier whose check now fails, which
  is either a regression or a box ticked on a promise rather than a run.
- **An empty gates file exits 2, not 0.** A checker that reports success over
  zero gates manufactures exactly the false confidence it exists to prevent.
- **Read-only and hook-free, both deliberate.** The checker never writes, which
  is what makes it safe under parallel agents — verified with six concurrent
  runs leaving the file byte-identical and returning identical results. And no
  turn-blocking hook: enforcement that cannot be cleanly removed fails closed on
  every future task. CI is the right place for hard enforcement.
- Does not repeat the inspiration's headline claim that depth multiplies effort,
  which that author's own six-run test falsified (a six-layer tree cost 1.0-1.5x
  a three-layer one, not 8x); decomposition is recommended for checkability
  instead, with the effort guarantee moved to per-leaf gates — which the same
  measurements put at 1.6-3.9x.
- Per-check timeouts kill the whole process group, so a timed-out `npm test` or
  `docker run` cannot keep holding ports and CPU after the gate is reported.
- Gates are located through the installed skill directory, and the reference
  says where gates live: task gates beside the plan in `.plan/`, standing
  invariants in the root `GATES.md` and in CI.
- Inspired by [Leonxlnx/unlazy](https://github.com/Leonxlnx/unlazy) (MIT),
  credited in the description and body.

## 1.16.2 — 2026-08-22

- README: record that ECC's `rules/common/` is the origin of part of the local
  `~/.claude/rules/common/` layer, discovered while installing its skills.
  `coding-style.md` there turned out to be byte-identical to ECC's 2026-02-05
  version — a pristine copy that had gone four months stale, not a divergent
  local file.
- Re-synced it to upstream `adebf3e`, which adds Core Principles
  (KISS/DRY/YAGNI), Naming Conventions and Code Smells. Those three sections
  were precisely the gap that made the `coding-standards` skill look redundant
  when it was in fact covering what the stale copy had lost.
- Only that one file was touched. `hooks.md`, `patterns.md` and `security.md`
  are also pristine but current; `agents.md`, `development-workflow.md`,
  `testing.md`, `git-workflow.md` and `performance.md` carry local edits that
  reference the skills here and would be clobbered by a blind sync.
- Per-file provenance now lives in `~/.claude/rules/common/ATTRIBUTION.txt`,
  so the next person to look does not have to re-derive it from a diff.

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
