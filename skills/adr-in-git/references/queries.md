# Git archaeology cookbook

Every command verified on git 2.50.1. Use these before changing code that looks
wrong — surprising code is usually deliberate, and the reason is in here.

## The core chain: line → commit → reason

```bash
# 1. Which commit last touched this line?
git blame -L 42,42 src/parser.ts

# Just the sha, for scripting
SHA=$(git blame -L 42,42 --porcelain src/parser.ts | head -1 | cut -d' ' -f1)

# 2. Why did that commit happen?
git show -s --format='%B' "$SHA"

# 3. Its structured decision data
git show -s --format='%(trailers)' "$SHA"
git show -s --format='%(trailers:key=Rejected,valueonly)' "$SHA"

# 4. What did the diff actually do?
git show "$SHA" -- src/parser.ts
```

`git blame` shows the *last* touch, which is often a reformat. To skip past noise:

```bash
git blame -w -C -L 42,42 src/parser.ts        # ignore whitespace, follow copies
git log -L 42,42:src/parser.ts                # full history of just those lines
```

`git log -L` is the strongest tool here — it shows every commit that touched that
line range, with the diff, straight through renames.

## Finding when something appeared or vanished

```bash
# Commits that changed the NUMBER of occurrences of a string (pickaxe)
git log -S 'TIMEOUT_MS' --format='%h %ad %s' --date=short

# Same, but with the diffs
git log -S 'TIMEOUT_MS' -p

# Commits whose diff matches a regex (broader than -S)
git log -G 'timeout\s*=\s*[0-9]+' --format='%h %s'

# When was a file deleted, and why?
git log --diff-filter=D --format='%h %s' -- path/to/gone.ts

# Full history of a file across renames
git log --follow --format='%h %ad %s' --date=short -- src/parser.ts
```

`-S` answers "when did this string get introduced or removed"; `-G` answers "when
did a line matching this pattern change at all". `-S` is usually what you want.

## Searching the reasoning

```bash
# Commit messages mentioning a term
git log --grep='timeout' -i --format='%h %s'

# Must match several patterns
git log --grep='timeout' --grep='gateway' --all-match --format='%h %s'

# By reason code
git log --grep='^Reason: latency-regression' --format='%h %s'

# Only merges — the unit-of-work view
git log --merges --format='%h %s'

# Trunk history without merged-branch noise
git log --first-parent --format='%h %s'
```

## Trailer queries

```bash
# All trailers on a commit
git log -1 --format='%(trailers)'

# One key's values
git log --format='%(trailers:key=Constraint,valueonly)' | grep -v '^$' | sort -u

# Commit + one trailer, tabular
git log --format='%h|%s|%(trailers:key=Refs,valueonly)' | grep 'adr-0004'

# Everything that references a given ADR
git log --format='%h %s' --grep='adr-0004'
```

Two sweeps worth running before planning any change:

```bash
echo "== active constraints =="
git log --format='%(trailers:key=Constraint,valueonly)' | grep -v '^$' | sort -u

echo "== already rejected =="
git log --format='%(trailers:key=Rejected,valueonly)' | grep -v '^$' | sort -u
```

## ADR tags

```bash
# All ADR tags with their titles
git tag -l 'adr-*' --format='%(refname:short)  %(contents:subject)'

# Full body of one
git tag -l adr-0004 --format='%(contents)'

# Its trailers
git tag -l adr-0004 --format='%(trailers:key=Constraint,valueonly)'

# Which ADRs are reachable from here (i.e. actually merged)
git tag --merged HEAD 'adr-*'

# Which are NOT yet merged
git tag --no-merged HEAD 'adr-*'

# Which commit does an ADR point at, and what did it change?
git rev-list -n1 adr-0004
git show $(git rev-list -n1 adr-0004) --stat
```

Tags are not pushed by default:

```bash
git push origin --tags          # or: git push origin adr-0004
git fetch --tags
```

## Scoping by time, author, path

```bash
git log --since='3 months ago' --format='%h %ad %s' --date=short
git log --author='name' --format='%h %s'
git log --format='%h %s' -- 'src/parser/**'
git log --format='%h %s' -- . ':(exclude)**/*.test.ts'
```

## When the reason genuinely isn't recorded

```bash
# Find the commit that introduced a behaviour change
git bisect start
git bisect bad HEAD
git bisect good v1.2.0
# ... test, mark, repeat
git bisect reset

# What else shipped alongside a commit?
git show --stat <sha>

# What was the state of a file at that point?
git show <sha>:src/parser.ts

# Was the change part of a merged branch? What was that branch's story?
git log --merges --ancestry-path <sha>..HEAD --format='%h %s' | tail -1
```

If nothing explains it, say so plainly rather than inventing a rationale — and
record the reason once you've worked it out, so the next person doesn't repeat
the dig.

## Retrofitting: `git notes`

Notes attach text to an existing commit without rewriting history — the only way
to add reasoning after the fact.

```bash
git notes add -m "Why: this was a hotfix for the Black Friday incident." <sha>
git log --show-notes --format='%h %s%n%N'
git push origin refs/notes/commits      # not pushed by default
git fetch origin refs/notes/*:refs/notes/*
```

Use sparingly. Notes are easy to miss because most tooling doesn't show them
without `--show-notes`, and they don't survive a rebase of the commit they
annotate. Prefer getting the message right the first time; use notes only for
history you can't rewrite.

## Output formatting

```bash
git log --format='%h %ad %s' --date=short          # short sha, date, subject
git log --format='%B'                              # raw body
git log --format='%s%n%n%b'                        # subject + body
git log --graph --oneline --first-parent           # trunk shape
```

Useful placeholders: `%H` full sha · `%h` short · `%s` subject · `%b` body ·
`%B` raw · `%ad` author date · `%an` author · `%(trailers:key=K,valueonly)`.
