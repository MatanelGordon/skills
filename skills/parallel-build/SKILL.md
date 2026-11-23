---
name: parallel-build
description: >
  Use when a job has two or more independent pieces, or the user asks to parallelize, split work across agents, or resume an interrupted build. Decides the seams, file ownership, phases and how many workers run at once; parallel by default. Each worker runs via cli-coding-subagents.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: cli-coding-subagents to run each worker; git for worktrees; an approved deep-plan plan for a phased build.
  depends: cli-coding-subagents, deep-plan
---

# Parallel build

## Purpose

This skill decides who does what and when. `cli-coding-subagents` runs each
worker; independent pieces run in parallel by default.

## Requirements

Read `cli-coding-subagents`. `$SK` is its directory, found with its Setup
block. Shell variables do not survive between Bash calls; set `SK` in each call
that needs it. A phased build requires an approved `deep-plan` plan. Shapes are in
[references/templates.md](references/templates.md).

## Instructions

### 1. Size the job

| Shape | Route |
|---|---|
| One piece, or pieces that share files | Use one worker, or do it yourself. Do not split it. |
| Pieces share no file and need no shared groundwork | Use a **quick split**: write the ownership table and dispatch every worker at once. It has no plan directory and no phases. |
| A shared surface must be built first, the work is more than about half a day, or the run must survive a crash | Use a **phased build**. It requires an approved plan from `deep-plan`. |

The default is parallel. Every piece that shares no file with another runs at
the same time. Run pieces one after another only when they share a file, one
needs another's output, or a rate limit caps how many can run.

Do not manufacture independence. A rename across three files is one piece, and
four agents on it cost more in coordination than they save.

### 2. Find the seams

A piece is independent when it can be merged alone and pass its own tests. Split
by feature, not by technical layer.

Write an ownership table with one row per worker: slug, paths owned, paths
off-limits, and test command.

Every path a worker running at the same time owns is off-limits to the others.
Shared files are where workers collide: `package.json`, lockfiles, shared types,
interfaces, base classes, config, dependencies, DI containers, route registries,
barrel exports, migrations, the test harness, and fixtures. Give each to one
owner whose work finishes first. A path with two owners running at the same time
is a planning bug: resplit, or move it to the earlier step.

### 3. Shape the phases

A quick split has one phase and no foundation. The rest of this section applies
to a phased build.

**A reviewed plan must already exist. This skill executes plans; it does not
write them.** Dispatch without a plan is how agents collide, because nothing
has established who owns which files.

```bash
ls -t .plan/*/plan.md 2>/dev/null
```

- **No plan**: run `deep-plan` first. It owns `.plan/`, produces `plan.md` with
  the file map and test strategy, and hands back here.
- **Plan exists but `Status: draft`**: do not execute it; take it through
  `deep-plan`'s review and get the user's approval.
- **Plan exists and `Status: approved`**: set it to `executing` and continue.

`plan.md` supplies the file map, shared surface, phase split, and critical-path
tests. If any is missing or vague, send that planning defect to `deep-plan`
rather than improvising. Amend `plan.md` under `## Amendments` when execution
proves it wrong; do not drift silently.

```bash
PLAN="$(git rev-parse --show-toplevel)/.plan/<plan-name>"
mkdir -p "$PLAN"/{prompts,agents,logs}
```

`.plan/` is committed.

**Phase 1 — foundation. Usually 1 agent. 2 only in a monorepo spanning separate
projects.** It builds the shared files listed in step 2. Its real job is to make
phase 2 collision-free: after it merges, no two phase-2 agents should need the
same file. Anything uncertain belongs here, not in phase 2.

**Phase 2 — implementation. 2 to 4 agents, sized to the task.** Use the disjoint
ownership from step 2. If two agents need the same file, resplit or move it into
phase 1.

**Phase 3 — review. 2 to 4 agents, all in parallel:**

- **1 to 2 code-review agents** write `CR.md`, or `CR.part1.md` and
  `CR.part2.md` with disjoint scopes in each header. Prefer codex, or a Claude
  `Agent`.
- **1 to 2 security agents** write `SECURITY.md`, or `SECURITY.part1.md` and
  `SECURITY.part2.md`. Prefer codex, or a Claude `Agent`.

Skip security agents for throwaway projects under `Desktop/Playgrounds`: they
will never ship and auditing them is noise. Code review still runs. Check:

```bash
case "$(git rev-parse --show-toplevel)" in
  */Desktop/Playgrounds|*/Desktop/Playgrounds/*) echo "SKIP security" ;;
  *) echo "RUN security" ;;
esac
```

Note the skip and its reason in `PROGRESS.md`.

Scale honestly: a 3-file feature does not need 4 phase-2 agents. Use one per
genuinely independent seam. The counts—1 foundation agent; 2 only for separate
monorepo projects; 2 to 4 implementation; 2 to 4 review—are defaults that were
chosen, not measured.

### 4. Decide how many run at once

Run `cli-coding-subagents` step 1 (Pre-flight) before fixing the split. A tool
that needs approval, is exhausted, or is unavailable changes the count: no point
planning a copilot split you are not cleared to run.

All independent pieces in a phase start together. The default cap is four per phase.
For free OpenRouter models, use the lower cap in `cli-coding-subagents`
`references/openrouter.md`. Start excess pieces as slots free up.

### 5. Run a phase

Never start a phase before the previous one is merged and green. For each phase:

1. In a phased build, first record its workers and dispatch time in
   `PROGRESS.md`.
2. Take each prompt's Scope and Off-limits lists from the ownership table; add
   the plan directory as read-only context. Use `cli-coding-subagents` steps 3
   (Worktree) and 4 (Prompt).
3. Start all workers together in the background with `cli-coding-subagents`
   step 5 (Dispatch), which also owns hang handling. Sequential dispatch is not
   parallel work.
4. Fold each report into `PROGRESS.md` the moment it lands.
5. Use `cli-coding-subagents` step 6 (Collect, verify, merge) per worker,
   including cleanup. Merge one at a time and resolve main-tree conflicts.
6. Rerun critical-path tests on the merged branch before the next phase.

Between phases, re-read the plan: phase 1 often shifts phase 2's prompts. Update
them rather than dispatching a stale prompt.

Phase 3 produces findings, not fixes. Summarize CR/SECURITY and agree what to act
on; CRITICAL and HIGH normally get fixed before calling the build done.

### 6. Track progress

A quick split keeps no progress file. A split that has to survive a crash is a
phased build.

`PROGRESS.md` makes a dead terminal survivable. Update it the moment something
changes, never in a batch at the end:

- before dispatching a phase, and before each merge
- the instant an agent reports; fold its report in
- whenever a problem appears, including ones you then solve
- whenever the `Resume here` line would become stale

It holds the current phase; each agent's tool, worktree, branch state, and
status; condensed reports; problems; todos; and a `Resume here` line precise
enough for a context-free session.

Workers never write `PROGRESS.md`; simultaneous writes corrupt the resume file.
Every prompt instead requires its own `agents/<slug>.md`, using the Progress
reporting section of the `cli-coding-subagents` prompt template. Fold each into
`PROGRESS.md` as it lands. Progress remains in every prompt, targets a per-agent
file, and survives 4 concurrent writers.

All plan files live in the main working tree, addressed by absolute path.
Workers write to its `agents/<slug>.md`; that path is the only `.plan/` entry in
their allowlist. Otherwise updates land on feature branches and conflict at
every merge.

Commit `PROGRESS.md` updates as you go. Otherwise the dirty main tree makes
`"$SK/scripts/wt.sh" merge` refuse with exit 3; commits also preserve run history.

### 7. Finish

1. All phases are merged and `"$SK/scripts/wt.sh" list` is empty.
   `"$SK/scripts/wt.sh" gc` sweeps merged stragglers and reports uncommitted ones
   it skipped.
2. Run critical-path tests yourself on the merged branch; a worker's `DONE` is
   a claim, not evidence.
3. Finalize `PROGRESS.md`: status complete, what shipped, what was left. Set
   `plan.md`'s `**Status:**` to `complete` and record late amendments.
4. Report the build, CR/SECURITY disposition, actual tests, and anything undone.

Do not commit or push beyond the merges unless asked.

## Resuming an interrupted build

For "continue", "keep going", or context-free work clearly underway, discover:

```bash
cd "$(git rev-parse --show-toplevel)"
ls -t .plan/*/PROGRESS.md 2>/dev/null
grep -L 'Status:\*\* complete' .plan/*/PROGRESS.md 2>/dev/null
```

Take the unfinished plan; if several qualify, use the most recently modified
and say which. Read intent, reported state, and git fact:

```bash
PLAN="$(git rev-parse --show-toplevel)/.plan/<plan-name>"
cat "$PLAN/plan.md"
cat "$PLAN/PROGRESS.md"
cat "$PLAN"/agents/*.md
"$SK/scripts/wt.sh" list
git log --oneline -15
```

Reconcile before trusting anything. A crash can land between an action and its
write, so `PROGRESS.md` records intent while git records fact. Read all
`agents/*.md`; they are the only record of workers in flight when it died.

A listed worktree was not merged. Decide per worktree:

- **clean + commits ahead**: verify its tests, then
  `"$SK/scripts/wt.sh" merge <slug>`.
- **UNCOMMITTED**: the worker died mid-work. Inspect the diff. Either commit it
  on the worker's behalf and merge, or `"$SK/scripts/wt.sh" drop <slug>` and
  re-dispatch.
- **clean + 0 ahead**: it never started. Run
  `"$SK/scripts/wt.sh" drop <slug>` and re-dispatch.

Assume no subagent processes survived; nothing resumes itself. Old logs are in
`$PLAN/logs/`. Rewrite `PROGRESS.md` to reality, rerun `cli-coding-subagents`
step 1 (Pre-flight), and continue. `Resume here` is a hypothesis, not the truth.

## Examples

- Request: three unrelated fixes. Route: quick split; all three start together.
- Request: a build sharing a types file and route registry. Route: phased build;
  run `deep-plan` first if needed, then put both files in foundation.
- Request: two changes editing one file. Route: one owner, or an earlier step.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Phase 2 starts before phase 1 merges | The shared surface does not exist; workers invent conflicting versions. Merge and test phase 1 first. |
| Two workers own one file | Guaranteed merge conflict. Resplit, or move it to phase 1. |
| `PROGRESS.md` updates are batched | The crash you protect against happens before the end. Update immediately. |
| Workers write `PROGRESS.md` | Concurrent writes corrupt the resume file. Give each its own status file. |
| Four agents handle a small task | Coordination overhead exceeds the work. Reduce the split. |
| A `Desktop/Playgrounds` repo gets a security audit | Skip it; the throwaway local project will never ship. |

## Limitations

This skill does not write plans; `deep-plan` does. It does not run workers;
`cli-coding-subagents` does. The agent counts are defaults, not measurements. A
quick split cannot be resumed.
