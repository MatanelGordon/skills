# Plan: removals and renames sweep for every reference

Status: draft, 2026-11-24. Job J8 of the skills improvement run.

## Goal

When anything is removed or renamed (a skill, file, script, flag, command or
name), every reference to it is found and dealt with before the work is called
done. Three parts:

1. A rule in `get-the-job-done` (body only; the `description:` line is J1's and J7's).
2. A check in `npm run validate` that fails when a current file names a skill
   that used to be under `skills/` and no longer is.
3. `npm run install-skills` prunes symlinks in the agent folders that point into
   this repo's `skills/` (or `agents/`) and whose target is gone, printing each.

## Findings that shape the design

- Skill names already retired on `main`: `adr-in-git`, `rank`, `sweat-dreams`
  (from `git log --name-only -- 'skills/*/SKILL.md'`). `rank` is an ordinary
  word: `confidence-ranker` says "rank each claim" ten times. So a bare-word
  search for every retired name would fail `main` on day one.
- Skills are referenced as `` `name` ``, `skills/name/...` paths (README table
  links, docs, scripts), `**name**` (README registry) and, for hyphenated
  names, in plain prose ("Builds on cli-coding-subagents.").
- CI (`.github/workflows/validate.yml`) checks out with the default
  `fetch-depth: 1`, so `git log` there sees one commit and no retired names.
- The installer writes to `~/.claude/skills`, `~/.codex/skills`,
  `~/.copilot/skills`, `~/.tabnine/agent/skills`, `~/.agents/skills`, and agent
  files to `~/.claude/agents`. Links it makes are absolute paths to
  `<repo>/skills/<name>` (or `<repo>/agents/<name>.md`).
- `cmdDoctor` already reports dangling links but only tells the user to `rm`.

## Design

### Retired names (validate)

`retired = names of skills/<name>/SKILL.md ever in HEAD's history (git log
--no-renames --name-only) minus directories now under skills/`. This needs no
list to maintain, covers uncommitted removals (the skill is still in HEAD), and
a rename (`git mv a b`) retires `a`. Without git, or with no history, the set
is empty and the check passes silently; CI gets `fetch-depth: 0` so it has the
history, and a test pins that setting.

### Which files

`git ls-files --cached --others --exclude-standard` from the repo root: tracked
and untracked-but-not-ignored files, the same set a commit would carry. Skip
files that no longer exist, binary files (a NUL byte), and history files:
any `CHANGELOG.md`, anything under `.plan/` or `.adr/`.

### What counts as naming a retired skill

- Every retired name: `` `name` ``, `skills/name` followed by a non-name
  character or the end, `**name**`, `[name]`.
- A retired name containing a hyphen: also the bare token (not inside a longer
  kebab-case word), because such names are distinctive and prose uses them
  unformatted.

One failure per hit: `<path>: line <n> names '<name>', which is no longer a
skill under skills/`.

### Installer pruning

`pruneStaleLinks(dir, sourceRoot)`: for each entry in `dir` that `lstat` says
is a symbolic link, resolve its target; remove it only when the target lies
inside `sourceRoot` (path prefix with a separator, also tried against
`realpath(sourceRoot)`) and the link no longer resolves. Removal uses `unlink`,
which cannot delete a real directory. Returns what it removed.

Called by `install` (after the user has confirmed the selection, before
installing) for every existing platform skills folder with `skills/`, and for
`~/.claude/agents` with `agents/`; and by `uninstall` for the platforms picked.
Each removal is printed as `pruned <name> → <target> (no longer in this repo)`.

### get-the-job-done rule

A short section, "Removing or renaming something", plus a gate example in the
skill's GATES.md format whose CHECK is a search that must come back empty
outside history files, an item in "Before you report done", an anti-pattern
row ("It will dangle"), and a pattern in `references/gates.md`. The sweep
covers the repo (code, docs, README tables, SVG text, eval cases, tests, other
skills, agents, CI, installer), installed copies and links (each agent folder
the installer writes), and the user's own rules and memory. Every hit is fixed
or listed for the user with a reason.

## File map

| Path | Change |
| --- | --- |
| `install/retired-skill-references.mjs` | new: retired names, file list, scan |
| `install/retired-skill-references.test.mjs` | new: unit and git-backed tests |
| `install/validate.mjs` | one import line and one call block, separate from J1/J3 hunks |
| `install/index.mjs` | `pruneStaleLinks`, called from install and uninstall |
| `install/index.test.mjs` | prune unit tests and one CLI test |
| `.github/workflows/validate.yml` | `fetch-depth: 0` on the validate job's checkout |
| `skills/get-the-job-done/SKILL.md` | body only |
| `skills/get-the-job-done/references/gates.md` | one pattern |
| `skills/get-the-job-done/evals/evals.json` | cases 16 to 19 (J3 uses up to 15) |
| `README.md` | one line on pruning and on the validate check, if the README documents them |
| `CHANGELOG.md`, `package.json`, `package-lock.json` | 1.23.0 entry |

## Tests (written first)

Validate check:
1. A repo whose history had `skills/old-thing/` and now does not; a README line
   `` `old-thing` `` fails, naming the file and line.
2. `skills/old-thing/SKILL.md` path in a doc fails; in `CHANGELOG.md` and
   `.plan/x/plan.md` passes.
3. Single-word retired name: `` `oldword` `` fails, prose "oldword each" passes.
4. Hyphenated retired name in plain prose fails; inside a longer word
   (`old-thing-two`) passes.
5. An uncommitted removal (deleted in the working tree, still in HEAD) fails.
6. A rename (`git mv`) retires the old name.
7. No git repository: no failures, no throw.
8. SVG text is scanned; a binary file is skipped; an ignored file is skipped.
9. `validate.yml` checks out with `fetch-depth: 0` for the validate job.

Installer:
1. Dangling link into the source root: removed and reported.
2. Live link into the source root: kept.
3. Dangling link elsewhere (foreign): kept.
4. Sibling prefix (`<root>-old/x`): kept.
5. Real directory and real file with the same name shape: kept.
6. Relative dangling link into the source root: removed.
7. CLI: `--yes --copy` with a temp HOME removes a planted dangling link into
   this repo's `skills/` and keeps a foreign dangling link, and prints the
   removal.

## Edge cases

| Case | Handling |
| --- | --- |
| Shallow clone | Empty retired set; CI pinned to full history |
| Not a git repo (npm package) | Empty set, no throw |
| Retired name is a common word | Only formatted forms count |
| A file deleted in the work tree but still in the index | Skipped |
| Link replaced by a real directory between check and removal | `unlink` fails, error printed, nothing deleted |
| Windows junctions | `lstat().isSymbolicLink()` is true for junctions; `unlink` removes them |
| Repo moved (links point to old path) | Not this repo: kept; `doctor` still reports them |

Placement in `install/validate.mjs`, clear of J1's and J3's hunks: the import
goes above `import { isEntryPoint }` (J3 adds its import below it), the call
goes before `const installRoot` (J3 changes the line after it and the final
`return`).

New eval cases use J3's format from the start (`files`, `assertions` equal to
`expectations`), ids 16 and up. J3's branch rewrote this file, so the merge
will conflict on it; resolving means appending cases 16+ to J3's file.

## Evaluation

`$RUN` = `/Users/matanelgordon/Desktop/Projects/skills-improvement-run`.

- `npm test`, `npm run validate` pass.
- Before: `git archive origin/main skills/get-the-job-done | tar -x -C $RUN/data/j8/before`,
  then copy this branch's `evals/` over it. After: this worktree's `skills/`.
  Each side, three attempts at temperature 0.7:
  `ASE_TARGET=nvidia/nemotron-3-nano-30b-a3b ASE_JUDGE=nvidia/nemotron-3-super-120b-a12b ASE_TEMPERATURE=0.7
  $RUN/bin/ase.sh <root>/skills $RUN/data/j8/ase-<side>-<n> --include get-the-job-done --eval-id 16 ...`
  Bar: on the new positive cases the after-with-skill pass rate beats
  before-with-skill by more than 0.15 (the one-attempt noise floor), and the
  negative case does not get worse.
- `$RUN/bin/se.sh tier1 <skill-dir> --no-llm -r cli,json,html -o $RUN/data/j8/tier1-<side>`.
  Bar: no new failing check and no lower quality score.
- Validate check run against `origin/refactor/merge-cli-subagent-skills` and
  `origin/integration/skills-improvement`, plus a simulated removal of
  `tui-builder` on the integration branch to list what J7 must fix.
- SkillEvaluator Tier 1 before and after on get-the-job-done.
