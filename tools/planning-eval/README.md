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

To compare two versions of a skill, stage each `SKILL.md` with the same
`evals/` and run step 2 for both. `--skip-baseline` reruns the with-skill arm
alone.

To score a finished run against newer checks, without paying for the agent
again:

```bash
node tools/planning-eval/score.mjs <run-dir> --cases skills/adr/evals/evals.json
```

`--json` prints every attempt with each check's result.

## Reading the table

```
| Case | Arm | Scored attempts | Skill loaded | Source opened | Facts reflected |
| 6 | with-skill | 3 | 2/3 | 2/3 | 2/3 |
| 6 | without-skill | 3 | n/a | 0/3 | 0/3 |
| all | with-skill | 6 | ...
| all | with-skill, loaded | 4 | ...
| all | without-skill | 6 | ...
```

- **Facts reflected** is the result: attempts whose final reply passed every
  reply check of the case.
- **Skill loaded** counts attempts where the agent called the Skill tool for
  this skill or opened its `SKILL.md`. `with-skill, loaded` repeats the totals
  for those attempts alone. Read it beside the full with-skill row, not in
  place of it: the full row is what installing the skill gets you.
- **Source opened** counts attempts where a tool call named the place the fact
  lives in. An attempt can open the source and still not reflect the fact.
- An attempt with no reply or no trajectory is **invalid** and left out of the
  rates. Rerun it.
- `file_exists` checks need the container, so the scorer skips them and says
  so. SkillEvaluator still applies them.

## What it cannot tell you

- Three attempts per arm show a direction, not a significant difference.
- A run in SkillEvaluator's default workspace installs only the skill under
  test, so "skill loaded" is the best case. With 27 skills competing, expect
  fewer loads.
- A reply that quotes the token while rejecting the fact passes the reply
  check. The judged assertions are there for that.
- The cases need a workspace. A single-reply evaluator sees the prompt and no
  repository, and will fail them in both arms.

## Tests

```bash
npm run test:planning-eval
```
