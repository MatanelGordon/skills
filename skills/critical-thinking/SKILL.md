---
name: critical-thinking
description: >
  Present flagged decisions as honest comparison tables instead of prose. Use
  whenever a work summary is about to tell the user "consider X", "one thing
  needs your call", "you should decide", "worth flagging" — or defers any
  sign-off, trade-off, or open choice to them. Each flagged decision becomes a
  compact table of 2-4 options with pros, cons, cost and reversibility, plus a
  recommendation that admits its own downside and a "if you do nothing" default.
  Also use when the user asks "what are my options" or must choose between
  tools, designs, scopes, or approaches. Not for FYIs with no choice in them.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Critical thinking

A flag buried in a closing paragraph — "one thing you might want to consider…" —
extracts a decision from the user while giving them nothing to decide *with*.
Prose hides trade-offs. Structure exposes them.

So: **every genuine decision point you surface gets a comparison table.** The
user chooses from evidence laid side by side, not from whichever option your
sentence happened to make sound best.

## When this fires

- You are summing up work and about to write "consider…", "your call…",
  "worth deciding…", "I'd suggest…", "should I…?"
- More than one viable approach exists and you're picking one — show the others.
- You deferred something to the user (a sign-off, a scope cut, a tool choice).
- The user asks "what are my options?"

## When it does NOT fire

- **Pure FYIs.** "The build takes 4 minutes now" contains no choice. Don't table it.
- **No real alternative.** If there's one sane path, say so in a sentence —
  a one-column table is a press release.
- **Trivia.** Decisions with negligible, trivially reversible impact get a
  half-sentence, not a table.
- More than ~3 decisions in one summary means you're over-flagging: merge the
  related ones, make the routine calls yourself, and table only what genuinely
  needs the user.

## The format

Options as columns (2–4), fixed rows. This exact shape:

```markdown
| | **A. <option>** | **B. <option>** | **C. <option>** |
|---|---|---|---|
| **Pros** | … | … | … |
| **Cons** | … | … | … |
| **Cost** | <time/money/tokens, concrete> | … | … |
| **Reversible?** | trivially / with effort / one-way | … | … |

**Recommendation: <letter>** — <the reason in one sentence>. The honest con:
<the recommended option's real downside, restated, not softened>.

**If you do nothing:** <what the current default actually leads to>.
```

Rules that keep it honest:

- **Every column gets real cons.** An option without downsides is advocacy
  wearing a table. If you can't find a con, you haven't understood the option.
- **No strawmen.** Every column must be something a reasonable person would
  pick. Padding with a fake third option to make yours look good is worse than
  two columns.
- **Cost is concrete.** "~1 hour", "one repo commit", "bills paid overage" —
  not "some effort".
- **Reversibility uses three words**: *trivially* (undo is a command),
  *with effort* (undo costs real work), *one-way* (undo is a rewrite or the
  data is gone). Deliberation depth should match this row.
- **The recommendation restates its own con.** If you can't say what's wrong
  with your recommendation, it isn't analysis yet.
- **"If you do nothing" is mandatory.** Inaction is always an option and
  usually the silent winner; name where it leads.
- **No recommendation is a valid recommendation** — when options are genuinely
  balanced, say "this one's truly your call, here's what it hinges on" rather
  than manufacturing confidence.
- **Close calls get a sensitivity line**: "this flips to B if <assumption>
  changes." One sentence, only when the margin is thin.

## Optional rows — add only when stakes warrant

| Row | Add when |
|---|---|
| **Worst credible outcome** | any option could fail expensively — one line of probability × impact per column |
| **Locks you into** | an option carries lock-in the Cons row can't fit |
| **Flips if** | the ranking is sensitive to one assumption |

## Escalation

A table compares; it does not deliberate. When a decision is both **one-way and
expensive**, don't stretch the table — escalate to a full framework:

- `thinking-kepner-tregoe` (if installed) for weighted MUST/WANT scoring with an
  adverse-consequence pass.
- `thinking-pre-mortem` (if installed) before committing to a chosen plan:
  assume it failed, reason backward.
- Otherwise, offer the user a deeper analysis explicitly instead of a bigger table.

The reversibility framing here follows the two-way/one-way-door model; the
adverse-consequence and sensitivity ideas come from Kepner-Tregoe decision
analysis (see [cc-thinking-skills](https://github.com/tjboudreaux/cc-thinking-skills)).

## Example

> **Where should the retry logic live?**
>
> | | **A. In the HTTP client** | **B. Per call site** |
> |---|---|---|
> | **Pros** | One implementation; every caller inherits it | Each endpoint tunes retries to its semantics |
> | **Cons** | Non-idempotent calls could retry unsafely | Duplication; the next endpoint forgets it |
> | **Cost** | ~2h + an idempotency allowlist | ~30min now, recurring forever |
> | **Reversible?** | with effort | trivially |
>
> **Recommendation: A** — the allowlist confines the unsafe-retry risk, and B's
> cost recurs on every new endpoint. The honest con: A is a behavior change for
> every existing caller and needs a regression pass.
>
> **If you do nothing:** the three endpoints that already fail intermittently
> keep failing, and each gets a hand-rolled retry eventually anyway.

## Anti-patterns

| Don't | Why |
|---|---|
| Table with no Cons in one column | Advocacy, not analysis |
| "Some effort" in the Cost row | Unmeasurable = undecidable |
| Recommendation without its own con | You're selling, not advising |
| Omitting "if you do nothing" | Inaction is the default option and it's hidden |
| A table for an FYI | Trains the user to skip your tables |
| Five options | Nobody compares five columns — cut to the viable 2-4 |
| Burying the one-way decision in a table | Escalate it; tables are for comparable stakes |
