---
name: visual-plan
description: >
  Turn ordinary text plans into rich interactive visual plans with diagrams, file maps,
  annotated code, open questions, and UI/prototype review when useful.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Agent-Native Plans

Agent-Native Plans is structured visual planning mode for coding agents. Build
the plan as a scannable document with editable blocks: inline diagrams, code snippets,
open questions, and an optional top visual review area (wireframe canvas, live
prototype, or both in tabs). Architecture/backend plans stay document-only;
UI/product plans start with the top canvas/prototype (Visual Surface Choice owns that rule).

`/visual-plan` is the main entry point. Choose review mode: UI-first (product UI, review starts with screens), prototype-first (functional live prototype), design-first (full-fidelity branded screens), or visual-intake (questionnaire before planning). When a Codex/Claude Code/Markdown/pasted plan exists, `/visual-plan` uses it as the starting point.

## When To Use

Create a visual plan when it would be better as a reviewable artifact than a chat paragraph. This includes modest work (single UI surface with states, small workflow, before/after change, component/API/data-shape decision needing alignment) and larger multi-file, ambiguous, long-running, risky, or UI-heavy work. Use when architecture/data flow/UI direction/options/open questions benefit from inline diagrams/structured blocks, when the user needs to react before implementation, or when an existing text plan needs a richer review surface.

## Plan Discipline

- **Boundary with `deep-plan`.** `deep-plan` owns the committed text-based plan at `.plan/<name>/plan.md` — source of truth for execution, resume, and parallel-build. `visual-plan` does not own that file and must not replace it. When both apply: run `deep-plan` first, then use `/visual-plan` with that text as source. If only a visual review surface is wanted and no `.plan/` work is underway, `visual-plan` fires alone. Never hand off a hosted visual link as substitute for the committed plan file — different deliverables owned by different skills.
- **Gate thoughtfully.** A visual plan is a richer review surface, not only for giant projects. Use when user needs to see, compare, comment on, or approve a direction before code, even for modest UI/state/workflow changes. Skip for trivial, unambiguous work — typos, one-line fixes, single well-specified function — just make the change. Never pad a plan with filler or ship a single-step plan.
- **Research before you draft.** Read real files, actions, schema, patterns first; name actual files, symbols, data shapes. Check existing `actions/` before proposing endpoints; prefer named client helpers over raw fetch. Delegate wide exploration to a sub-agent. Lead with reuse: for each step, name what it reuses before what it adds.
- **Decide the hard-to-reverse bets first.** For non-trivial backend/data/API work, sketch where the feature is headed, then call out decisions expensive to undo once data/callers depend on them — wire format, public ids, data-model shape, auth/ownership boundaries — and get those right in the plan even if most ships later. Scope to the smallest first cut proving the approach without foreclosing it, stating what's in and what's deferred.
- **Keep examples at the right altitude.** For broad framework/product/operating-model changes, don't collapse into the first concrete example/provider/sync path mentioned. Separate core abstraction from motivating examples and app/provider adapters. Use examples for legibility but label them as examples unless they are the whole requested scope.
- **Publish standalone plans.** If user pasted/referenced/has a Codex/Claude Code/Markdown plan, treat as source material but rewrite as a clean standalone proposal.

## Visual Surface Choice

When the work is primarily UI/product (new screen, flow, component, before/after change), start the plan with a visual surface. Choose one:

| Mode | When |
|---|---|
| **UI-first** | Product UI; review should start with screens. Wireframes or low-fi mocks suffice; no code execution needed. |
| **Prototype-first** | Review should start with a functional live prototype. Code runs; interactions/transitions/data are real. |
| **Design-first** | Review needs full-fidelity branded screens. High-fidelity design artboards; no code execution. |
| **Visual-intake** | User explicitly wants a questionnaire before planning. Structured visual questionnaire; no canvas/prototype. |

Architecture, backend, data-model, API, and infrastructure plans stay document-only — no visual surface.

## Visual Plan Structure

A visual plan is a vertical document with these zones in order:

1. **Top Visual Surface** (optional, per Visual Surface Choice) — wireframe canvas, live prototype, design artboards, or questionnaire.
2. **Plan Header** — goal (one sentence), success signal (observable), out of scope (one sentence).
3. **File Map** — paths created/modified, responsibility per file, owner per file (agent slug or "you").
4. **Test Strategy** — critical-path test commands verbatim; edge cases enumerated per unit with coverage state (covered/out-of-scope/unknown).
5. **Phasing & Parallelism** — phase 1 (shared surface), phase 2 (disjoint features), agent assignment per file.
6. **Open Questions** — decisions not yet made, each with options and recommendation.
7. **Diagrams & Annotated Code** — inline where they clarify data flow, state machine, API shape, or component tree.
8. **Amendments Log** — dated entries when execution proves the plan wrong.

## Comment Handling

`get-plan-feedback` returns rich anchors — read before acting.

- **Coordinate frames.** `targetX`/`targetY` are percentages within `targetSelector`/`targetKind`. Bare `x`/`y` are percentages of whole plan. `canvasX`/`canvasY` are raw board-world pixels on design canvas.
- **Wireframe pins.** Anchors include `targetNodeId` and `targetNodePath` (e.g. `card > list > listItem "Acme Inc"`). Use `targetNodeId` with wireframe node patch ops; use `data-design-id` with `update-design-element-style`. Prefer node id/path over raw coordinates; fall back to coordinates + focused screenshot only when no node id present.
- **Text quotes.** Resolve `textQuote` against current prose using `contextBefore`/`contextAfter`. If `ambiguous: true`, ask user — do not guess.
- **Detached comments.** Flagged as `detached` in `detachedThreads`. Reconcile against rewritten content — never silently drop.
- **Routing.** `resolutionTarget` is the only routing signal: act on `agent`, treat `human` as context only. `@mentions` are people to notify, never a routing signal.
- **Two-axis state.** Mark every ingested comment as consumed (`consumedCommentIds` on `update-visual-plan`). Set `status=resolved` only on agent-targeted comments you actually addressed; leave human-targeted comments open.

## Visibility & Sharing

Use `set-resource-visibility` to change who can see a plan (public, login, org-scoped). Use `share-resource` to grant specific users/roles access by email/role. Gate visibility before sharing plans covering unreleased/private work — default to narrowest scope meeting review need.

## Setup & Authentication

Two ways into Plans:

**Coding agent (CLI).** Install once with Agent-Native CLI — installs Plans skills, registers hosted Plans MCP connector, runs auth/setup for selected local client(s) in same step (one-time browser sign-in at setup):

```bash
npx @agent-native/core@latest skills add visual-plan
```

After that, `/visual-plan` and `/visual-recap` are the two installed slash commands. Other planning modes (`create-ui-plan`, `create-prototype-plan`, `create-plan-design`, `create-visual-questions`) are MCP tools reachable from `/visual-plan`, not separate slash commands. Pass `--no-connect` to register connector without authenticating, then run `npx @agent-native/core@latest connect https://plan.agent-native.com --client all` when ready, or choose narrower `--client`. Auth and MCP tool loading are per client config/session.

**Browser (people you share with).** Open Plans editor, create/edit with no sign-up — work as guest. Sign in only to save/share; signing in claims guest plans into your account. Sharing/commenting require account: public/shared plans viewable by anyone with link, commenting needs agent-native account.

For fully offline, no-account use, run Plans app locally and sync plans to repo as MDX. This local mode is separate advanced path, not default hosted flow.

If a Plans tool returns `needs auth`, `Unauthorized`, or `Session terminated`, stop and give user reconnect step for their client: Codex/Codex Desktop runs `npx -y @agent-native/core@latest reconnect https://plan.agent-native.com --client codex` and starts new Codex session; Claude Code runs `/mcp` and chooses Authenticate/Reconnect for plan connector, or runs reconnect with `--client claude-code` and restarts Claude. To refresh every local client config with Plan entry, use `--client all`, then restart/reload each client. Reconnect re-authenticates WITHOUT reinstalling and finds entry by URL regardless of connector name. Never reinstall from scratch just to fix auth. Continue once connector available.

Hosted default: connect `https://plan.agent-native.com/_agent-native/mcp`. Do not put shared secrets in skill files.

## Local-Files Mode

Pass `--local-files` to `/visual-plan` to keep plan content in repo as MDX (`.plan/<name>/plan.mdx`). No content goes to Agent-Native Plan database. When sharing, you must publish via `publish-visual-plan` from local mode, which writes a hosted copy and summarizes new local bridge URL. Hosted comments, sharing, history, publish/export receipts unavailable until user explicitly opts into publishing.

Local-files mode prevents plan content from going to database. It does not make coding agent's language model local; host agent/model must also be local or otherwise approved by user.
