# planning-eval

Scores whether an agent's plan reflects a fact planted in a fixture repository,
without a grader model. It reads a finished [SkillEvaluator](https://docs.nvidia.com/skills/skillevaluator/)
Tier 3 run folder; it does not run an agent itself.

It exists for the skills whose job is to make an agent consult something
before it plans: `adr`, `bookkeeper`, `research-first`, `confidence-ranker`.
A case in an empty workspace gives those skills nothing to consult, so both
arms score the same and the result says nothing.

## How a planted-fact case works

Each of the four skills carries a small repository under
`skills/<skill>/evals/environment/fixture/project/`. `build.sh` beside it turns
that tree into a git checkout with fixed commits, the `Dockerfile` runs the
script into `/srv/<project>`, and `evals/config.yml` starts the agent there.
Both arms get the same image, so every case of the skill runs at the root of a
real repository.

A planted fact is one the plan has to reflect and that lives in one place only:
a decision record, a memory entry, a helper in another folder, a commit
message, a config file. The prompt asks for a plan and shares no wording with
the fact.

| Field in `evals.json` | Read by | Purpose |
| --- | --- | --- |
| `checks` (`output_matches`, `output_contains`) | SkillEvaluator and this scorer | The fact, as a token the final reply must contain. This is the result. |
| `trajectory_checks` (`name`, `pattern`) | This scorer only | Whether any tool call's arguments point at the place the fact lives in. A diagnostic: it explains a result, it does not decide one. |
| `assertions` | SkillEvaluator's grader model | What a token cannot settle, such as "the plan adds no PDF library". |

Patterns are regular expressions that mean the same in Python and JavaScript.
A leading `(?i)` is allowed; no other inline flag.

`evals/config.yml` also sets `SLASH_COMMAND_TOOL_CHAR_BUDGET`. Claude Code
drops descriptions from its skill listing once the listing passes a character
budget, and in the evaluation container the bundled skills use that budget up.
Without the setting the skill under test is listed by name alone, and "did the
agent load it" measures the name, not the description.

### Writing a new planted-fact case

- The token in the reply check must be knowable only by finding the fact. Grep
  the fixture for it: it should appear in the one place the fact lives in (and
  in code that already uses it, if the fact is "this exists").
- It must not appear in the prompt (`datasets.test.mjs` fails if it does) or
  in the skill's own `SKILL.md`. A decision record numbered like the skill's
  worked example can be cited by an agent that never opened it.
- Prefer a token to a phrase. A phrase the agent could arrive at by reading
  the code next to the planted spot is not a planted fact.
- Ask for a plan that names the files it touches. A small model otherwise
  answers from general knowledge without opening the repository, in both arms.

## Running it

SkillEvaluator needs Docker and a model provider. The commands below use the
wrapper that holds the provider settings; substitute your own `skillevaluator`
invocation.

```bash
# 1. Stage the skill text under test next to this branch's cases, keeping the
#    planted-fact cases only (here adr 5 and 6).
stage=/tmp/planning-eval/adr
mkdir -p "$stage" && cp skills/adr/SKILL.md "$stage/" && cp -R skills/adr/evals "$stage/"
jq '.evals |= map(select(.id == 5 or .id == 6))' skills/adr/evals/evals.json > "$stage/evals/evals.json"

# 2. Both arms, three attempts each.
se.sh tier3 evaluate "$stage" --agents claude-code --agent-model claude-code=<model> \
  --env-mode docker --n-attempts 3 --n-concurrent 2 --timeout-multiplier 2 \
  --results-dir /tmp/planning-eval/results --harbor-keep-jobs --progress plain

# 3. Score the run folder it printed.
node tools/planning-eval/score.mjs /tmp/planning-eval/results/adr/<run-id>
```

That gives two conditions: the skill not installed, and the skill installed.
A third separates "the agent did not load the skill" from "the skill text did
not help": put `/<skill> ` in front of each staged prompt, which makes Claude
Code load the skill itself, and run the with-skill arm alone.

```bash
jq '.evals |= (map(select(.id == 5 or .id == 6)) | map(.prompt = "/adr " + .prompt))' \
  skills/adr/evals/evals.json > "$stage/evals/evals.json"
se.sh tier3 evaluate "$stage" ... --skip-baseline
```

Never commit a prompt that names the skill: the baseline arm cannot follow it.
This is a measuring device for a staged copy.

To compare two versions of a skill, stage each `SKILL.md` with the same
`evals/` and run the with-skill arm for both.

To score a finished run against newer checks, without paying for the agent
again:

```bash
node tools/planning-eval/score.mjs <run-dir> --cases skills/adr/evals/evals.json
```

`--json` prints every attempt with each check's result.

## Reading the table

```
| Case | Arm | Scored attempts | Skill loaded | Source opened | Facts reflected | Invalid |
| 6 | with-skill | 3 | 2/3 | 2/3 | 2/3 | 0 |
| 6 | without-skill | 3 | n/a | 0/3 | 0/3 | 0 |
| all | with-skill | 6 | ...
| all | with-skill, loaded | 4 | ...
| all | without-skill | 6 | ...
```

A second table gives each reply check of each case its own row, so a case
whose fact needs two checks shows which one was missed.

- **Facts reflected** is the result: attempts whose final reply passed every
  reply check of the case. Typographic dashes and spaces in the reply (a model
  that writes `win‑build‑03` with U+2011) count as their ASCII form.
- **Skill loaded** counts attempts where the agent called the Skill tool for
  this skill, read its `SKILL.md`, or had its text put into the conversation
  by a slash command. A failed Skill call does not count. `with-skill, loaded`
  repeats the totals for those attempts alone. Read it beside the full
  with-skill row, not in place of it: the full row is what installing the
  skill gets you.
- **Source opened** counts attempts where a tool call named the place the fact
  lives in. An attempt can open the source and still not reflect the fact.
  The skills' own first commands (`ls .adr/`, `test -f .memory/index.md`) count,
  so expect this column to be higher with the skill; that is what it is for.
  It reads `n/a` for a case without `trajectory_checks`.
- **Invalid** attempts are left out of the rates: no reply, no trajectory, an
  unreadable trajectory, or a `failure.json` from SkillEvaluator (for example a
  container that stopped). Rerun them.
- A **negative case** (`expected_skill: null`) keeps its own rows but is left
  out of the `all` rows: loading the skill there is a false trigger.
- A `file_exists` check needs the container, so the scorer skips it and says so
  under the tables. SkillEvaluator still applies it.

## What it cannot tell you

- Three attempts per arm show a direction, not a significant difference.
- A run in SkillEvaluator's default workspace installs only the skill under
  test, so "skill loaded" is the best case. With 25 skills competing, expect
  fewer loads.
- A reply that quotes the token while rejecting the fact passes the reply
  check. The judged assertions are there for that.
- The cases need a workspace. A single-reply evaluator sees the prompt and no
  repository, and will fail them in both arms.

## Tests

```bash
npm run test:planning-eval
```
