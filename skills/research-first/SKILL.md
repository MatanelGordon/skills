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

An answer is a claim. One-legged claims fall quietly — expensive failures come from hand-building what libraries do, deleting "redundant" code that was deliberate, quoting stale APIs from memory. Two mandatory moves for consequential work: **look before building**, **stand answers on two independent legs**.

## 1. Buy before build

First act when asked to build: sweep for existing solutions:

1. **Registries** — npm / PyPI / crates.io / NuGet / brew.
2. **GitHub** — `gh search repos`, `gh search code` for prior art.
3. **What user already has** — installed tools, skills, codebase. Best dependency is one already present.

Judge top candidate: stars, last-push, license, open issues, coverage. **If ~80%+ covered, suggest adopting it** — naming remaining 20% — before building. Present choice; don't silently build.

Negative result is a result: "Searched npm, crates, GitHub for X and Y; nothing fits — here's why building is right" beats code.

## 2. Two independent sources — unless one is conclusive

Before consequential answer, it has two legs **or one conclusive one**. Grade first source before deciding on second. **Independent = different origins** — two blogs paraphrasing same README = one source; doc + mirror = one source. Real pairs:

| Claim about | Leg one | Leg two |
|---|---|---|
| library behavior | its docs | **running it** — 10-line probe |
| internet question | resource A | resource B, different origin |
| version/price/limit | vendor page | changelog, release tag, live check |
| "code is redundant" | code graph | history (§3) |
| CLI flags | `--help` | man page, or invoking it |

Hierarchy when legs scarce: **executing beats reading**; primary (source, docs, specs) beats secondary (posts, answers); recent beats stale — prefer <18 months in fast ecosystems.

**Memory is hypothesis, not source.** For volatile facts (versions, APIs, pricing, models) — memory is leg zero; verify before asserting. For stable facts (algorithms, testable semantics) — memory + one verification suffices.

### Grading conclusiveness

Single source carries answer alone only when **all three** hold:

1. **Direct** — observed fact (ran it, reproduced, read actual code), or authoritative origin for exact version: spec, changelog, tag.
2. **Deterministic** — re-check gives same answer; fact, not judgment/estimate/summary.
3. **No skew** — no incentive to mislead (vendor marketing fails), no version/date mismatch.

| Grade | Looks like | Rule |
|---|---|---|
| **Conclusive** | executed it; `--help`; exact-version changelog; code for "what does it do" | one source enough — cite it |
| **Probably right** | official docs, maintainer answer, spec for near version | usable alone for low stakes with label; real consequence → add cheap second leg |
| **Suspect** | blogs, forums, SEO, undated pages, your memory | two legs, always |

If *slight chance* source misleads — wrong version, paraphrase, stale date, incentive — not conclusive; re-validate with second origin. **Docs never conclusive about runtime behavior.** Docs claimed `lastFrame()` carries ANSI; running proved otherwise. Docs claim about code; execution is code.

When only one non-conclusive leg: say so — "single source — X; couldn't cross-check because Y." Labeled one-legged = honest; unlabeled = guess wearing confidence.

## 3. Judging code: the fence has a reason

Before declaring code redundant/dead/safe to delete, walk **both** legs:

**Leg one — code graph.** Callers, tests, dynamic refs (reflection, DI, config strings, route tables), build/CI usage. "No references" from text search ≠ "no references".

**Leg two — history.** Why created?

```bash
git log -S 'theThing' --format='%h %s'      # when appeared, message
git blame -w -L <range> -- <file>            # who shaped it, which commit
# plus: .adr/ and .memory/ when conventions exist
```

Three honest verdict forms:

- **Reason never existed** → redundant; show both legs.
- **Reason existed and still applies** → not redundant; cite commit/ADR.
- **Reason existed but world changed** → removable *because* X no longer holds — stronger than "looks unused".

Never propose deleting what you can't explain the existence of.

## 4. When sources disagree

Disagreement = finding, not obstacle. Don't average, don't silently pick:

1. Prefer more primary leg (running code > docs > posts).
2. If unresolved, get third leg — ideally direct test.
3. Report conflict: "docs say X, behavior is Y" often most valuable sentence.

## 5. Proportionality — when NOT to research

Two legs for **consequential** answers, not ceremony for everything:

| Situation | Do |
|---|---|
| Trivial, reversible, subjective ("rename?", style) | Just answer. |
| Already verified this session | Don't re-verify; cite earlier check. |
| Casual factual aside, low stakes | Answer, label confidence if unverified. |
| Claim driving decision/edit/purchase | Two legs. |
| "Build me X" | §1 sweep, then two legs on chosen path. |
| Destructive/hard-to-reverse recommendation | Two legs, mandatory, shown. |

User saying "just do it" moves gate — but destructive one-legged judgment still flagged before acting.

## 6. Show your legs

- **Cite as you claim**: link/name source next to claim, not in pile at end.
- Label single-sourced claims explicitly.
- Name searches behind negative results.
- Receipts short — two links + one sentence method beats paragraph of process.

## Anti-patterns

| Don't | Why |
|---|---|
| Count two mirrors of one origin as two sources | Same leg twice = one leg |
| Average conflicting sources | Conflict was the finding |
| Quote versions/prices/APIs from memory | Memory is leg zero for volatile facts |
| Call code redundant from code alone | Reason lives in history |
| Build before sweeping registries/GitHub | Most expensive way to get worse library |
| Research trivial/subjective question | Ceremony erodes trust in real checks |
| Re-research verified this session | Waste; cite earlier check |
| Hide single-sourced answer | Unlabeled guesses compound downstream |
