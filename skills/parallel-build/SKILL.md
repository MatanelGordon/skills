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

If the user says "continue"/"keep going", or you have no context for work that is
clearly underway, run this first:

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)
cd "$(git rev-parse --show-toplevel)"
ls -t .plan/*/PROGRESS.md 2>/dev/null                        # all plans, newest first
grep -L 'Status:\*\* complete' .plan/*/PROGRESS.md 2>/dev/null   # the unfinished ones
```

Take the unfinished plan; if several qualify, use the most recently modified and
say which you chose. Then:

```bash
SK=$(ls -d "$HOME"/.claude/skills/cli-coding-subagents "$HOME"/.codex/skills/cli-coding-subagents \
        "$HOME"/.copilot/skills/cli-coding-subagents "$HOME"/.agents/skills/cli-coding-subagents \
        "$HOME"/.tabnine/agent/skills/cli-coding-subagents 2>/dev/null | head -1)   # fresh shell — relocate every call
PLAN=".plan/<plan-name>"                           # substitute the real name — quotes matter
cat "$PLAN/plan.md"        # what was intended (deep-plan owns this)
cat "$PLAN/PROGRESS.md"    # where execution got to
cat "$PLAN"/agents/*.md          # in-flight agents — see below
"$SK/scripts/wt.sh" list         # live worktrees, and whether they are dirty/merged
git log --oneline -15            # what actually merged
```

**Reconcile before trusting anything.** A crash lands between an action and its
progress write, so `PROGRESS.md` records *intent* while git records *fact*:

- `agents/*.md` are the only record of agents that were in flight when the
  session died — `PROGRESS.md` was never updated for them, because the thing that
  folds them in is what crashed. Read them all.
- A worktree in `wt.sh list` means an agent never got merged. Decide per worktree:
  - **clean + commits ahead** → verify its tests, then `wt.sh merge <slug>`.
  - **UNCOMMITTED** → the agent died mid-work. Inspect the diff. Either commit it
    on the agent's behalf and merge, or `wt.sh drop <slug>` and re-dispatch.
  - **clean + 0 ahead** → it never started. `wt.sh drop <slug>` and re-dispatch.
- Assume no subagent processes survived; nothing resumes on its own. Old logs are
  in `$PLAN/logs/`.

Then rewrite `PROGRESS.md` to match reality, re-run pre-flight, and continue.
`PROGRESS.md`'s **Resume here** line is your starting hypothesis, not the truth.

---

## 1. Pre-flight

Run `"$SK/scripts/precheck.sh"` and honor its per-tool lines before anything else
— in particular, **ask the user before using copilot when it reports paid overage
or unreadable quota (exit 20)**. No point planning a copilot split you are not
cleared to run.

## 2. Precondition: a reviewed plan must already exist

**This skill executes plans. It does not write them.** Dispatch without a plan is
how agents collide, because nothing has established who owns which files.

```bash
ls -t .plan/*/plan.md 2>/dev/null
```

- **No plan** → run the **`deep-plan`** skill first. It owns `.plan/`, produces
  `plan.md` with the file map and test strategy, and hands back here.
- **Plan exists but `Status: draft`** → not agreed yet. Do not execute it; take it
  through `deep-plan`'s review and get the user's approval.
- **Plan exists and `Status: approved`** → set it to `executing` and continue.

Everything you need comes from `plan.md`: the **file map** (who owns what), the
**shared surface** (phase 1's job), the **phase split**, and the **critical-path
tests** (your merge gate). If any of those is missing or vague, that is a planning
defect — send it back to `deep-plan` rather than improvising.

```bash
PLAN="$(git rev-parse --show-toplevel)/.plan/<plan-name>"    # from deep-plan
mkdir -p "$PLAN"/{prompts,agents,logs}
```

`.plan/` is committed. `PROGRESS.md` churns as you execute, so **commit its
updates as you go** — a dirty main tree makes `wt.sh merge` refuse with exit 3,
and the commits give the run a history worth having.

When execution proves the plan wrong, amend `plan.md`'s `## Amendments` section
rather than drifting from it silently.

## 3. Derive the split

**Phase 1 — foundation. Usually 1 agent. 2 only in a monorepo spanning separate
projects.** It builds everything phase 2 will share: types, interfaces, base
classes, config, dependencies, migrations, DI/route registries, barrel exports,
test harness and fixtures. Its real job is to make phase 2 collision-free — after
it merges, no two phase-2 agents should need the same file. Anything you are
unsure about belongs here, not in phase 2.

**Phase 2 — implementation. 2-4 agents, sized to the task.** Split along seams
that do not share files. Each agent owns a disjoint path set; every other agent's
paths are explicitly off-limits. If two agents need the same file, the split is
wrong — resplit or move that file into phase 1.

**Phase 3 — review. 2-4 agents, all in parallel:**
- **1-2 code-review agents** → `CR.md`, or `CR.part1.md` + `CR.part2.md` with
  disjoint scopes stated in each header. Prefer codex (or a Claude `Agent`).
- **1-2 security agents** → `SECURITY.md`, or `SECURITY.part1.md` +
  `SECURITY.part2.md`. Prefer codex (or a Claude `Agent`).

**Skip the security agents entirely for throwaway local projects under
`Desktop/Playgrounds`** — they will never ship and auditing them is noise. Code
review still runs. Check it mechanically:

```bash
case "$(git rev-parse --show-toplevel)" in
  */Desktop/Playgrounds|*/Desktop/Playgrounds/*) echo "SKIP security" ;;
  *) echo "RUN security" ;;
esac
```

Note the skip and its reason in `PROGRESS.md`.

Scale honestly: a 3-file feature does not need 4 phase-2 agents. One agent per
genuinely independent seam.

## 4. Dispatch a phase

Per phase — never start a phase before the previous one is merged and green:

1. Update `PROGRESS.md`: phase starting, agents, dispatch time.
2. `WT=$("$SK/scripts/wt.sh" new "$SLUG")` for each agent.
3. Launch **all agents of the phase in the background at once**
   (`run_in_background: true`). Sequential dispatch is not parallel work.
4. As each finishes, read only its terse report (`$OUT` / `tail`), then
   immediately fold it into `PROGRESS.md`.
5. Verify the critical-path tests **inside that agent's worktree** — the work is
   not in your tree yet: `(cd "$($SK/scripts/wt.sh path "$SLUG")" && <test cmd>)`.
6. `"$SK/scripts/wt.sh" merge "$SLUG"` — one at a time, resolving conflicts in the
   main tree as they surface.
7. Re-run the critical-path tests on the merged branch before opening the next phase.

If an agent goes quiet — no status-file or log movement for ~15 minutes and no
commits — treat it as hung (usually a missing flag), kill it, and re-dispatch.

Between phases, re-read the plan: phase 1's real output often shifts phase 2's
prompts. Update them rather than dispatching a stale prompt.

Phase 3 output is *findings, not fixes*. When CR/SECURITY come back, summarize for
the user and agree what to act on — CRITICAL and HIGH normally get fixed before
calling the build done.

## 5. PROGRESS.md discipline

`PROGRESS.md` is what makes a dead terminal survivable. Treat every write as
urgent — **update it the moment something changes, never in a batch at the end**:

- before dispatching a phase, and before each merge
- the instant an agent reports (fold its report in)
- whenever a problem appears — including ones you then solve
- whenever the "Resume here" line would become stale

It holds: current phase, per-agent state (tool, worktree, branch state, status),
condensed agent reports, problems hit, your todos, and a **Resume here** line
precise enough for a context-free session to act on.

**Concurrency — a deliberate deviation worth knowing:** parallel subagents must
never write `PROGRESS.md` themselves; simultaneous writes corrupt the one file the
whole resume story depends on. Instead every dispatch prompt *requires* the agent
to maintain its own `agents/<slug>.md`, and you fold those into `PROGRESS.md` as
they land. The progress requirement is still in every prompt — it just targets a
per-agent file. Net effect is the same and it survives 4 concurrent writers.

**Location:** all plan files live in the **main working tree**, addressed by
absolute path. Subagents run in worktrees but write to the main tree's
`agents/<slug>.md`. That absolute path is the only `.plan/` entry in a subagent's
allowlist — otherwise progress updates land on feature branches and conflict at
every merge.

## 6. Prompt additions

Use `$SK/references/prompt-template.md` in full — acceptance criteria,
critical-path tests, scope/off-limits, and its **Progress reporting** section
(point it at `<repo>/.plan/<plan-name>/agents/<slug>.md`, absolute). Also give the
plan directory as read-only context so the agent can read `plan.md` for the
overall design.

## 7. Finish

1. All phases merged; `wt.sh list` empty (`wt.sh gc` sweeps merged stragglers and
   reports any it skipped for uncommitted work).
2. Critical-path tests pass on the merged branch — **run them yourself**; an
   agent's `DONE` is a claim, not evidence.
3. `PROGRESS.md` final: status complete, what shipped, what was deliberately left.
   Set `plan.md`'s `**Status:**` to `complete`, and record any late amendments.
4. Report to the user: what was built, CR/SECURITY findings and their disposition,
   test results as they actually are, and anything left undone.

Do not commit or push beyond the merges unless asked.

---

## Anti-patterns

| Don't | Why |
|---|---|
| Dispatch phase 2 before phase 1 merges | The shared surface does not exist yet; agents invent conflicting versions of it. |
| Give two phase-2 agents the same file | Guaranteed merge conflict. Resplit, or move it to phase 1. |
| Batch `PROGRESS.md` updates for the end | The crash you are protecting against happens before the end. |
| Let subagents write `PROGRESS.md` | Concurrent writes corrupt the resume file. |
| Read a subagent's full transcript | Burns the context the whole design exists to protect. |
| Run the pre-merge tests in the main tree | The changes are not there yet; a pass means nothing. |
| Use 4 agents on a small task | Coordination overhead exceeds the work. |
| Security-audit a `Desktop/Playgrounds` repo | Throwaway local project; the user does not want it. |
| Report success from agent `STATUS: DONE` | Verify the tests yourself first. |
