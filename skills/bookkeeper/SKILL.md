---
name: bookkeeper
description: >
  Maintain and consult a repository knowledge base in ./.memory/. Read
  .memory/index.md before answering questions or planning work involving the
  environment, hosts, credentials locations, naming conventions, glossaries,
  operational quirks, or learned constraints. Use the index tags to open one
  relevant topic file instead of searching the repository. Write or update
  small tagged entries, plus both index tables, when durable facts surface.
  Use for facts that are shared, stable, and not derivable from code or git.
  Do not use for architectural decisions, which belong in the adr skill, or for
  session trivia and temporary state.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Bookkeeper

`.memory/` is the repository's durable facts layer: small markdown records for
knowledge the code cannot tell you. It complements `adr`, which records durable
decisions; ordinary git history preserves why code changed.

**Location: `./.memory/` at the repo root, committed to git.** Create it lazily
when the first durable fact appears. `index.md` is its map and always gets read
first.

---

## Reading: consult the map first

Before answering or planning around environments, hosts, credentials locations,
deployment quirks, project vocabulary, naming conventions, or learned
constraints, check for `.memory/index.md`.

```bash
test -f .memory/index.md && sed -n '1,240p' .memory/index.md
```

Use PageIndex retrieval:

1. Read `index.md`, not the whole directory.
2. Match the question against each row's description and tags.
3. Open **one** best-matching topic file.
4. If the row points to `<folder>/index.md`, open that sub-index, then its one
   best-matching entry.
5. Answer from the selected entry and cite its path when it constrains the work.

This is a cheap explicit lookup, not similarity search. The index should make
the likely file obvious before any topic content enters context.

If the index exists but no row matches, use grep as the fallback:

```bash
grep -ri 'remote' .memory/
```

Search for the shortest likely tag. Do not start with repo-wide grep or load
every memory file "just in case." If `.memory/` does not exist, proceed normally;
absence of memory is not a hidden constraint.

## What earns memory

A fact qualifies when it is both **durable** and **not derivable from the
repository itself**. It should save a future teammate or agent from rediscovery.

| Qualifies | Why |
|---|---|
| A remote host's stable name and where its SSH alias is configured | The host relationship is environmental, not in application code |
| Credentials live in a named vault path, without the secret value | The location is durable operational knowledge |
| CI on one runner requires a non-obvious environment quirk | The constraint survives the current session |
| A domain term means something project-specific | The glossary prevents repeated misunderstanding |
| A short recovery or deployment runbook | The learned sequence is reusable operational knowledge |

Do **not** copy facts already available from code, configuration, tests, docs, or
git history. Link to those sources instead when a memory entry needs context.

| Does not qualify | Put it here instead |
|---|---|
| An architectural or hard-to-reverse choice | The `adr` skill |
| Why a code change was made | The commit body and git history |
| A command that failed once during this session | Working notes, then discard |
| Current branch, temporary port, or today's task state | Session context |
| Behavior plainly visible in source or configuration | Leave it in its authoritative file |

When a fact and a decision touch the same subject, keep the split: memory says
what is true about the environment; the ADR says what the team chose and why.

## Writing: entry and index are one change

When a durable fact surfaces, write it while the evidence is fresh:

1. Read `.memory/index.md` and reuse its topic names and tag vocabulary.
2. Choose one topic file; create one only if no existing topic fits.
3. Add or update one entry for the fact. Preserve its `created:` timestamp and
   set `updated:` to the current UTC ISO 8601 timestamp.
4. Update the topic row in the first index table.
5. Add or update the entry row in the `## Entries` table.
6. Review the entry for secrets and facts already recorded elsewhere.
7. Commit the memory with the work that discovered or depends on it.

**An entry not in the index is invisible.** The write is not complete until
both tables agree with the topic file. A stale index is worse than no index: it
confidently sends readers to the wrong place.

Keep one topic per file and one fact per entry. Split a topic before it becomes
expensive to scan. Use a folder with its own `index.md` only when a flat topic
file is no longer small; the root index then points to that sub-index.

## Exact index format

Use this shape for `.memory/index.md`:

````markdown
# Memory index

> How retrieval works (PageIndex): read this file first, pick the row whose
> description and tags best match the question, then open that path. A
> `<folder>/index.md` row is a sub-index: open it, then open the one entry it
> lists. No similarity search is involved.

| Path | What it holds | Tags |
|---|---|---|
| remote.md | Remote docker hosts and the names given to them | remote, ssh, docker, hosts |

## Entries

| Path | Entry | Title | Tags |
|---|---|---|---|
| remote.md | matanel-win11 | Connection to matanel-win11 | remote, windows11 |
````

The first table routes to a topic or sub-index. The second routes to an exact
entry. Update descriptions and tags when content changes enough that the old
routing language would mislead.

## Exact entry format

Topic files have one heading and description, then one marked section per
entry. Every entry carries its own frontmatter block:

````markdown
# Remote hosts

> Remote docker hosts and the names given to them.

<!-- entry:matanel-win11 -->
## matanel-win11
---
id: matanel-win11
title: Connection to matanel-win11
created: 2026-08-12T19:16:24.067Z
updated: 2026-08-12T19:16:24.067Z
tags: [remote, windows11]
links: []
---
Host: ...
````

Use a stable lowercase kebab-case `id`; the HTML marker, heading, `id`, and
index Entry value must match. Put related source paths, docs, ADRs, or URLs in
`links`. Keep the body factual and short enough to update safely.

## Tags: reuse the vocabulary

Choose **2-4 lowercase reusable tags** per entry. Before inventing one, scan the
index tables for vocabulary already in play.

Good tags name a system (`docker`, `billing`), concern (`security`, `network`),
surface (`ssh`, `ci`), or environment (`staging`, `windows11`). Prefer a term a
future reader will actually search. A synonym used once fragments retrieval;
`remote` and `hosts` reused across entries are better than a trail of clever
near-duplicates.

Topic rows may use the union of their entries' most useful tags, but keep the
list focused. If tags stop narrowing the choice, prune or consolidate them in
the topic file and both index tables together.

## Git and secret safety

`.memory/` is shared repository knowledge, so it must be tracked. Check that a
broad dotfile rule does not swallow it:

```bash
git check-ignore -v .memory/ 2>/dev/null && echo "IGNORED — fix .gitignore" || echo "tracked"
```

If ignored, add the narrowest negation required, such as `!.memory/`, and tell
the user. Never put passwords, tokens, private keys, recovery codes, or secret
values in `.memory/` without the user's explicit direction. Record the safe
location or retrieval procedure instead.

Commits that add or change memory, or whose implementation depends on it, carry
a `Refs:` trailer in the final trailer block:

```text
Reason: runner-constraint
Constraint: deployment uses the named build host
Refs: .memory/remote.md#matanel-win11
```

Use `Refs: .memory/<file>` when the whole topic matters, or
`.memory/<file>#<entry-id>` for one fact. Git trailers form the final paragraph,
one per line, with no blank line inside it.

## Anti-patterns

| Don't | Why |
|---|---|
| Add an entry without updating both index tables | Index drift makes the fact invisible or misroutes retrieval |
| Invent a new tag for every nuance | Tag sprawl destroys the shared lookup vocabulary |
| Grow a giant catch-all file | PageIndex only stays cheap when topics and entries stay small |
| Store secrets without the user's explicit direction | Committed memory is shared and durable; record locations, not values |
| Duplicate what code, config, docs, ADRs, or git already say | Two authorities drift; memory is only for non-derivable facts |
| Record decisions or commit rationale as memory | `adr` and git history preserve those with the right semantics |
| Save session trivia or temporary state | Noise makes durable constraints harder to find |
| Describe retrieval as embeddings or similarity search | The contract is explicit tag routing through `index.md` |
