# Eval format standard

How to write `skills/<name>/evals/evals.json` so that the same committed file
loads and grades in all three runners, and so that its results mean something.
`npm run normalize-evals` rewrites a file into this format and
`npm run validate` enforces it.

If you only read one section, read [The format](#the-format) and
[Assertions](#assertions).

## Who reads the file

| Runner | Grades | `files` are read relative to | What the grader sees |
| --- | --- | --- | --- |
| Repo runner (`install/run-evals.mjs`), and the skill-creator schema | `expectations` | the skill folder | the candidate's reply |
| agent-skills-eval | `assertions` (falls back to the one `expected_output` line) | the skill folder | one reply, no tools, no workspace |
| SkillEvaluator Tier 3 | `assertions` (as `behavior_check`), plus `expected_output` | `evals/`, but a leading `evals/` is accepted | the whole run: messages, tool calls, results, final reply |

No runner reads both `assertions` and `expectations`, so a case carries both,
with identical content. That is the only duplication the format needs.

## The format

```json
{
  "skill_name": "build-log-triage",
  "evals": [
    {
      "id": 1,
      "prompt": "CI went red on my branch. The log is attached as build-log.txt (in a workspace it is at input/1/build-log.txt). Which checks failed, and what should I fix first?",
      "expected_output": "Names the two failing checks with their error lines and says to fix the missing module first, because the test failure follows from it.",
      "files": ["evals/files/1/build-log.txt"],
      "assertions": [
        "The reply names `build` and `test` as the failing checks and no others.",
        "The reply quotes the line `Cannot find module './tax'`.",
        "The reply says to fix the missing module before the test failure."
      ],
      "expectations": [
        "The reply names `build` and `test` as the failing checks and no others.",
        "The reply quotes the line `Cannot find module './tax'`.",
        "The reply says to fix the missing module before the test failure."
      ]
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `skill_name` | The skill's folder name. |
| `id` | Integer, unique in the file. Never renumber or reuse an id: results are compared by id across runs. New cases take the next free number. |
| `prompt` | What the user says. See [Prompts](#prompts). |
| `expected_output` | One or two sentences on what a successful reply contains. Outcome only. agent-skills-eval grades this line alone when a case has no assertions, and SkillEvaluator scores accuracy against it. |
| `files` | Always present. A list of strings, `[]` when the case has no fixture. See [Fixtures](#fixtures). |
| `assertions` | 2 to 5 strings. See [Assertions](#assertions). |
| `expectations` | The same strings as `assertions`, in the same order. Edit `assertions`; the normaliser copies them here. |
| `expected_skill` | `null` on a negative case. See [The negative case](#the-negative-case). Leave it out everywhere else: SkillEvaluator fills in the skill's name. (The validator also accepts another skill's name, which SkillEvaluator reads as "this request belongs to that skill"; no set here uses it.) |
| `checks` | Optional. SkillEvaluator's deterministic checks (`output_contains`, `output_matches`, `file_exists`). Only SkillEvaluator reads them, so the same requirement must still appear in `assertions`. |

Keys appear in the order of this table. Two-space indent, UTF-8, one trailing
newline. Fields not listed here are kept as they are.

`agents/<name>.evals.json` uses the same case shape under a top-level
`agent_name`. Only the repo's validator reads those files.

`npm run normalize-evals` fills in whichever of `assertions` and
`expectations` is missing, adds `files: []`, orders the keys, writes inline
fixtures to files, moves fixtures from the old `evals/fixtures/` folder and
copies any other listed file into `evals/files/`. Running it twice changes
nothing the second time. It never overwrites a fixture that differs, never
guesses between two lists that differ, and never rewrites a file with a
duplicated key; it leaves those entries as written and reports them.

`npm run validate` fails on what would stop a runner from loading or grading
a case: no assertions, `assertions` and `expectations` that differ, a
duplicated key, an id that is not an integer, and a fixture path that is not
a small text file under `evals/files/` with a name Windows accepts. It warns,
without failing, on the size rules below: fewer than 6 cases, no negative
case, and fewer than 2 or more than 5 assertions in a case.

## Worked example

```
skills/build-log-triage/
  SKILL.md
  evals/
    evals.json
    files/
      1/build-log.txt
      3/package.json
      3/src/price.ts
```

A second positive case, with a small project as its fixture:

```json
{
  "id": 3,
  "prompt": "The attached project (in a workspace: the folder input/3/) fails `npm run build`. I have not run it again since my last edit. Tell me what you would check, in order, and why. Do not change any file.",
  "expected_output": "An ordered list of at most four checks, the first being the import path in src/price.ts, each with the reason it comes at that point.",
  "files": ["evals/files/3/package.json", "evals/files/3/src/price.ts"],
  "assertions": [
    "The reply is an ordered list of at most four checks.",
    "The first check concerns the import of `./tax` in `src/price.ts`.",
    "Each check is followed by a reason.",
    "The reply does not state that the build was run or that it now passes."
  ],
  "expectations": ["…the same four strings…"]
}
```

The negative case for the same skill:

```json
{
  "id": 6,
  "prompt": "CI is green on main. Can you write the release note line for the tax rounding fix? One sentence, past tense.",
  "expected_output": "One past-tense sentence describing the tax rounding fix. No log analysis.",
  "files": [],
  "assertions": [
    "The reply contains exactly one sentence of release-note text.",
    "The reply contains no list of failing checks."
  ],
  "expectations": ["…the same two strings…"],
  "expected_skill": null
}
```

What each runner does with case 1:

- **Repo runner:** sends the prompt and the list `["evals/files/1/build-log.txt"]`
  to the candidate command, then the reply and `expectations` to the judge.
- **agent-skills-eval:** puts the file's text ahead of the prompt as
  `<file path="evals/files/1/build-log.txt">…</file>`, takes one reply, grades the
  three `assertions`.
- **SkillEvaluator:** copies the file to `/workspace/input/1/build-log.txt`,
  starts the agent in `/workspace` with the prompt and nothing else, then
  grades the three `assertions` against the whole run.

## How many cases

- **At least 6 per skill.** That was the starting point and the research does
  not argue for fewer once a skill is past its first draft.
- **Aim for 8 where a lift number will be quoted.** At three attempts per case,
  8 cases give 24 graded attempts per arm, which is where the 95% interval on
  a pass rate first comes in under ±0.20 (6 cases give ±0.21). SkillEvaluator's
  own "sufficient" label asks for 10 cases and that interval; below it a run is
  marked provisional, which is a label, not a failure.
- **At least one negative case** (next section).
- **More than 12 is usually overlap.** Every case costs two arms times the
  number of attempts. Merge cases that test the same behaviour before adding
  a thirteenth.
- **Grow the set from real failures.** When a skill misbehaves in use, the
  prompt that showed it becomes a case.

Published guidance ranges from "2-3 test cases" for a first iteration
(agentskills.io) through "10–20 prompts" (OpenAI) to "20-50 simple tasks"
(Anthropic, for agents in general). Six to ten per skill sits where those
overlap for a library of 27 skills that are each run twice per case.

`npm run validate` prints a warning for a skill under 6 cases or without a
negative case. It does not fail on it.

## The negative case

Every skill has at least one case where the right behaviour is for the skill
to change nothing.

- Pick a **near miss**: a request next to the skill's territory where its own
  "not for" clause applies (a one-line fix for a planning skill, an FYI with
  no choice for a decision-table skill). An unrelated request ("what is 2+2")
  tests nothing.
- Mark it with `"expected_skill": null`. SkillEvaluator then counts it as a
  negative case and passes it when the agent did not load the skill.
- Its assertions say what a good reply to that request contains, and that the
  skill's signature output is **absent** ("The reply contains no table").
- It should pass in both arms. It is the one place where that is the wanted
  result, so the "passes in both arms" audit below skips cases marked this way.

## Prompts

- **A realistic request, complete in itself.** Everything the task needs is in
  the prompt or in `files`. "Add a flag to our CLI" with no CLI supplied makes
  the agent stop and ask, and the case measures nothing.
- **Do not name the skill, its files or its scripts.** The baseline arm gets
  the same prompt without the skill and cannot follow it. `tier3 validate
  --strict` rejects such prompts.
- **Say what to hand back and in what form:** "Reply with the plan; do not
  implement it", "Give the test file in full". A case whose deliverable is
  unclear is graded on a guess.
- **Name each fixture by file name and say where it is,** in words that work
  both ways: "attached as `build-log.txt` (in a workspace it is at
  `input/1/build-log.txt`)".
- **Do not ask for something a single reply cannot contain** unless you also
  accept it in the reply. "Write the plan to `.plan/x/plan.md`" becomes
  "Write the plan (to `.plan/x/plan.md` if you can write files, otherwise in
  full in your reply)".

## Case size

Evidence from the earlier Tier 3 run: attempts that finished took a median of
59 seconds, and 90% took under 214. Thirty of 376 attempts (8%) were still
running at a 5, 10 or 15 minute limit, and one timed-out attempt blanks the
score for its whole arm.

- **Design each case to finish in about two minutes and never more than
  five.** Tier 3's limit is 300 seconds times `--timeout-multiplier`. Treat a
  multiplier as headroom for a slow model, not as budget.
- **One deliverable per case:** one reply, or one focused edit, or one file of
  at most about 150 lines.
- **One step of a long workflow per case.** Supply the earlier steps as
  fixtures and ask for the next one. A case that needs sub-agents, several
  rounds, or a build-run-fix loop is a workflow, not a case.
- **Nothing to install and nothing to launch:** no `npm install`, no browser
  download, no dev server, no desktop app. If the skill is about driving such
  a thing, the case asks for the decision, the command or the report, with the
  observed output supplied as a fixture.
- **The reply fits in about 1,500 words.** A run that caps the reply (8,000
  tokens in this repo's runs) cuts a longer one, and a model that spends the
  whole allowance on reasoning returns nothing.
- **Fixtures are small:** up to 5 files and about 200 lines in total per case.

If a case cannot be made this small, split it.

## Fixtures

- Fixture files live under `evals/files/<case id>/`, laid out as the case's
  project would be: `evals/files/3/src/price.ts`. A file shared by several
  cases goes under `evals/files/shared/`.
- `files` lists each one as a path from the skill folder:
  `"evals/files/3/src/price.ts"`. This is the one spelling both external tools
  resolve. SkillEvaluator's documentation says "relative to `evals/`", but its
  code strips a leading `evals/`, so the skill-root path works in both.
- **`files` is always present,** `[]` when empty. If the key is missing,
  SkillEvaluator copies every file under `evals/files/` into the case.
- **Never** inline text, a `{path, content}` object, a folder, a path outside
  `evals/files/`, `..`, an absolute path or a symlink. agent-skills-eval drops
  objects without a word and reports an unknown string as a missing file;
  SkillEvaluator stops the run.
- **Never** one of the skill's own files (`references/…`, `scripts/…`). The
  baseline arm does not have the skill. Copy what the case needs into
  `evals/files/`.
- Text only, UTF-8, at most 64 KB each (agent-skills-eval cuts a larger file
  and skips a binary one). File names must be valid on Windows, where CI also
  runs: none of `< > : " | ? *`, no trailing dot or space, no `CON`, `NUL`,
  `COM1` and the like.
- **A fixture must not match `.gitignore`.** This repo ignores `*.log`,
  `*.pyc`, `node_modules/`, `__pycache__/`, `.plan` and `*-workspace/`. Git
  leaves such a file out without a word, the local checks still pass, and CI
  reports the fixture missing. Name a log `build-log.txt`. Check with
  `git status --short --ignored skills/<name>/evals`.
- **The repo treats everything under `skills/` as code.** `npm test` runs any
  `*.test.mjs` it finds, and `npm run validate` syntax-checks every `.js`,
  `.mjs`, `.py` and `.sh` and the code fences of every `.md`. A fixture that is
  a test file, or is broken on purpose, gets `.txt` added to its name
  (`cart.test.mjs.txt`), and the prompt says so.
- No secrets, tokens or real people's details, even as props.
- `tier3 validate` does **not** check that `files` resolve. Only an evaluation
  run does, and it stops there. `npm run validate` checks it for you.

## Dependencies

The default Tier 3 container is `python:3.12-slim` with `bash curl git jq
procps ripgrep`. It has no Node, no browser and no compiler.

- **Prefer a case that needs nothing more.** Ask for the code and its test,
  graded by reading them, instead of asking the agent to install and run.
- **If a case does need a tool, declare it in `evals/environment/Dockerfile`.**
  SkillEvaluator builds that file for both arms.
- **Do not use `scripts/apt-packages.txt` for this.** SkillEvaluator's own
  error message suggests it, but it collects that file only from the staged
  skill, so the with-skill arm gets the package and the baseline arm does not.
  The baseline then fails on the environment and the comparison is void.
  (Checked by calling the tool's Dockerfile generator for both arms.)
- State the need in the prompt as well ("Node 18 is installed"), so the agent
  does not spend its time looking.

```dockerfile
# skills/<name>/evals/environment/Dockerfile
# The default eval image plus Node.js, for cases <ids>.
FROM python:3.12-slim

RUN apt-get -o Acquire::Retries=3 update && \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    bash curl git jq procps ripgrep nodejs npm \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace/skills /workspace/input /workspace/output /logs/agent /logs/verifier
WORKDIR /workspace
```

Keep the base image and the first package line as they are: the grader is
installed on top with `pip`, and the agent's setup expects `procps`.

## Files beside evals.json

Some skills need more than the case list. These are allowed, and
`npm run normalize-evals` and `npm run validate` leave them as they are:

| File | Read by | What it is for |
| --- | --- | --- |
| `evals/config.yml` | SkillEvaluator | Run settings for every case of the skill: `harbor.agent_workdir`, `harbor.custom_dockerfile_mode`, `harbor.runtime_env` (for example `SLASH_COMMAND_TOOL_CHAR_BUDGET`, so the agent sees skill descriptions), and `grading.mode`. |
| `evals/grader.py` | SkillEvaluator | A custom grader. What it prints reaches the run's `verifier/test-stdout.txt`, which is how to see the files an agent wrote. |
| `evals/environment/Dockerfile` | SkillEvaluator | The image for both arms (see Dependencies). |
| `evals/environment/fixture/**` | the Dockerfile | A project or git checkout built into the image, for a case that must start inside a repository. `evals/files/` cannot give a working directory or history. |
| `evals/files/shared/**` | both runners | A fixture several cases list. |
| `trajectory_checks` (a key in a case) | `tools/planning-eval/score.mjs` | A list of `{name, pattern}` that the scorer matches against the arguments of the agent's tool calls, for cases whose point is what the agent looked at. A diagnostic only: no grader reads it. See [tools/planning-eval/README.md](tools/planning-eval/README.md). |

A file under `evals/environment/` or a control file such as `config.yml` is
never listed in a case's `files`: SkillEvaluator refuses to stage it as input.

## Assertions

An assertion is one sentence a grader marks pass or fail. Two of the three
graders see only the reply text; the third sees the whole run. Write every
assertion so that **someone who has the transcript, and has not read the
skill, reaches the same verdict as you.**

1. **One condition per assertion.** No "and" joining two checks. The graders
   pass an assertion only if every part holds, so a joined pair fails on its
   weaker half and hides which.
2. **A statement of fact about the reply or a named artefact.** Start with
   "The reply …", "The plan …", "The test file …". Not "Should …", not an
   instruction, not the agent's state of mind ("Understands", "Considers",
   "Is careful to").
3. **Name the literal thing to look for:** a heading, a command, a path, a
   field, a number, a named option. "At most 4 options", "under 250 words",
   "a row labelled `Reversible`".
4. **Outcome, not path, and never skill use.** "Reads the reference file",
   "follows the skill", "runs the gate script" cannot pass in the baseline arm
   and inflate the lift; `tier3 validate --strict` rejects them. Say what is
   different about the result when the skill worked.
5. **For an action, assert the evidence it leaves, in a form that a promise
   cannot satisfy.** "Creates the `.plan/` directory" passes for a reply that
   says "I'll create `.plan/`" and fails for an agent that created it and did
   not mention it. Write what the artefact contains instead: "The plan, in
   `.plan/<name>/plan.md` or in the reply, has a file map table in which no
   path has two owners." Where the difference between doing and promising is
   the point, say so: "The reply contains the full test file, not a
   description of it."
6. **An assertion about a command names its visible result.** "The reply
   quotes the failing line from the test output", not "Runs the tests". If
   the result cannot exist without tools, supply it as a fixture and assert on
   the conclusion drawn from it.
7. **Absence is a fine thing to assert,** and is often what separates the
   arms: "The reply contains no comparison table", "The reply does not say
   the tests passed".
8. **No quality words:** appropriate, clear, good, proper, thorough, concise,
   honest, sensible, real, genuine. Replace each with the thing you would
   point at.
9. **Do not restate the prompt.** "Proposes a plan" on a prompt that says
   "plan this" passes in both arms. Each assertion in a positive case should
   be something you expect a reply without the skill to miss.
10. **Nothing the grader cannot know:** that a commit hash is real, that a
    command truly ran, that the code compiles, unless the transcript shows it.
11. **2 to 5 per case.** More than five usually means the case is two cases.
12. **Keep the wording stable** once it works. Results are matched by text.

| Instead of | Write |
| --- | --- |
| Creates the `.plan/` directory | The plan, in `.plan/<name>/plan.md` or in the reply, starts with a `Status: draft` line. |
| Reads actual code at the seams, not just file names | The plan quotes or names at least one function from `src/auth.ts`. |
| Every option column has real cons | Every option column has at least one entry in the `Cons` row. |
| Cost row is concrete, not "some effort" | Each cell in the `Cost` row contains a number with a unit of time or money. |
| No planning ceremony for a one-line change | The reply contains no file map and no edge-case table. |
| Implements the change directly | The reply contains the edited line with `receive` spelled correctly. |
| Checks `.adr/` or git history for prior decisions | The plan cites `ADR-0003` from the supplied `.adr/` folder. |
| Output is thorough and well organised | The reply has the headings `Timeline`, `Root cause` and `Actions`, in that order. |

## Keeping the graders reliable

- **Use a check a script could make wherever one exists** (a literal string, a
  count, a heading). Those are the assertions graders agree on.
- **Run each case at least three times per arm** before quoting a number. One
  attempt is noise.
- **After the first run, read the grades and fix the set:**
  - An assertion that **passes in both arms on every attempt** measures
    nothing. Reword it to what the baseline misses, or delete it. (Negative
    cases are exempt.)
  - An assertion that **fails in both arms on every attempt** is nearly always
    a broken case or an assertion the grader cannot check. Fix the case before
    concluding anything about the skill.
  - An assertion whose grade **flips when the same reply is graded twice** is
    ambiguous. Find the word two readers take differently.
- **Read the transcripts of failures.** A failure should look fair: you can
  see what the reply got wrong.
- **An empty reply or a grader error is an invalid attempt, not a fail.**
  Rerun it.
- The grader here is a small model. Assertions that need judgement are where
  it is weakest; assertions that need a lookup are where it is reliable.

## Checking a dataset

```bash
npm run normalize-evals            # rewrite every evals.json into this format
npm run validate                   # fails on a format error, warns on count
node install/normalize-evals.mjs --check   # exits 1 if a file would change; writes nothing

skillevaluator tier3 validate skills/<name> --strict
npx agent-skills-eval skills --include <name> --baseline --target <model> --judge <model>
```

`npm run validate` is the check that a fixture path resolves. Neither external
tool checks that before it runs.

## Sources

Tool behaviour was read from the code and confirmed by running it:
SkillEvaluator 1.0.1 (`tier3/harbor/adapter.py`, `tier3/dataset_utils.py`,
`tier3/evals_spec.py`), agent-skills-eval at 9724511 (`src/skill.ts`,
`src/run-eval.ts`, `src/grade.ts`), `install/run-evals.mjs`,
`install/validate.mjs`, and skill-creator's `references/schemas.md`.

Published guidance, fetched 23 November 2026:

| Point | Source |
| --- | --- |
| "20-50 simple tasks drawn from real failures is a great start." "Test both the cases where a behavior should occur and where it shouldn't." "One-sided evals create one-sided optimization." "two domain experts would independently reach the same pass/fail verdict." "it's often better to grade what the agent produced, not the path it took." "a 0% pass rate across many trials … is most often a signal of a broken task." | Anthropic, [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| "Start with 2-3 test cases." "Remove or replace assertions that always pass in both configurations." "Investigate assertions that always fail in both configurations." Assertions that are "unverifiable (can't be checked from the output alone)". | agentskills.io, [Evaluating skills](https://agentskills.io/skill-creation/evaluating-skills) |
| Near-miss negatives: an unrelated prompt is "obviously irrelevant, tests nothing." "Run each query multiple times (3 is a reasonable starting point)". | agentskills.io, [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions) |
| "a small set of 10–20 prompts is enough to surface regressions and confirm improvements early." "Every manual fix is a signal. Turn it into a test". | OpenAI, [Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills) |
| "at least 10 distinct cases, at least 1 negative case". An assertion that the agent "ran the skill's script, or used the skill, cannot be met by the baseline and inflates lift." "Observable agent behaviors to verify, one per entry." | NVIDIA, [SkillEvaluator: Eval Datasets](https://docs.nvidia.com/skills/skillevaluator/eval-datasets) |
| "No partial credit: Each expectation is pass or fail". "The burden of proof to pass is on the expectation." "A passing grade on a weak assertion is worse than useless". | Anthropic, [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) (`agents/grader.md`) |
| One judge per failure type; pass/fail, not a 1-5 scale. | Hamel Husain, [LLM judge](https://hamel.dev/blog/posts/llm-judge/), [evals FAQ](https://hamel.dev/blog/posts/evals-faq/) |

Where the sources disagree: skill-creator's own schema example and Anthropic's
skill best-practices page include process checks ("The skill used script Y").
This standard sides with the two evaluators that run a baseline arm, where
such a check cannot pass. No source gives a time limit for a case; the
two-minute target above comes from this repo's own run data.
