# skills

Agent Skills that install into **every** coding agent you use — Claude Code,
OpenAI Codex, GitHub Copilot and Tabnine — from one source of truth.

They follow the [Agent Skills open standard](https://agentskills.io) (`SKILL.md`
with YAML frontmatter, governed under the Linux Foundation AAIF since May 2026),
so the same folder is portable. Only the discovery directory differs per agent,
and the installer handles that.

## Install

```bash
git clone https://github.com/MatanelGordon/skills.git
cd skills
npm install
npm run install-skills
```

An interactive installer detects which agents you have, asks which skills you
want, and symlinks them in. Non-interactive:

```bash
node install/index.mjs --yes          # everything, into every detected agent
node install/index.mjs --yes --copy   # independent copies instead of symlinks
```

**Symlink is the default and recommended.** One source of truth: `git pull` here
updates every agent at once. Choose copy if you want to diverge per agent, or if
you're on Windows without developer mode.

## Where they land

| Agent | Personal skills directory |
|---|---|
| Claude Code | `~/.claude/skills/` |
| OpenAI Codex | `~/.codex/skills/` |
| GitHub Copilot | `~/.copilot/skills/` (also reads `~/.agents/skills/`) |
| Tabnine | `~/.tabnine/agent/skills/` (also reads `~/.agents/skills/`) |

`~/.agents/skills/` is a shared alias honoured by Copilot and Tabnine; the
installer offers it as its own target.

After installing: Copilot `copilot skill list` · Tabnine `tabnine skills list`.
Claude Code and Codex pick them up on next session start.

## The skills

### Planning and execution

| Skill | What it does |
|---|---|
| **deep-plan** | Turns a request into a plan someone with zero context can execute — investigation gate, disjoint file map, edge-case enumeration, coverage with shape. Owns `.plan/`. |
| **parallel-build** | Executes a plan across parallel subagents in three phases (foundation → implementation → review), with resumable `PROGRESS.md`. |
| **cli-coding-subagents** | Runs codex and copilot as autonomous subagents in git worktrees — quota pre-flight, dispatch flags, merge and cleanup. |

### Decisions and memory

| Skill | What it does |
|---|---|
| **adr** | Architectural Decision Records as small files in `.adr/`, consulted before planning so you don't undo past decisions. |
| **adr-in-git** | Puts rationale in git itself — why-not-what commits, decisions as annotated tags, and `adr.sh` to navigate them cheaply. |

### Code style

| Skill | What it does |
|---|---|
| **functional-typescript** | Pure functions, discriminated unions, `Result` over exceptions, zod on both sides of every JSON boundary. |
| **functional-csharp** | Records, sealed-record unions, `Result`/`ErrorOr`, railway-oriented composition. |
| **functional-python** | Frozen dataclasses, tagged unions with exhaustive `match`, `Result` over raising. |

### Interfaces

| Skill | What it does |
|---|---|
| **ux** | A style-agnostic rubric for judging UX — severity-rated heuristics plus measurable outcomes with real thresholds. |
| **terminal-ux** | Building testable terminal UIs and data visualisations with Ink. |
| **tui-builder** | Building and modifying interactive TUIs, with battle-tested terminal-resize rules. |
| **visual-plan** | Turns text plans into rich visual plans — diagrams, file maps, annotated code. |

### Architecture

| Skill | What it does |
|---|---|
| **vertical-slice** | Organise code by feature instead of by technical layer; minimise edit surface. |

### Machine

| Skill | What it does |
|---|---|
| **sweat-dreams** | Keeps your Mac awake while an agent works, and releases the moment it stops. |

## Skills with requirements

Portable in format, but they assume specific tooling. The installer warns about
these at the end of a run:

| Skill | Requires |
|---|---|
| `cli-coding-subagents` | codex and copilot CLIs installed and authenticated |
| `parallel-build` | the above, plus git worktrees |
| `sweat-dreams` | **macOS only** (`caffeinate`); detects claude/codex/copilot sessions |
| `terminal-ux` | Node ≥ 22 (Ink is React for CLIs) |
| `tui-builder` | Node with Ink + React, for full-screen TUIs |
| `adr-in-git` | git ≥ 2.35 for trailer formatting |

Everything else is plain markdown guidance and runs anywhere.

## Writing skills that stay portable

Frontmatter is the one place agents disagree. These files use only the fields
every platform accepts:

```yaml
---
name: skill-name
description: >
  What it does, and when the agent should reach for it. This field is what
  triggers the skill, so describe situations, not features.
license: MIT
metadata:
  author: Matanel Gordon
---
```

Avoid platform-specific keys. `when_to_use` works in Codex and Tabnine but
Claude Code's validator rejects unknown frontmatter keys outright — put that
guidance in `description` instead, where every agent reads it.

## Additional skills

Good skills that are **not** vendored here, because they're installable from
their own sources and belong to their authors. Install them from upstream rather
than copying.

**Ship with the Codex CLI** (Apache-2.0, OpenAI) — already present at
`~/.codex/skills/` once Codex is installed:

| Skill | About |
|---|---|
| `aspnet-core` | ASP.NET Core development, from [dotnet/AspNetCore.Docs](https://github.com/dotnet/AspNetCore.Docs) |
| `chatgpt-apps` | ChatGPT app building, from [openai/openai-apps-sdk-examples](https://github.com/openai/openai-apps-sdk-examples) |
| `cli-creator` | Build a composable CLI that Codex can call by name |
| `frontend-skill` | Frontend development guidance |

Codex also bundles system skills at `~/.codex/skills/.system/`: `imagegen`,
`openai-docs`, `plugin-creator`, `review-agent`, `skill-creator`.

**Worth installing from the community:**

| Source | Why |
|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | The most-adopted skills framework — brainstorming, plan writing, TDD, subagent execution, code review |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Engineering workflow — specs, triage, domain modelling, ADR format |
| [TerminalSkills/skills](https://github.com/TerminalSkills/skills) | ~1000 skills covering specific tools and frameworks |
| [Claude plugin marketplace](https://github.com/anthropics/claude-plugins-official) | Official plugins including `skill-creator` for authoring and evaluating skills |

## Credits

All 14 skills here are by **Matanel Gordon**, MIT licensed.

Where a skill builds on published work, it says so inline and links the source.
Notable influences: [Matt Pocock's ADR format](https://github.com/mattpocock/skills),
[obra/superpowers](https://github.com/obra/superpowers) for planning craft,
[MADR](https://adr.github.io/madr/) and
[Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
for ADR templates, and the [Lore protocol](https://arxiv.org/html/2603.15566v1)
for git trailer schema.

Third-party skills are deliberately **not** vendored — see
[Additional skills](#additional-skills) for where to get them from upstream.

## License

MIT — see [LICENSE](LICENSE).
