---
name: parallel-build
description: >
  Plan a large assignment, then execute it with CLI coding subagents (codex/copilot)
  running in parallel across three phases — foundation, implementation, review — tracked
  in the plan directory that the deep-plan skill created. Use when the user hands over a
  big feature, migration, refactor, or multi-part build; when work is large enough to
  split across several agents; or when asked to plan-then-parallelize. Also use to
  RESUME an interrupted build — read the plan directory's PROGRESS.md and continue from
  where it stopped, even in a session with no prior context. Requires a plan from
  deep-plan; writes PROGRESS.md, per-agent prompts, CR.md and SECURITY.md beside it.
  Builds on the cli-coding-subagents skill.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: Dispatches via cli-coding-subagents; assumes git worktrees and those CLIs.
  depends: cli-coding-subagents, deep-plan
---

# Parallel build

Take a large assignment, plan it properly, split it across parallel CLI subagents
in three phases, and keep a live resumable record of the whole run.

**Read `cli-coding-subagents` first** — it owns pre-flight, dispatch flags,
worktrees, and the prompt contract. This skill is the orchestration layer on top.

Shell variables do not survive between Bash calls; set `SK` in each call that
needs it. `references/templates.md` has every file's shape.

---

## Resuming after a crash

If user says "continue"/"keep going", or you have no context for work underway, run:

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
cd "$(git rev-parse --show-toplevel)"
ls -t .plan/*/PROGRESS.md 2>/dev/null                        # all plans, newest first
grep -L 'Status:\*\* complete' .plan/*/PROGRESS.md 2>/dev/null   # unfinished ones
```

Take the unfinished plan; if several, use most recently modified and say which. Then:

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
PLAN=".plan/<plan-name>"                           # substitute real name — quotes matter
cat "$PLAN/plan.md"        # what was intended (deep-plan owns this)
cat "$PLAN/PROGRESS.md"    # where execution got to
cat "$PLAN"/agents/*.md          # in-flight agents
"$SK/scripts/wt.sh" list         # live worktrees, dirty/merged
git log --oneline -15            # what actually merged
```

**Reconcile before trusting.** Crash lands between action and progress write, so `PROGRESS.md` records *intent* while git records *fact*:

- `agents/*.md` are only record of agents in flight when session died — `PROGRESS.md` never updated for them. Read all.
- Worktree in `wt.sh list` means agent never merged. Decide per worktree:
  - **clean + commits ahead** → verify tests, then `wt.sh merge <slug>`.
  - **UNCOMMITTED** → agent died mid-work. Inspect diff. Commit on agent's behalf and merge, or `wt.sh drop <slug>` and re-dispatch.
  - **clean + 0 ahead** → never started. `wt.sh drop <slug>` and re-dispatch.
- Assume no subagent processes survived; nothing resumes on its own. Old logs in `$PLAN/logs/`.

Rewrite `PROGRESS.md` to match reality, re-run pre-flight, continue. `PROGRESS.md`'s **Resume here** is hypothesis, not truth.

---

## 1. Pre-flight

Run `"$SK/scripts/precheck.sh"` and honor per-tool lines — **ask user before using copilot when it reports paid overage/unreadable quota (exit 20)**. No point planning copilot split you're not cleared to run.

## 2. Precondition: a reviewed plan must already exist

**This skill executes plans. It does not write them.** Dispatch without a plan causes agent collisions.

```bash
ls -t .plan/*/plan.md 2>/dev/null
```

- **No plan** → run **`deep-plan`** first. It owns `.plan/`, produces `plan.md` with file map and test strategy, hands back here.
- **Plan exists but `Status: draft`** → not agreed. Do not execute; take through `deep-plan` review, get user approval.
- **Plan exists and `Status: approved`** → set to `executing` and continue.

Everything you need comes from `plan.md`.

## 3. Phasing

Three phases from `plan.md`:

| Phase | Name | Purpose |
|---|---|---|
| 1 | Foundation | Shared surface: types, interfaces, config, deps, migrations, DI/route registries, barrel exports, test harness/fixtures. |
| 2 | Implementation | Disjoint feature work per agent. Each path owned by exactly one phase-2 agent. |
| 3 | Review | Code review (CR.md) + security audit (SECURITY.md). Findings, not fixes. |

Security audit auto-skip for throwaway projects:

```bash
case "$(git rev-parse --show-toplevel)" in
  */Desktop/Playgrounds|*/Desktop/Playgrounds/*) echo "SKIP security" ;;
  *) echo "RUN security" ;;
esac
```

Note skip/reason in `PROGRESS.md`.

Scale honestly: 3-file feature doesn't need 4 phase-2 agents. One agent per genuinely independent seam.

## 4. Dispatch a phase

Per phase — never start before previous merged and green:

1. Update `PROGRESS.md`: phase starting, agents, dispatch time.
2. `WT=$("$SK/scripts/wt.sh" new "$SLUG")` for each agent.
3. Launch **all agents of phase in background at once** (`run_in_background: true`). Sequential dispatch is not parallel.
4. As each finishes, read terse report (`$OUT` / `tail`), immediately fold into `PROGRESS.md`.
5. Verify critical-path tests **inside agent's worktree** — work not in your tree: `(cd "$($SK/scripts/wt.sh path "$SLUG")" && <test cmd>)`.
6. `"$SK/scripts/wt.sh" merge "$SLUG"` — one at a time, resolving conflicts in main tree.
7. Re-run critical-path tests on merged branch before next phase.

If agent quiet ~15 min (no status-file/log movement, no commits) → hung (usually missing flag), kill and re-dispatch.

Between phases, re-read plan: phase 1 output often shifts phase 2 prompts. Update rather than dispatching stale prompt.

Phase 3 output is *findings, not fixes*. When CR/SECURITY return, summarize for user, agree what to act on — CRITICAL and HIGH normally fixed before calling build done.

## 5. PROGRESS.md discipline

`PROGRESS.md` makes dead terminal survivable. Treat every write as urgent — **update the moment something changes, never batch at end**:

- before dispatching phase, before each merge
- instant agent reports (fold report in)
- whenever problem appears — including ones you solve
- whenever "Resume here" would become stale

Holds: current phase, per-agent state (tool, worktree, branch, status), condensed agent reports, problems hit, todos, **Resume here** line precise enough for context-free session.

**Concurrency:** parallel subagents must never write `PROGRESS.md` — simultaneous writes corrupt resume file. Instead every dispatch prompt requires agent to maintain its own `agents/<slug>.md`, and you fold those into `PROGRESS.md` as they land. Progress requirement still in every prompt — just targets per-agent file. Net effect same, survives 4 concurrent writers.

**Location:** all plan files in **main working tree**, absolute path. Subagents run in worktrees but write to main tree's `agents/<slug>.md`. That absolute path is only `.plan/` entry in subagent's allowlist — otherwise progress updates land on feature branches and conflict at merge.

## 6. Prompt additions

Use `$SK/references/prompt-template.md` in full — acceptance criteria, critical-path tests, scope/off-limits, **Progress reporting** section (point at `<repo>/.plan/<plan-name>/agents/<slug>.md`, absolute). Also give plan directory as read-only context so agent can read `plan.md` for overall design.

## 7. Finish

1. All phases merged; `wt.sh list` empty (`wt.sh gc` sweeps merged stragglers, reports any skipped for uncommitted work).
2. Critical-path tests pass on merged branch — **run them yourself**; agent's `DONE` is claim, not evidence.
3. `PROGRESS.md` final: status complete, what shipped, what deliberately left. Set `plan.md` `**Status:**` to `complete`, record late amendments.
4. Report to user: what built, CR/SECURITY findings/disposition, test results as they are, anything left undone.

Do not commit or push beyond merges unless asked.

---

## Anti-patterns

| Don't | Why |
|---|---|
| Dispatch phase 2 before phase 1 merges | Shared surface doesn't exist; agents invent conflicting versions. |
| Give two phase-2 agents same file | Guaranteed merge conflict. Resplit, or move to phase 1. |
| Batch `PROGRESS.md` updates for end | Crash you're protecting against happens before end. |
| Let subagents write `PROGRESS.md` | Concurrent writes corrupt resume file. |
| Read subagent's full transcript | Burns context the design exists to protect. |
| Run pre-merge tests in main tree | Changes not there yet; pass means nothing. |
| Use 4 agents on small task | Coordination overhead exceeds work. |
| Security-audit `Desktop/Playgrounds` repo | Throwaway local project; user doesn't want it. |
| Report success from agent `STATUS: DONE` | Verify tests yourself first. |
