# Changelog

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
