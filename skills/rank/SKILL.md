---
name: rank
description: >
  Attach a per-claim confidence rank (VERIFIED / TRACED / INFERRED / PATTERN /
  GUESS) to answers built from reading undocumented code. Fires automatically
  when reporting findings from code no docs, comments, or ADRs cover — "how
  does X work", "why does Y exist", "where is Z handled", "is it safe to
  change W" — and manually via /rank to rank the claims in the previous
  answer, or one claim the user supplies. Each rank names the kind of evidence
  held, and every rank below VERIFIED names the one concrete step that would
  upgrade it. Not for documented behavior, verbatim quotes, or trivial facts —
  over-ranking makes ranks noise.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Rank

Findings dug out of undocumented code all arrive in the same confident
sentence. "Retries are capped at 3" reads identically whether you ran the
retry path or skimmed a function name — and the reader can't tell which
claims will hold when they act on them. So: **every substantive claim gets a
tag naming the evidence behind it**, and every tag below the top names the one
step that would raise it. The reader inherits not just an answer but a map of
where it is solid and where it is thin.

This is the fixed vocabulary for the confidence labels `research-first`
already demands on single-sourced claims.

## When this fires

- You dove into code with **no docs, comments, or ADRs covering the area**
  and are reporting what you found: "how does X work", "why does Y exist",
  "where is Z handled", "is it safe to change W".
- Your answer mixes things you observed with things you concluded — which is
  almost every answer built from reading unfamiliar code.
- The user types **`/rank`**: re-rank the substantive claims in your previous
  answer, or rank the specific claim they supply (see §Manual `/rank`).

## When it does NOT fire

- **Documented behavior.** The doc, comment, or ADR is the receipt — cite it
  instead of ranking around it.
- **Verbatim facts.** "The constant is `MAX_RETRIES = 3`" is a quote, not an
  inference. Quotes need a file path, not a rank.
- **Trivia.** Claims nobody will act on don't earn a tag.
- Ranks go on **inferences and judgments a reader might rely on** — safety
  calls, causal explanations, behavioral descriptions. Tag those; leave the
  rest alone. Ranks on everything are ranks on nothing.

## The scale

Five levels. Each is defined by **the kind of evidence you hold**, never by
how sure you feel — which is why the names describe the evidence:

| Rank | Evidence held | Sounds like |
|---|---|---|
| **VERIFIED** | You executed or tested the behavior and observed the result — ran it, reproduced it, probed it | "ran the handler with an expired token: 401" |
| **TRACED** | You read the full code path end to end, **including callers and call sites**, but did not run it | "followed the write from route to repository; nothing else touches this table" |
| **INFERRED** | Partial reading: names, types, signatures, one file without its callers | "the `Optional` return type suggests absence is an expected case" |
| **PATTERN** | Convention or similarity — how this framework usually works, how similar codebases do it; this specific code not read | "Express middleware like this is normally registered globally" |
| **GUESS** | No code-specific evidence; plausibility only | "probably left over from the v2 migration" |

Boundary rules, because the edges are where inflation lives:

- Reading a function **without its callers** is INFERRED, not TRACED. Callers
  are where the assumptions you didn't see live.
- Reading a test that covers the behavior is TRACED. **Running** it is
  VERIFIED.
- "The types wouldn't compile otherwise" is INFERRED — types constrain, they
  don't execute.

## The upgrade clause

Every rank below VERIFIED carries **one concrete clause** naming the evidence
that would raise it: "running X", "reading caller Y", "checking `git log -S`
for Z". Not "more investigation" — the clause is the reader's (or your own)
next command, so it must be executable as written.

And the corollary: **if the upgrade costs under a minute, do it instead of
tagging it.** A cheap `grep` for callers or a one-line probe beats shipping an
INFERRED with an apology. Ranks are for when verification wasn't worth the
cost, not a license to skip it.

## Calibration

- **Rank the evidence, not the feeling.** "Pretty sure" is not a level.
- **Never inflate to look competent.** An inflated rank fails exactly when the
  reader relies on it; a downgraded honest rank costs one upgrade step. The
  honest one always wins.
- **Torn between two ranks → take the lower.**
- **Undocumented + unfamiliar caps the default at INFERRED.** In an area with
  no docs that you haven't worked in this session, TRACED must be earned by
  actually walking the path — including callers — and VERIFIED by running it.
  Familiarity you don't have doesn't count as evidence.
- **Conflicting evidence ranks on the weaker leg**, and the conflict itself
  gets reported — per `research-first`, disagreement is a finding.

## Output format

Compact, inline, no ceremony:

- **1–2 ranked claims** — tag inline, right after the claim, upgrade clause
  included:

  > Retries cap at 3 and then drop the message silently
  > `[TRACED — up: run the retry path against a mocked 500]`.

- **3+ ranked claims** — inline tags shrink to the bare rank, and one compact
  table at the end carries the upgrades:

  > The dead-letter queue is never read `[TRACED]`, the TTL exists to bound
  > its size `[GUESS]`, and removing the consumer is safe `[INFERRED]`.
  >
  > | Claim | Rank | Upgrades with |
  > |---|---|---|
  > | DLQ is never read | TRACED | running a probe message through |
  > | TTL exists to bound size | GUESS | `git log -S 'ttl'` on the config |
  > | Removing the consumer is safe | INFERRED | reading the two reflective call sites in `worker/` |

- **VERIFIED** tags name what was run, in a word or two: `[VERIFIED: ran
  probe]`. No upgrade clause — there's nowhere up from observed.

## Manual `/rank`

On `/rank` with no argument: re-read your previous answer, pull out its
substantive claims, and rank each against the evidence you actually held when
you wrote it — not the confidence you projected. If something you asserted
flatly now ranks GUESS, say so plainly; retroactive ranking that softens the
downgrade defeats the point.

On `/rank <claim>`: rank that claim alone, with the same honesty. If you hold
no evidence either way, that's a GUESS with an upgrade clause, not an
opportunity to improvise support.

## Anti-patterns

| Don't | Why |
|---|---|
| Tag every sentence | Tags on trivia bury the tags that matter — over-ranking makes ranks noise |
| One blanket rank for the whole answer | The answer mixes observation with guesswork; a single rank misdescribes both |
| TRACED without reading callers | The callers are where the surprise lives; that's INFERRED wearing a better tag |
| VERIFIED because "the tests would catch it" | Unrun tests are reading, not running |
| "More investigation needed" as an upgrade clause | Unactionable; the clause must be a runnable next step |
| Inflating a rank to sound competent | It fails precisely when the reader leans on it |
| Ranking documented or quoted facts | The receipt already exists; cite it |
| Tagging what a one-minute check would verify | Do the check; ship the higher rank |
