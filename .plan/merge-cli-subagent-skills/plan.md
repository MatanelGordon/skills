# Plan: merge-cli-subagent-skills

**Status:** executing
**Created:** 2026-11-23   **Base branch:** `main` (4019691), work on `refactor/merge-cli-subagent-skills`

## Goal

Today three skills cover delegation: `cli-coding-subagents` (run a codex or
copilot worker), `openrouter-cli-subagent` (the same through `ori`) and
`parallel-build` (phased execution). SkillEvaluator Tier 2 puts their
descriptions at 0.88 to 0.905 similarity and their bodies at 0.86 to 0.90, and
finds two passages repeated inside `cli-coding-subagents`.

When this is done there are two skills with one job each:

- `cli-coding-subagents`: **how to run one worker** (codex, copilot, or
  OpenRouter through `ori`).
- `parallel-build`: **how to split a job between workers**.

Every fact lives in one of them and the other points to it.

Success signals, each with the command that checks it. `$RUN` is
`/Users/matanelgordon/Desktop/Projects/skills-improvement-run`, `$WT` is this
worktree, and `$D` is `$RUN/data/j2`.

1. `npm test` and `npm run validate` pass, and
   `test ! -e skills/openrouter-cli-subagent` succeeds.
2. Tier 2 similarity between the two skills is below 0.85 for the description
   and for the full body (0.905 and 0.897 today, from
   `/Users/matanelgordon/Desktop/Projects/skillevaluator-data/RESULTS.md`, same
   embedding model), with no
   repeated-content finding:
   `$RUN/bin/se.sh similarity-check $WT/skills --save-catalog $D/tier2-after/catalog-desc.json`,
   the same with `--full-body`, and
   `$RUN/bin/se.sh tier2 $WT/skills/<name> --catalog $D/tier2-after/catalog-desc.json -r cli,json -o $D/tier2-after/<name>`
   for each of the two skills.
3. Tier 1 quality is not lower than 85.0 (merged skill) and 89.5
   (`parallel-build`), with fewer findings than the three skills have today
   (28 + 24 + 18 = 70, in `$D/tier1-before/`):
   `$RUN/bin/se.sh tier1 $WT/skills/<name> --no-llm -r cli,json -o $D/tier1-after/<name>`.
4. On `qwen/qwen3-coder-30b-a3b-instruct`, three attempts per case at
   temperature 0.7, the cases carried from both old skills pass at least as
   often with the merged skill as with the originals:
   `ASE_TEMPERATURE=0.7 $RUN/bin/ase.sh $D/before/skills $D/ase-before/a<n>` against
   `ASE_TEMPERATURE=0.7 $RUN/bin/ase.sh $D/after/skills $D/ase-after/a<n>`, n = 1 to 3.
   `$D/before/skills` is `git archive 4019691` of the three old skills with
   the new cases copied over them: old `cli-coding-subagents` gets ids 1 to 4,
   14 and 15; old `openrouter-cli-subagent` gets ids 5 to 13; old
   `parallel-build` gets all eight of its cases; each file's `skill_name` is its
   folder. It does not depend on the worktree, so deleting the old skill does
   not affect it. `$D/after/skills` is a copy of the
   two new skills.
5. Both descriptions are 300 characters or fewer and start with the words
   `Use when` (267 and 281 characters as drafted).

## Out of scope

- The bodies of `deep-plan`, `development-workflow`, `get-the-job-done`,
  `visual-plan` and `agents/plan-reviewer.md`. They name `parallel-build`, which
  keeps its name, so none needs an edit.
- `install/` code. Nothing there names these skills.
- Merging `precheck.sh` and `ori-precheck.sh` into one script. They stay two
  scripts with their current behaviour.
- Lifting the "do not use `ori claude`" warning. No record says it was fixed.
- `metadata.tags` and the words `run_script`, which Tier 1 asks for. The Agent
  Skills spec makes `metadata` a string-to-string map and agent-skills-eval runs
  with `strict: true`; `run_script` is one tool's vocabulary.
- Anything under `~/.claude`, `~/.codex`, `~/.copilot`, and the main checkout.

## Background

Read-only archaeology (code-archaeologist, 23 Nov) established:

- **Name.** No decision requires the two skills to be separate. cbae181 added
  the OpenRouter skill as "Routes the existing cli-coding-subagents workflow
  through ori"; CHANGELOG 1.14.0 says it references that skill "rather than
  restating it". 340a91e folded `adr-in-git` into other skills the same way.
- **`parallel-build`'s plan precondition** is from the root commit 94611f7. Its
  stated reason is "Dispatch without a plan is how agents collide, because
  nothing has established who owns which files". Nothing forbids a small split
  without a plan, but `deep-plan` owns `.plan/`, so a plan-less split must keep
  its files out of `.plan/`.
- **The "complete installation" resolver** (d849ffd) fixed helpers being run
  from `./scripts` in the project and a `SKILL.md`-only copy being selected.
  The `ls -d ... | head -1` form in the other two skills is exposed to the
  second bug, and the merge creates that exact case: an old copied
  `cli-coding-subagents` has `scripts/` but no `ori-*.sh`.
- **`ori-codex-home.sh` line 38** compares a link with its own target, so the
  "leave if correct" branch never runs. The end state is still right.
- **The numbers** (1 foundation agent, 2 to 4 per phase) were chosen in 94611f7,
  not measured. The one measured figure is 429 errors at five concurrent
  free-model reviewers (7f99ca4).
- **A wording-compression pass over every `SKILL.md` (e46c941) was reverted the
  same day (bdb4d97).** This plan moves and de-duplicates text. It does not
  paraphrase rules into shorter ones.

Found while planning, on codex-cli 0.170.0 (the skill says "verified against 0.147.0"):

- `codex exec resume <id> --color never` exits 2 with "unexpected argument
  '--color'". `codex exec --color never resume <id>` parses. Both copies of the
  documented resume command are broken on the installed version.
- `codex exec` defaults to `approval: never`, and now has `-s workspace-write`
  and `--add-dir`.

Baseline on this branch before any change: `npm test` passes in all 10 test
files, `npm run validate` reports 27 skills valid.

## Approach

**The name `cli-coding-subagents` survives.** It is the base the other two
already depend on (`depends:` in `parallel-build`; "Builds on" in the OpenRouter
skill), it describes all three routes (codex, copilot and `ori` are CLIs that run
coding subagents), every installed link to it stays valid, and the repo names it
in five places against four for `openrouter-cli-subagent` (all in `README.md`).
It also has the strongest measured lift of the three (+0.26 Tier 3, +0.48
agent-skills-eval), so its name and trigger are known to load.

**OpenRouter becomes a mode.** Its detail moves to
`references/openrouter.md`; `SKILL.md` keeps a short section saying when the mode
applies and what differs. The three `ori-*.sh` scripts move with `git mv`, so
their history and exec bits survive.

**The split between the two skills** is the table under Architecture. The rule
used to place each fact: if it is true with exactly one worker, it belongs to
`cli-coding-subagents`; if it only exists because there are two or more, it
belongs to `parallel-build`.

**Two behaviour changes the user asked for:**

- *Worktrees automatically.* Whenever the project is a git repository each
  worker gets its own worktree without the user asking. `wt.sh` gains exit code
  4 for "not a git repository" so the check is mechanical, and the skill says
  what to do then.
- *Parallel by default.* `parallel-build` opens with a sizing table whose
  default is to run independent pieces at the same time. It gains a **quick
  split** for pieces that share no file and need no shared groundwork: an
  ownership table and one dispatch, with no plan directory. The phased build
  keeps its precondition of an approved `deep-plan` plan.

**Rejected:**

- A new name for the merged skill. It would break `depends:`, installed links
  and five references for no gain in clarity.
- Keeping the `SK=...` resolver in every command block. It is the largest
  repeated passage in all three skills (11 copies). It is stated once, checks
  for a complete installation, and later blocks start with `SK=<that path>`.
- Folding the split rules into the merged skill and deleting `parallel-build`.
  The user's global rules and four other skills route to `parallel-build` by name.
- Keeping the OpenRouter anti-pattern table. All 13 rows restate a rule from
  the section above it. Each rule is kept once, with its reason.

## Architecture

### Where each fact lives

| Fact | Home | The other skill |
|---|---|---|
| Locating the installed skill (`$SK`), complete-installation check | `cli-coding-subagents` Setup | points to it |
| Run directory for prompts, logs and status files | `cli-coding-subagents` Setup | `parallel-build` says it is the plan directory in a phased build |
| Pre-flight: exit codes, paid-overage approval, `ori` credential | `cli-coding-subagents` step 1, `references/openrouter.md` | "run it before deciding the split" |
| Which tool, model and effort for a kind of work | `cli-coding-subagents` step 2 | points to it |
| Worktree per worker, automatic; no-git fallback; `wt.sh` commands and exit codes | `cli-coding-subagents` steps 3 and 6 | points to it |
| Prompt contract, status-file shape, output contract | `references/prompt-template.md` | points to it |
| Command blocks and flags, follow-ups and resume | `references/invocation.md` | not mentioned |
| Transcript to a log, hang detection | `cli-coding-subagents` step 5 | not repeated |
| Verify in the worktree, merge, clean up, "DONE is a claim" | `cli-coding-subagents` step 6 | "per worker, do step 6" |
| OpenRouter: model discovery, isolated `CODEX_HOME`, `--model` before `--`, review gates, limits, 750K budget and `HANDOFF.md` | `references/openrouter.md` | only the concurrency cap is referenced |
| When to split; parallel by default; sizing | `parallel-build` step 1 | one sentence sends multi-piece jobs there |
| Seams, ownership table, shared files, "two owners is a bug" | `parallel-build` step 2 | prompt template says the lists come from the split |
| Phases, agent counts, review phase, `Desktop/Playgrounds` security skip | `parallel-build` step 3 | not mentioned |
| How many run at once | `parallel-build` step 4 | `references/openrouter.md` holds the free-tier figure |
| Phase loop, gate between phases | `parallel-build` step 5 | not mentioned |
| `PROGRESS.md`, plan directory layout, CR and SECURITY templates | `parallel-build` step 6, `references/templates.md` | not mentioned |
| Resume after a crash | `parallel-build` | not mentioned |

### Headings (the contract between the two phase-2 workers)

`skills/cli-coding-subagents/SKILL.md`: `## Purpose`, `## Requirements`,
`## Setup`, `## Available scripts`, `## Instructions` with `### 1. Pre-flight`,
`### 2. Pick the worker`, `### 3. Worktree`, `### 4. Prompt`, `### 5. Dispatch`,
`### 6. Collect, verify, merge`, then `## OpenRouter mode`, `## Examples`,
`## Troubleshooting`, `## Limitations`.

`skills/parallel-build/SKILL.md`: `## Purpose`, `## Requirements`,
`## Instructions` with `### 1. Size the job`, `### 2. Find the seams`,
`### 3. Shape the phases`, `### 4. Decide how many run at once`,
`### 5. Run a phase`, `### 6. Track progress`, `### 7. Finish`, then
`## Resuming an interrupted build`, `## Examples`, `## Troubleshooting`,
`## Limitations`.

Cross-references use the skill name and the step title, for example
"`cli-coding-subagents` step 6 (Collect, verify, merge)".

### Descriptions (final text)

`cli-coding-subagents`:

> Use when handing a coding task to a codex, copilot or OpenRouter (ori) CLI worker: login and quota pre-flight, model choice, exact flags, prompt contract, automatic git worktree, verify, merge, cleanup. To split a job across several workers, use parallel-build first.

`parallel-build`:

> Use when a job has two or more independent pieces, or the user asks to parallelize, split work across agents, or resume an interrupted build. Decides the seams, file ownership, phases and how many workers run at once; parallel by default. Each worker runs via cli-coding-subagents.

If Tier 2 puts the pair at 0.85 or above, reword and measure again.

### Run directory

Prompts, logs and status files need a place that survives a reboot and is
outside every worktree. With a plan it is the plan directory. Without one it is
`<worktree-root>/.runs/<name>/`, created by `wt.sh rundir <name>` (outside the
repository, and not under `.plan/`, which `deep-plan` owns). With no git it is
`.sa-runs/<name>/` in the project. See the amendment of 23 November for why it
is not under the git directory.

### Script changes

| Script | Change |
|---|---|
| `wt.sh` | Exit 4, message "not a git repository", when run outside one (was exit 1). Header lists the code. New command `rundir <name>` (see the amendments). |
| `ori-codex-home.sh` | Compare the existing link with `$src`, so a correct link is left alone. |
| `ori-precheck.sh` | Header comment: "same contract as `precheck.sh` beside it". |
| `codex-session.py` | Docstring cut to what the script does and its exit codes; the reasoning stays in `references/invocation.md`. |
| `precheck.sh`, `ori-models.sh` | Unchanged. |

## File map

| Path | Change | Phase | Owner |
|---|---|---|---|
| `skills/cli-coding-subagents/scripts/ori-precheck.sh`, `ori-models.sh`, `ori-codex-home.sh` | moved from `skills/openrouter-cli-subagent/scripts/`; two edited as above | 1 | lead |
| `skills/cli-coding-subagents/scripts/wt.sh`, `codex-session.py` | edited as above | 1 | lead |
| `skills/cli-coding-subagents/tests/scripts.test.mjs` | new | 1 | lead |
| `skills/cli-coding-subagents/evals/**` | rewritten in the eval standard; carries both skills' cases | 1 | lead |
| `skills/parallel-build/evals/**` | rewritten, right-sized, with fixtures | 1 | lead |
| `skills/cli-coding-subagents/references/openrouter.md` | phase 1 moves the old OpenRouter `SKILL.md` here unchanged; phase 2 rewrites it | 1 then 2 | lead, then p2-worker-skill |
| `skills/openrouter-cli-subagent/**` | removed (everything moved or carried) | 1 | lead |
| `skills/cli-coding-subagents/SKILL.md` | phase 1 adds the `## Setup` section with the resolver block; phase 2 rewrites the file around that block, which it keeps byte for byte | 1 then 2 | lead, then p2-worker-skill |
| `skills/cli-coding-subagents/references/invocation.md` | de-duplicated; resume command fixed | 2 | p2-worker-skill |
| `skills/cli-coding-subagents/references/prompt-template.md` | split rules replaced by a pointer | 2 | p2-worker-skill |
| `skills/parallel-build/SKILL.md` | rewritten | 2 | p2-split-skill |
| `skills/parallel-build/references/templates.md` | status-file shape replaced by a pointer; quick-split table added | 2 | p2-split-skill |
| `README.md` | three table rows, the details block, the requirements rows, the count 27 to 26 on three lines | 2 | lead |
| `assets/readme/hero-{light,dark}.svg`, `install-flow-{light,dark}.svg` | the count 27 to 26 (two lines in each file) | 2 | lead |
| `CHANGELOG.md`, `package.json`, `package-lock.json` | 1.23.0 entry and version | 2 | lead |
| `.plan/merge-cli-subagent-skills/plan.md` | this file | 1 | lead |

No path has two owners in the same phase. `SKILL.md` and
`references/openrouter.md` of the merged skill change hands between phases, not
within one. `.plan` is in `.gitignore`, so `plan.md` is added with `git add -f`,
as the one plan already in the repo was.

## Shared surface (phase 1 owns all of it)

The scripts and their names, the test file, both `evals/`, the resolver block
under `## Setup`, the heading contract and the two description texts above.
Phase 2 consumes them and edits none.

## Phases

### Phase 1: foundation (lead)

1. Write `tests/scripts.test.mjs` and watch the new-behaviour tests fail.
2. `git mv` the three `ori-*.sh` scripts and the old OpenRouter `SKILL.md`
   (to `references/openrouter.md`, with its frontmatter removed); delete the
   rest of `skills/openrouter-cli-subagent/`.
3. Make the script edits and add the `## Setup` section with the resolver
   block to the existing `SKILL.md`. Every test in the file passes, so
   `npm test` is green at the end of phase 1 and stays green in both phase-2
   worktrees.
4. Write both `evals/evals.json` and the fixtures. No fixture is named
   `*.test.mjs` (the root runner would execute it) or `*.log` (ignored by git).

### Phase 2: implementation (two workers at the same time, plus the lead)

- `p2-worker-skill` owns the merged skill's `SKILL.md` and three references.
- `p2-split-skill` owns `parallel-build`'s `SKILL.md` and `templates.md`.
- The lead edits `README.md`, the SVG counts, `CHANGELOG.md` and the version
  files, and runs the "before" measurements from `$D/before/skills`.

Executor: codex `gpt-5.6-sol` at `xhigh`, one worktree each, if a smoke dispatch
on this machine completes. Otherwise the lead writes both, one after the other.
The file map is the same either way.

### Phase 3: review, after the draft PR is open

- `p3-reader`: zero context, gets only the two new skills, and says for each
  situation below which skill to load and what to do first. A wrong skill, a
  wrong first step or a hedged answer is a finding.

  | # | Situation | Skill | First action |
  |---|---|---|---|
  | 1 | "Use codex to add CSV export while I keep working on the importer." | `cli-coding-subagents` | resolve `$SK`, run `precheck.sh` |
  | 2 | "Three unrelated fixes: one in `src/paging.ts`, one in `cli/report.ts`, one in `docs/`. Get agents on it." | `parallel-build` | size the job: quick split, write the ownership table |
  | 3 | "Continue the build." The repo has `.plan/billing/PROGRESS.md` without `Status: complete`. | `parallel-build` | the resume commands: list unfinished plans, read `PROGRESS.md`, `agents/*.md`, the worktree list |
  | 4 | "Run the subagents on free OpenRouter models." | `cli-coding-subagents`, OpenRouter mode | `ori-precheck.sh`, then `ori-models.sh --free-only` |
  | 5 | The pre-flight prints copilot at code 20, paid overage. "Just dispatch." | `cli-coding-subagents` | stop and ask the user, quoting the numbers; offer codex |
  | 6 | "Build the notifications module: email, SMS, push and a preferences UI. They share a types file and the route registry." No `.plan/` exists. | `parallel-build` | phased build needs an approved plan: run `deep-plan` first |
  | 7 | A codex worker's report ends with `QUESTION: assumed UTC timestamps.` | `cli-coding-subagents` | resume that session: `codex-session.py` for the id, then `codex exec --color never resume` |
  | 8 | "Use codex to fix the date test." The folder is not a git repository. | `cli-coding-subagents` | pre-flight, then no worktree: run in the project directory and say so |

- `p3-loss`: compares old and new and lists every rule, flag, pre-flight step
  or script behaviour that disappeared.

### Eval case ids

Merged skill: old `cli-coding-subagents` cases 1 to 4 keep their ids. Old
`openrouter-cli-subagent` cases 1 to 9 become 5 to 13 in the same order. Its
case 10 (pick a complete installation) names the skill's own files, which the
eval standard forbids in a prompt, so it becomes the Setup-block test in
`tests/scripts.test.mjs`. Case 14 is the negative case and 15 is new (no git).
`parallel-build`: cases 1 to 4 keep their ids with right-sized prompts and
fixtures; 5 to 7 are new (quick split, a shared file, a job that is one piece);
8 is the negative case. Ids are unique per file, which is what
`install/validate.mjs` checks.

## Test strategy

### Critical-path tests

```bash
npm test
npm run validate
node --test skills/cli-coding-subagents/tests/scripts.test.mjs
```

### Edge cases

| Case | Axis | Status |
|---|---|---|
| `wt.sh` outside a git repository exits 4 | absence | covered: `wt.sh reports a directory that is not a git repository with exit 4` |
| `wt.sh new`, commit, `merge` removes worktree and branch | happy path | covered: `wt.sh creates, merges and removes a worktree` |
| `wt.sh merge` with a dirty main tree exits 3 and keeps the worktree | failure | covered |
| `wt.sh merge` with a conflict exits 2 and keeps the worktree | concurrency | covered |
| `wt.sh` slug with a slash exits 1; unknown command exits 64 | malformed | covered |
| `ori-codex-home.sh` run twice leaves a correct link in place | cardinality | covered (red before the fix) |
| `ori-codex-home.sh` replaces a link pointing elsewhere; exits 1 with no `~/.codex` | failure | covered |
| `ori-precheck.sh`: no `ori` exits 40; `ori auth` failing exits 10; authenticated exits 0 and prints no account id | failure | covered with a fake `ori` on `PATH` |
| `precheck.sh codex`: "Not logged in" exits 10 (the anchored match) | malformed | covered with a fake `codex` on `PATH` |
| `codex-session.py` picks the session whose `cwd` matches; exits 1 on none; 64 on bad usage | concurrency | covered |
| Setup resolver skips a copy without the `ori-*.sh` helpers; exits 40 when no complete copy exists | absence | covered: the test runs the block from `SKILL.md` with a temporary `HOME`; green from phase 1 |
| Scripts on Windows without bash | platform | out of scope: the tests skip on `win32`, as the scripts need WSL or Git Bash |
| `precheck.sh copilot` quota parsing against the live GitHub endpoint | failure | out of scope: unchanged code, needs a network and an account |
| `ori-models.sh` against the live models API | failure | out of scope: unchanged code |

### Coverage

The two changed scripts and the documented resolver are covered by behaviour
tests. The four unchanged scripts get pinning tests on their exit-code
contracts where that needs no network. Markdown is covered by `npm run
validate` (frontmatter, fences, eval schema, README entries) and by the
evaluators.

## Definition of done

- Critical-path tests pass.
- Draft PR open, two fresh reviewers run, every critical and high finding fixed
  or answered in the PR.
- Before/after table in the PR body: Tier 1, Tier 2, agent-skills-eval on the
  30B model with three attempts.
- Every rule the content-loss auditor lists is restored or justified in the PR.
- `$RUN/status/j2.md` current.

## Risks and unknowns

- **Content lost in the merge** -> the phase-3 auditor, plus the script tests
  that pin exit codes.
- **The 30B model does worse with one longer skill than with two short ones**
  -> measured in success signal 4; if it drops, move detail from `SKILL.md`
  into the references and measure again.
- **codex transport on this machine** (a smoke dispatch was still reconnecting
  after nine minutes) -> the lead executes phase 2.
- **Installed links to `openrouter-cli-subagent`** under `~/.claude`,
  `~/.codex` and `~/.copilot` dangle once this merges -> not ours to change;
  listed for the user (`install-skills doctor` finds them).
- **Six PRs collide on the version line and `README.md`** -> expected, resolved at merge.
- **Unknown:** whether `ori claude` works again. Not tested; the warning stays.

## Decisions

None that needs an ADR. The merge is reversible from git.

## Amendments

- 2026-11-23 — Reviewed by `plan-reviewer`: three blockers (resolver test red
  through phase 1, missing evaluator commands and id map, undefined reader
  situations) fixed before execution; second pass returned "ready".
- 2026-11-23 — First "before" run showed the grader fails any assertion worded
  as an action ("The reply runs the tests") when the prompt says not to run
  anything. Assertions were reworded to what the reply contains ("The reply
  places a test run before the merge") and the run repeated. Two rules that the
  old evals expected but the old skills never stated are now written down: the
  merge block ends with the test run on the merged branch, and raising the
  OpenRouter price ceiling needs the user's yes.
- 2026-11-23 — Phase 2 ran on two codex workers (`gpt-5.6-sol`, `xhigh`) in
  worktrees `j2-worker-skill` and `j2-split-skill` (the `j2-` prefix keeps the
  `sa/` branches unique in a repository six jobs share). They ran with
  `-s workspace-write`, not the skill's unsandboxed flags, because the run's
  ground rules put the main checkout and the installed skills off-limits. The
  sandbox refuses writes under any `.git`, so the workers could not commit and
  the lead committed for them.
- 2026-11-23 — That same refusal ruled out `<git common dir>/sa-runs/` as the
  run directory: a sandboxed worker could not write its status file there. It
  is `<worktree-root>/.runs/<name>/` instead, created by a new
  `wt.sh rundir <name>` so the path is not left to the agent to compute.
- 2026-11-23 — The character caps given to the workers (12,000 and 11,500)
  were wrong. Both workers hit them by shortening sentences that carried a
  reason and by leaving `Examples` and `Limitations` as placeholders. The lead
  restored the wording and wrote those sections; the files are 15,530 and
  14,078 characters. If the 30B measurement drops, detail moves to references.

