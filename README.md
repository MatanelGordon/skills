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
mode when it asks.

In a hurry, or scripting it:

```bash
node install/index.mjs --yes          # everything, every detected agent
node install/index.mjs --yes --copy   # copies instead of symlinks
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
| OpenAI Codex | `~/.codex/skills/` |
| GitHub Copilot | `~/.copilot/skills/` |
| Tabnine | `~/.tabnine/agent/skills/` |
| Shared convention | `~/.agents/skills/` |

That last row is worth knowing about: `~/.agents/skills/` is a cross-tool
convention that Copilot and Tabnine already read, and so do OpenCode, Cursor,
and Gemini CLI. Installing there once covers tools this repo doesn't even
target yet.

After installing: `copilot skill list` or `tabnine skills list` to confirm;
Claude Code and Codex pick skills up on the next session.

**Windows note:** the installer falls back to copying where symlinks need
developer mode, but several skills ship `.sh`/`.py` helper scripts that want a
POSIX shell — use Git Bash or WSL for those.

## What's in the box

Sixteen skills. The short version of each:

**Planning and execution**

- **deep-plan** — turns "build X" into a plan someone with zero context could
  execute: a clarity gate before anything is written, a file map where every
  path has exactly one owner, edge cases enumerated with a status each, and
  test commands quoted verbatim. Owns the `.plan/` directory.
- **parallel-build** — executes a plan across parallel subagents in three
  phases (foundation → implementation → review), with a `PROGRESS.md` designed
  so a fresh session can resume after a crash.
- **cli-coding-subagents** — the machinery underneath: runs codex and copilot
  as autonomous workers in git worktrees, with quota pre-flight (it asks before
  spending paid overage), strict prompt contracts, and merge + cleanup that
  never leaves a worktree behind.

**Decisions and memory**

- **critical-thinking** — when a summary flags anything for your decision, it
  arrives as an honest comparison table (pros, cons, cost, reversibility, a
  recommendation that admits its own downside, and the do-nothing default)
  instead of a "you might want to consider…" paragraph.

- **research-first** — before building, sweep registries and GitHub for a
  product that already fits; before any consequential answer, stand it on two
  independent sources ("redundant" code gets checked against both the code and
  its git history; internet answers always cite at least two origins).
- **adr** — Architectural Decision Records as small files in `.adr/`, read
  *before* planning so past decisions don't get undone by accident.
- **adr-in-git** — the same reasoning pushed into git itself: commits that say
  *why*, decisions as annotated tags, and an `adr.sh` that answers "why is this
  code like this?" from the CLI, cheapest query first.

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

**Architecture and machine**

- **vertical-slice** — organise code by feature, not by technical layer.
- **sweat-dreams** — keeps a Mac awake while an agent is working and lets it
  sleep the moment work stops. Ships its own CLI; the installer offers to put
  it on your PATH.

## Things that need more than markdown

Most skills are pure guidance and run anywhere. A few assume real tooling — the
installer flags these at the end of a run, auto-selects dependencies
(`parallel-build` pulls in `cli-coding-subagents` and `deep-plan`), and skips
platform-locked skills on the wrong OS:

| Skill | Needs |
|---|---|
| `cli-coding-subagents` | codex + copilot CLIs, installed and authenticated |
| `parallel-build` | the above, plus git worktrees |
| `sweat-dreams` | macOS (`caffeinate`) — auto-skipped elsewhere |
| `terminal-ux` / `tui-builder` | Node ≥ 22 (Ink) |
| `adr-in-git` | git ≥ 2.35 |

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
fences, literal escape characters, script syntax) and runs on CI for every PR.

## Good skills that live elsewhere

Deliberately not vendored — they belong to their authors and install fine from
upstream:

- The Codex CLI ships its own set (Apache-2.0, OpenAI): `aspnet-core` (from
  [dotnet/AspNetCore.Docs](https://github.com/dotnet/AspNetCore.Docs)),
  `chatgpt-apps` (from [openai/openai-apps-sdk-examples](https://github.com/openai/openai-apps-sdk-examples)),
  `cli-creator`, `frontend-skill`, plus system skills under `~/.codex/skills/.system/`.
- [obra/superpowers](https://github.com/obra/superpowers) — the most-adopted
  skills framework; its `writing-plans` shaped `deep-plan`.
- [mattpocock/skills](https://github.com/mattpocock/skills) — engineering
  workflow; his ADR format seeded the `adr` skill here.
- [tjboudreaux/cc-thinking-skills](https://github.com/tjboudreaux/cc-thinking-skills)
  — 28 mental-model skills; `thinking-kepner-tregoe` and `thinking-pre-mortem`
  pair well with `critical-thinking` here, which escalates to them for one-way,
  expensive decisions.
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
