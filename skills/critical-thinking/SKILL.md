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

A flag buried in prose — "one thing you might want to consider…" — extracts a decision while giving nothing to decide *with*. Prose hides trade-offs. Structure exposes them.

**Every genuine decision point you surface gets a comparison table.** User chooses from evidence side by side, not from whichever option your sentence made sound best.

## When this fires

- Summing up work, about to write "consider…", "your call…", "worth deciding…", "I'd suggest…", "should I…?"
- More than one viable approach exists and you're picking one — show the others.
- You deferred something to user (sign-off, scope cut, tool choice).
- User asks "what are my options?"

## When it does NOT fire

- **Pure FYIs.** "Build takes 4 minutes" — no choice. Don't table it.
- **No real alternative.** One sane path — say so in a sentence. One-column table = press release.
- **Trivia.** Negligible, trivially reversible impact gets half-sentence, not table.
- **>3 decisions in one summary** — over-flagging. Merge related, make routine calls yourself, table only what genuinely needs user.

## The format

Options as columns (2–4), fixed rows. Exact shape:

```markdown
| | **A. <option>** | **B. <option>** | **C. <option>** |
|---|---|---|---|
| **Pros** | … | … | … |
| **Cons** | … | … | … |
| **Cost** | <time/money/tokens, concrete> | … | … |
| **Reversible?** | trivially / with effort / one-way | … | … |

**Recommendation: <letter>** — <reason in one sentence>. The honest con: <recommended option's real downside, restated, not softened>.

**If you do nothing:** <what current default actually leads to>.
```

Rules keeping it honest:

- **Every column gets real cons.** Option without downsides = advocacy wearing a table. If no con found, you don't understand the option.
- **No strawmen.** Every column must be something reasonable person would pick. Padding with fake third to make yours look good > two columns.
- **Cost is concrete.** "~1 hour", "one repo commit", "bills paid overage" — not "some effort".
- **Reversibility uses three words:** *trivially* (undo = command), *with effort* (undo = real work), *one-way* (undo = rewrite or data gone). Deliberation depth matches this row.
- **Recommendation restates its own con.** Can't say what's wrong with your rec? Not analysis yet.
- **"If you do nothing" mandatory.** Inaction always an option, usually silent winner; name where it leads.
- **No recommendation is valid** — when genuinely balanced, say "truly your call, here's what it hinges on" rather than manufacturing confidence.
- **Close calls get sensitivity line:** "flips to B if <assumption> changes." One sentence, only when margin thin.

## Optional rows — add only when stakes warrant

| Row | Add when |
|---|---|
| **Worst credible outcome** | any option could fail expensively — one line prob × impact per column |
| **Locks you into** | option carries lock-in Cons row can't fit |
| **Flips if** | ranking sensitive to one assumption |

## Escalation

Table compares; doesn't deliberate. When decision is **both one-way and expensive**, don't stretch table — escalate:

- `thinking-kepner-tregoe` (if installed) for weighted MUST/WANT scoring with adverse-consequence pass.
- `thinking-pre-mortem` (if installed) before committing: assume failed, reason backward.
- Otherwise, offer user deeper analysis explicitly instead of bigger table.

Reversibility framing follows two-way/one-way-door model; adverse-consequence and sensitivity from Kepner-Tregoe (see [cc-thinking-skills](https://github.com/tjboudreaux/cc-thinking-skills)).

## Example

> **Where should retry logic live?**
>
> | | **A. In HTTP client** | **B. Per call site** |
> |---|---|---|
> | **Pros** | One implementation; every caller inherits | Each endpoint tunes retries to its semantics |
> | **Cons** | Non-idempotent calls could retry unsafely | Duplication; next endpoint forgets |
> | **Cost** | ~2h + idempotency allowlist | ~30min now, recurring forever |
> | **Reversible?** | with effort | trivially |
>
> **Recommendation: A** — allowlist confines unsafe-retry risk; B's cost recurs on every new endpoint. Honest con: A is behavior change for all callers, needs regression pass.
>
> **If you do nothing:** three intermittently failing endpoints keep failing; each gets hand-rolled retry eventually.

## Anti-patterns

| Don't | Why |
|---|---|
| Table with no Cons in one column | Advocacy, not analysis |
| "Some effort" in Cost row | Unmeasurable = undecidable |
| Recommendation without its own con | Selling, not advising |
| Omitting "if you do nothing" | Inaction is default option, hidden |
| Table for an FYI | Trains user to skip your tables |
| Five options | Nobody compares five columns — cut to viable 2-4 |
| Burying one-way decision in table | Escalate it; tables for comparable stakes |
