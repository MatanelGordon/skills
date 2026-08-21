---
name: adr-in-git
description: >
  Record decision rationale inside git itself — every commit message states why it
  happened, worktree merges carry the request, plan and accumulated ADRs, and ADRs
  become annotated tags on the branch. Use when writing any commit message, when merging
  a branch or worktree back into a working branch, when tagging a decision, and when
  investigating why code looks the way it does — git blame, log -S, log -L, and trailer
  queries instead of guessing. Commits explain reasoning rather than crediting an
  author; no Co-Authored-By trailer. Complements the adr skill, which keeps decision
  files in ./.adr/; this one puts the same reasoning into commits, merges and tags so it
  survives file moves and is queryable from the CLI.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: Ships adr.sh; assumes git >= 2.35 for trailer formatting.
---

# ADR in git

Git already stores the code. This makes it store the **reasoning** too, so "why is
this like this?" is answerable with the CLI instead of archaeology and guesswork.

Three surfaces, each with a job:

| Surface | Carries |
|---|---|
| **Commit message** | why *this* change happened, and what forced these specific edits |
| **Merge commit** | what was requested, the plan, and which ADRs the branch produced |
| **Annotated tag** | the ADR itself, attached to the commit that enacted it |

Pairs with the `adr` skill (decision files in `./.adr/`). Files are for reading;
git is for querying and for surviving file renames. When both exist, the tag and
the commit reference the file by number.

---

## 1. Commit messages: the reason, not the credit

**Never add `Co-Authored-By`.** Attribution says who; the commit needs to say
**why**. Use that space for reasoning instead.

```
<type>: <what changed, imperative, one line>

<why this happened — the trigger, the problem, the constraint that forced it.
What made these specific additions/deletions necessary. 1-3 sentences.>

Reason: <short-code>
Refs: adr-0004
```

The diff already shows *what*. The body's job is the part that evaporates: what
prompted it, what you were working around, why the obvious approach wasn't taken.

```
fix: raise the worker timeout to 30s

p99 under load exceeded the old 10s bound and healthy workers were being
killed mid-request. Raising the bound is the smallest change that stops the
false kills without touching the scheduler.

Reason: latency-regression
Rejected: retry-on-timeout | masks the real slowness
Constraint: must stay under the 60s gateway limit
Refs: adr-0004
```

Keep it concise — a few lines. A commit that needs five paragraphs is either too
large or is really an ADR.

### Trailer vocabulary

A small set, borrowed from the Lore protocol's schema and trimmed to what earns
its place. Use only the ones that apply; most commits need none or one.

| Trailer | Use for |
|---|---|
| `Reason:` | short stable code for grouping — `latency-regression`, `api-contract`, `test-fixture` |
| `Constraint:` | a rule that shaped this and **stays true afterwards** |
| `Rejected:` | `<alternative> \| <why not>` — stops it being re-proposed in six months |
| `Refs:` | `adr-NNNN`, issue ids, related commits |
| `Reversibility:` | `clean` \| `migration-needed` \| `irreversible` |
| `Tested:` | what was actually verified, when that isn't obvious |

`Constraint:` and `Rejected:` are the ones that pay off later — they're what a
future planner needs to not undo your work or re-litigate a dead end.

### Trailer rules git actually enforces

Verified on git 2.50.1. Get these wrong and the trailers silently stop parsing —
they still *look* fine to a human, which is why this bites.

1. **Trailers must be the final paragraph**, one per line.
2. **A wrapped prose line inside the block kills the whole block.** A `Decision:`
   line that wraps onto an unindented second line makes git parse *none* of them.
3. **Multi-line values must indent the continuation** — then it parses fine.
4. **A blank line splits the block**; only the last paragraph is read, so earlier
   trailers are lost.
5. Write long messages with `git commit -F <file>`, not `-m` with embedded
   newlines — quoting mistakes are how rule 2 happens.

```
✗ breaks everything            ✓ parses
                                
Refs: adr-0004                 Refs: adr-0004
                               Reason: latency
Reason: latency                Rejected: retry-on-timeout
                                 | masks the real slowness
```

Check before relying on it:

```bash
git log -1 --format='%(trailers)'
```

## 2. Merging a worktree or branch back

When merging a subagent worktree or feature branch into your working branch, the
merge commit is the place the whole unit of work gets explained. Compose it as a
file and merge with `-F`.

```
merge(<branch>): <one-line summary of the change>

Requested: <what the user actually asked for, in their terms>

<The plan, in prose. Up to 5 paragraphs, no diagrams, no images, no ASCII art —
this is a commit message. Cover the approach taken, the shape of the solution,
and anything deliberately left out of scope. If the plan changed mid-flight, say
what changed and why.>

ADRs: adr-0004, adr-0005
Branch: <branch>
```

```bash
# compose, then merge with the file — never fight shell quoting for this
"$EDITOR" /tmp/merge-msg.txt
git merge --no-ff -F /tmp/merge-msg.txt "$BRANCH"
```

**Hard limits**: at most 5 paragraphs of plan; prose only. No mermaid, no tables of
boxes, no embedded images. If it can't be said in five paragraphs it belongs in an
ADR file that the merge references.

Always `--no-ff` so the merge commit exists to carry this. A fast-forward has
nowhere to put the story.

### ADRs accumulated on the branch become tags

Each ADR the branch produced gets an **annotated tag** pointing at the commit that
enacted it, so the decision travels with history and stays reachable after merge.

```bash
git tag -a adr-0004 <commit> -F /tmp/adr-0004.txt
```

Tag body: the ADR title on line 1, the reasoning, then trailers.

```
Use a real tokenizer instead of split()

Quoted fields and escapes made split() wrong in a way that only showed up on
customer data. We use a small hand-written tokenizer rather than a CSV library
because the import path is hot and the library needs the same configuration
work anyway.

Tags: parser, csv, performance
Constraint: parser must handle RFC4180 quoting
Reversibility: clean
Refs: .adr/0004-tokenizer.md
```

Pick the tier by how contested the decision was — **tier 1 (title + a
paragraph + trailers) is the default and is a complete ADR.** Escalate to
Nygard's Context/Decision/Consequences, or MADR's full form with Decision
Drivers, Considered Options and Confirmation, only when the alternatives were
genuinely close. Full templates, the Y-statement compression, the
section-to-trailer mapping, and supersession rules: **`references/template.md`**.

**`Tags:` is what makes the tag store searchable.** Pick 2-4 lowercase, reusable
words — subsystem (`parser`, `redis`, `auth`), concern (`performance`,
`security`, `migration`), or surface (`api`, `schema`). Reuse existing ones:
`adr.sh tags` prints the vocabulary already in play, so the set stays small
enough to be useful. A tag nobody else uses is a tag nobody will search.

> **Trap, verified:** a leading `#` line is **stripped as a comment** in tag
> messages — your markdown `# Title` disappears and the subject becomes the next
> paragraph. Either drop the `#`, or pass `--cleanup=verbatim`. Commits do *not*
> have this behaviour, which is why it's easy to miss.

Naming: `adr-NNNN`, matching the `.adr/NNNN-*.md` file when one exists. After
merging, confirm they came along:

```bash
git tag --merged HEAD 'adr-*'
git tag -l 'adr-*' --format='%(refname:short)  %(contents:subject)'
```

Tag trailers are queryable too — `git tag -l adr-0004 --format='%(trailers:key=Constraint,valueonly)'`.

## 3. Reading it back: navigating the record

Two ways in, deliberately. **Always start with the cheap one.**

```bash
SK="$HOME/.claude/skills/adr-in-git"
"$SK/scripts/adr.sh" list
```

### Pick the query by cost

| Your question | Command | What it costs |
|---|---|---|
| What decisions exist here at all? | `adr.sh list` | **Refs only.** O(number of ADRs). One line each. Start here. |
| What vocabulary is in use? | `adr.sh tags` | **Refs only.** Cheap. Run before inventing a new tag. |
| Is there a decision about X? | `adr.sh search X` | Tags first; falls back to history **only if no tag matches**. |
| Why is this code like this? | `adr.sh why path:42` | One blame + one show. Targeted — does not walk history. |
| Full detail on one decision | `adr.sh show adr-0004` | One ref read + one diffstat. |
| What must I not violate? | `adr.sh constraints` | **Walks all history.** Once per planning session. |
| What is already ruled out? | `adr.sh rejected` | **Walks all history.** Once per planning session. |

### Token discipline

The whole point of tagging the tags is that **the index is refs, not history**.
`git tag -l` reads a handful of refs; `git log --format='%(trailers...)'` walks
every commit and grows without bound.

- **Open with `adr.sh list`.** Two lines per decision tells you whether this area
  is governed at all. Most of the time that is the entire answer.
- **`search` before sweeping.** It tries tags first for exactly this reason.
- **Run `constraints` / `rejected` once**, at planning time, and carry the result.
  Re-running them per question is the expensive mistake.
- **Never `git log -p`** to answer "why". That dumps every diff into context.
  `adr.sh why <path>` is the targeted form.
- Reach for raw git (`log -S`, `log -L`, `bisect`) only when the record does not
  exist — see `references/queries.md`. If you end up there, consider recording
  what you worked out so the next person uses the cheap path.

### When the tags run out

Not every commit gets a tag. If `list` and `search` come up empty for an area,
the rationale is in ordinary commit bodies — `adr.sh why <path>` still finds it,
because it reads the commit, not the tag. Tags are the index over the decisions
worth naming; commit trailers are the long tail.

## Working with the other skills

- **`adr`** — the file in `./.adr/` is the readable record; the tag and commit
  trailers make it queryable and rename-proof. `adr.sh show` prints the tag body,
  which should carry the same `Tags:` as the file for consistent search. Reference the file from the tag,
  and the ADR number from the commits that implement it.
- **`cli-coding-subagents`** — `wt.sh merge <slug>` writes a default merge message.
  Pass `wt.sh merge <slug> -F <file>` to supply the full request/plan/ADRs message
  described above.

## Anti-patterns

| Don't | Why |
|---|---|
| `Co-Authored-By` on commits | Spends the trailer block on credit instead of reasoning |
| Commit body restating the diff | The diff is already there; only *why* is lost |
| Trailers separated by blank lines | Git parses only the last paragraph — the rest silently vanish |
| Prose that wraps inside the trailer block | Kills parsing for every trailer in the block |
| `# Title` as the first line of a tag message | Stripped as a comment |
| Fast-forward merges for real units of work | No merge commit, nowhere to record request or plan |
| Diagrams or images in a merge message | It's a commit message; put it in an ADR file |
| Five-paragraph commit messages | Either the commit is too big or it's an ADR |
| Changing surprising code without `git log -S` first | The surprise is usually deliberate and documented |

---

## Reference files

| File | Read it when |
|---|---|
| `references/template.md` | Writing an ADR — three tiers, Y-statement, section→trailer map, supersession |
| `references/queries.md` | The record doesn't answer it and you need raw git archaeology |
| `scripts/adr.sh` | Navigating decisions — `list` · `tags` · `search` · `why` · `show` · `constraints` · `rejected` |
