# Templates

## Plan directory layout

```
<repo-root>/.plan/<plan-name>/
  plan.md              # written by deep-plan: architecture, file map, phase split, tests
  PROGRESS.md          # live orchestration state — the resume file
  prompts/<slug>.md    # one dispatch prompt per subagent
  agents/<slug>.md     # one status file per subagent (THEY write these)
  logs/<slug>.log      # full transcript — never read into context unless debugging
  logs/<slug>.out.md   # the terse final report (codex -o); this is what you read
  CR.md                # or CR.part1.md + CR.part2.md
  SECURITY.md          # or SECURITY.part1.md + SECURITY.part2.md (omitted under Desktop/Playgrounds)
```

`deep-plan` creates the directory and writes `plan.md`; `parallel-build` adds
`prompts/`, `agents/`, `logs/` and the review outputs beside it
(`mkdir -p "$PLAN"/{prompts,agents,logs}`). Logs live here rather than `/tmp` so
they survive a reboot — after a crash they are often the only record of what an
agent did.

`.plan/` is **committed to git**: that is what lets other sessions and teammates
share the plan and architecture. Commit `PROGRESS.md` updates as you go rather
than letting the working tree sit dirty.

`<plan-name>` is concise and indicative: `oauth-device-flow`, `tui-memory`,
`split-billing-service`. Not `plan1`, not `implement-the-new-feature-we-discussed`.

**All of these live in the MAIN working tree and are addressed by absolute path.**
Subagents run in worktrees but write their status file to the main tree's
`agents/<slug>.md`. Never let a subagent write into `.plan/` inside its own
worktree — that puts the file on its branch and turns every progress update into a
merge conflict.

---

## plan.md

**Owned by the `deep-plan` skill** — see its `references/plan-template.md`.
Do not define or duplicate it here. This file covers only the artifacts
`parallel-build` writes during execution.

---

## PROGRESS.md

The resume file. Rewrite it whenever anything changes state — before dispatching,
the moment a report arrives, after each merge, on every problem.

When the build is finished the status line must read exactly
`**Status:** complete` — resume discovery greps for that to tell finished plans
from ones still needing work.

```markdown
# PROGRESS — <plan-name>

**Status:** phase 2 of 3 — in progress
**Updated:** <YYYY-MM-DD HH:MM>
**Repo:** <abs path>   **Base branch:** <branch>
**Plan:** ./plan.md
**Security phase:** enabled | SKIPPED (repo under Desktop/Playgrounds — throwaway local project)

## Resume here
<Literally what the next action is, precise enough for a session with zero
context to execute. e.g. "p2-feature-b reported DONE but is unmerged; verify
`npm test` then run `wt.sh merge p2-feature-b`. Then dispatch phase 3.">

## Phases
- [x] Phase 1 — foundation — merged
- [ ] Phase 2 — implementation — 2/3 merged, 1 running
- [ ] Phase 3 — review — not started

## Agents
| Slug | Phase | Tool | Worktree | Branch state | Status |
|---|---|---|---|---|---|
| p1-foundation | 1 | codex/high | removed | merged | DONE |
| p2-feature-a | 2 | codex/high | removed | merged | DONE |
| p2-feature-b | 2 | copilot/sonnet-5 | live | committed, unmerged | DONE — needs verify+merge |
| p2-feature-c | 2 | codex/xhigh | live | in progress | RUNNING since 14:05 |

Worktree root: `<parent>/.wt-<repo>/` · logs: `./logs/<slug>.log`
(Verify with `wt.sh list`; it is authoritative when this table is stale.)

## Agent reports
### p2-feature-a — DONE (merged 13:52)
- CHANGED: src/features/a/*.ts, tests/a.spec.ts
- TESTS: npm test -> pass (14)
- NOTES: <the agent's notes, condensed>

### p2-feature-b — DONE (unmerged)
- ...

## Problems
- <YYYY-MM-DD HH:MM> p2-feature-c hit a type error from phase 1's `Result<T>`;
  patched in its worktree — fold back into the shared type at merge.
- <resolved problems stay here, marked RESOLVED — they are the history>

## Todos
- [ ] verify + merge p2-feature-b
- [ ] wait on p2-feature-c
- [ ] dispatch phase 3 (2 CR agents; security skipped)
- [ ] run critical-path tests on the fully merged branch
```

---

## agents/<slug>.md

Written by the subagent (its prompt requires it), read by the orchestrator.

```markdown
# <slug>
STARTED: <HH:MM>
STATUS: RUNNING | DONE | PARTIAL | BLOCKED
STEP: <one line — what it is doing right now>
CHANGED: <paths so far>
TESTS: <command> -> pass|fail
NOTES:
- <decision / assumption>
BLOCKED: <what stopped it, what it needs>
```

---

## CR.md / SECURITY.md

```markdown
# Code Review — <plan-name>[ — part N]
**Reviewer:** <tool/model>   **Scope:** <paths or "phase-2 diff">   **Base:** <ref>

## Verdict
<2-3 sentences. Is it mergeable as-is?>

## Findings
### [CRITICAL|HIGH|MEDIUM|LOW] <title>
- **Where:** `path/to/file.ts:120`
- **What:** <the defect>
- **Why it matters:** <concrete failure: inputs -> wrong result>
- **Fix:** <specific change>

## Checked and OK
- <areas reviewed that were clean — so the next reader knows coverage>
```

`SECURITY.md` is the same shape, findings framed as
**Vulnerability / Attack scenario / Impact / Remediation**.
Two reviewers → `CR.part1.md` + `CR.part2.md` with **disjoint scopes** stated in
the header, so they do not review the same code twice.
