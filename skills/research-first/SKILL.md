---
name: research-first
description: >
  Research before consequential implementation or claims. Before building a
  utility, feature, service, or tool, check registries, GitHub, and the codebase
  for existing solutions. Before declaring code redundant or safe to delete,
  check both code and history. For web research or unstable facts, verify with
  authoritative or independent sources. Skip trivial, reversible, or subjective
  work.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Research first

An answer is a claim. A claim standing on one leg falls over quietly — and the
expensive failures are exactly there: hand-building what a library already does,
deleting "redundant" code that was a deliberate decision, quoting last year's
API from memory. This skill makes two moves mandatory for consequential work:
**look for what exists before building**, and **stand every answer on two
independent legs before giving it**.

## 1. Buy before build

When asked to build, add, or implement something, the first act is not design —
it is a sweep for something that already does it:

1. **Registries for the ecosystem** — npm / PyPI / crates.io / NuGet / brew,
   whichever fits.
2. **GitHub** — `gh search repos`, `gh search code` for prior art and skeletons.
3. **What the user already has** — installed tools, existing skills, the
   codebase itself. The best dependency is one already present.

Judge the top candidate like an adult: stars and last-push date, license,
open-issue smell, whether it actually covers the need. **If something covers
~80% or more of the requirement, suggest adopting it** — with the remaining 20%
named — before offering to build. Present the choice; don't silently build.

A negative result is a result: "I searched npm, crates and GitHub for X and Y;
nothing fits — here's why building is right" is a better opening than code.

## 2. Two independent sources — unless one is conclusive

Before a consequential answer leaves your mouth, it has two legs **or one
conclusive one**. Grade the first source before deciding whether you owe a
second. **Independent means different origins** — two blog posts paraphrasing the same README are one
source; a doc page and a mirror of it are one source. Real pairs:

| Claim about | Leg one | Leg two |
|---|---|---|
| how a library behaves | its docs | **running it** — a 10-line probe |
| an internet question | resource A | resource B, from a different origin |
| a version / price / limit | vendor page | changelog, release tag, or a live check |
| "this code is redundant" | the code graph | the history (§3) |
| a CLI's flags | `--help` | the man page, or invoking it |

The hierarchy when legs are scarce: **executing the thing beats reading about
it**; primary (source code, official docs, specs) beats secondary (posts,
answers); recent beats stale — check dates, and prefer sources under ~18 months
in fast-moving ecosystems.

**Memory is a hypothesis, not a source.** For anything that changes — versions,
APIs, pricing, model names — what you remember is leg zero; verify before
asserting. For stable facts (algorithms, language semantics you can test),
memory plus one verification is enough.

### Grading conclusiveness

A single source carries the answer alone only when **all three** hold:

1. **Direct** — you observed the fact itself (ran it, reproduced it, read the
   actual code), or the source is the authoritative origin for this exact
   version: the spec, the changelog entry, the tag.
2. **Deterministic** — re-checking would give the same answer; it is a fact,
   not a judgment, estimate, or summary.
3. **No skew** — no incentive to mislead (vendor marketing fails this), no
   version or date mismatch with what you are being asked about.

| Grade | Looks like | Rule |
|---|---|---|
| **Conclusive** | you executed it; `--help` output; the exact-version changelog; the code itself for "what does it do" | one source is enough — cite it |
| **Probably right** | official docs, a maintainer's answer, a spec for a *near* version | usable alone for low stakes with a label; any real consequence → add a cheap second leg |
| **Suspect** | blog posts, forums, SEO aggregations, undated pages, your own memory | two legs, always |

If there is a *slight chance* the source misleads — wrong version, paraphrase,
stale date, any incentive — it is not conclusive; re-validate with a second
origin. And one hard-won rule: **documentation is never conclusive about
runtime behavior.** Docs said `lastFrame()` carries ANSI codes; running it
proved otherwise. Docs are a claim about the code; execution is the code.

When you genuinely have only one non-conclusive leg, say so: "single source —
X; couldn't cross-check because Y." A labeled one-legged answer is honest; an
unlabeled one is a guess wearing confidence.

## 3. Judging code: the fence has a reason

Before declaring code redundant, dead, obsolete, or safe to delete, walk **both**
legs — the code and the intent:

**Leg one — the code graph.** Callers, tests, dynamic references (reflection,
DI registration, config strings, route tables), build/CI usage. "No references"
from a text search is not "no references".

**Leg two — the history.** Why was it created?

```bash
git log -S 'theThing' --format='%h %s'      # when it appeared, and the message
git blame -w -L <range> -- <file>            # who last shaped it, in which commit
# plus: .adr/ and .memory/ when those conventions exist
```

Then the verdict has three honest forms:

- **The reason never existed** → redundant; say so with both legs shown.
- **The reason existed and still applies** → not redundant; cite the commit or
  ADR that explains it.
- **The reason existed but the world changed** → removable, *because* X no
  longer holds — which is a far stronger recommendation than "looks unused".

Never propose deleting something you can't explain the existence of.

## 4. When sources disagree

Disagreement is a finding, not an obstacle. Do not average, do not silently
pick one:

1. Prefer the more primary leg (running code > docs > posts).
2. If still unresolved, get a third leg — ideally a direct test.
3. Report the conflict either way: "docs say X, behavior is Y" is often the
   most valuable sentence in the answer.

## 5. Proportionality — when NOT to research

The rule is two legs for **consequential** answers, not ceremony for everything:

| Situation | Do |
|---|---|
| Trivial, reversible, or subjective ("rename this?", style taste) | Just answer. |
| Already verified this session | Don't re-verify; cite the earlier check. |
| Casual factual aside, low stakes | Answer, label confidence if unverified. |
| Claim that drives a decision, an edit, or a purchase | Two legs. |
| "Build me X" | §1 sweep, then two legs on the chosen path. |
| Destructive or hard-to-reverse recommendation | Two legs, mandatory, shown. |

The user saying "just do it" moves the gate — but a destructive one-legged
judgment still gets flagged before acting.

## 6. Show your legs

- **Cite as you claim**: link or name the source next to the claim it carries,
  not in a pile at the end.
- Label single-sourced claims explicitly.
- Name the searches behind a negative result.
- Keep receipts short — two links and one sentence of method beat a paragraph
  of process narration.

## Anti-patterns

| Don't | Why |
|---|---|
| Count two mirrors of one origin as two sources | Same leg twice is one leg |
| Average conflicting sources into a middle answer | The conflict was the finding |
| Quote versions/prices/APIs from memory | Memory is leg zero for volatile facts |
| Call code redundant from reading the code alone | The reason lives in history |
| Build before sweeping registries and GitHub | The most expensive way to get a worse library |
| Research a trivial or subjective question | Ceremony erodes trust in the real checks |
| Re-research what this session already verified | Waste; cite the earlier check |
| Hide that an answer is single-sourced | Unlabeled guesses compound downstream |
