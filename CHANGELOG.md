# Changelog

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
