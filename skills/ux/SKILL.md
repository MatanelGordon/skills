---
name: ux
description: >
  Judge and improve user experience with a concrete, style-agnostic rubric — a
  severity-rated heuristic audit plus measurable outcomes (task success, time on task,
  error rate, SUS) with published thresholds for pass/fail. Use when designing or
  reviewing any interface — web, mobile, CLI, TUI, API, or docs — when asked "is this
  good UX", when a flow feels confusing, when choosing between design options, when
  writing error messages, empty states, or confirmations, and when deciding what to cut.
  Applies regardless of visual style or design system: it evaluates behavior, structure,
  and outcomes, not aesthetics. Covers Nielsen's 10 heuristics with 0-4 severity
  scoring, Google's HEART framework, SUS interpretation, and the UX laws that predict
  problems before testing.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# UX

A usable interface is one where people **accomplish their goal, on the first try,
without being taught**. Everything below serves that definition.

This skill is deliberately **style-agnostic**. It says nothing about color palettes,
typography, or which design system to use. Those are taste and brand. What follows
is about behavior, structure, and measurable outcomes — the parts that are
actually right or wrong, and that apply equally to a web app, a CLI, or an API.

---

## How to judge whether a UX is good or bad

Never answer "is this good UX?" with an opinion. Run the rubric. It has two
halves, and you need both: the audit finds *what* is wrong, the metrics prove
*whether it matters*.

### Part 1 — Heuristic audit (qualitative, do this always)

Walk the interface against **Nielsen's 10 heuristics** and rate every violation on
the standard **0–4 severity scale**:

| Severity | Meaning | Action |
|---|---|---|
| 0 | Not a usability problem | ignore |
| 1 | Cosmetic — fix if time permits | backlog |
| 2 | Minor — low frequency or easy workaround | schedule |
| 3 | Major — users are blocked or frequently confused | fix before ship |
| 4 | Catastrophe — task cannot be completed, or data is lost | fix now, ship blocker |

Severity is a function of **frequency × impact × persistence** (does it get easier
after the first encounter, or bite every time?). A rare annoyance is a 1; a
frequent dead end is a 4.

The 10 heuristics, each phrased as the question to ask:

1. **Visibility of system status** — At every moment, does the user know what the system is doing and what state they are in?
2. **Match between system and the real world** — Does it use the user's words and concepts, not the implementation's?
3. **User control and freedom** — Is there always a marked exit — undo, cancel, back — from any state?
4. **Consistency and standards** — Do the same words and actions mean the same thing everywhere, and follow platform convention?
5. **Error prevention** — Are dangerous or invalid actions made impossible, rather than merely reported after the fact?
6. **Recognition rather than recall** — Is the information needed to act visible, or must the user remember it from elsewhere?
7. **Flexibility and efficiency of use** — Can experts go faster (shortcuts, defaults, batch) without harming novices?
8. **Aesthetic and minimalist design** — Is anything present that isn't needed? Every extra element competes with the important ones.
9. **Help users recognize, diagnose, and recover from errors** — Does each error say, in plain language, what went wrong and exactly what to do next?
10. **Help and documentation** — When help is needed, is it findable, task-focused, and concrete?

Findings need three fields to be actionable: **where**, **which heuristic**, and
**severity + why that severity**. A finding without a severity is an opinion.

> Independent evaluators find different problems. Nielsen's research showed ~5
> evaluators catch about 75% of issues; one evaluator catches far fewer. When it
> matters, get more than one pass — different people, or different agents with
> different lenses.

### Part 2 — Measurable outcomes (quantitative, whenever you can)

Heuristics predict problems; metrics prove them. The practical core trio, in
increasing order of effort:

| Metric | How | Bar |
|---|---|---|
| **Task success rate** | % who complete the task unaided | The one that matters most. Below ~78% signals a real problem; a critical path should be near 100%. |
| **Time on task** | median seconds for the core task | Judge against the previous version or a competitor — absolute numbers mean nothing alone. Watch the spread, not just the median. |
| **Error rate** | errors per task attempt, and % that self-recover | Unrecovered errors are severity 3–4 by definition. |
| **SEQ** (Single Ease Question) | "Overall, how difficult was that task?" 1–7, asked right after | Cheap, one question, catches perceived friction. |
| **SUS** | 10-item questionnaire, scored 0–100 | See thresholds below. Use for benchmarking over time, not for diagnosis. |

**SUS interpretation** — the numbers people get wrong. SUS is *not* a percentage:

| Score | Grade | Meaning |
|---|---|---|
| ≥ 80.3 | A | Top ~10%. Users are likely to recommend it. |
| 74 | B− | ~70th percentile |
| 68 | C | **The industry average** — exactly middling |
| 51–67 | D | Below average, real problems |
| < 51 | F | Bottom ~15% |

### The verdict rule

Combine them like this, and say which rule fired:

- **Any severity-4 finding → bad UX.** No metric rescues a flow that can't be completed or loses data.
- **Severity-3 findings on the critical path → not shippable** until fixed, regardless of average satisfaction.
- **Task success below ~78% on a core task → bad**, even if it looks clean and scores well subjectively.
- **SUS < 68 → below average**; treat as a problem to explain, not a number to celebrate.
- **Good** = no 3s or 4s on the critical path, task success high, and the metrics trending the right way over time.

Single data points are close to meaningless. Trends are the signal.

---

## Choosing what to measure: HEART

For a product-level view rather than a single flow, use Google's **HEART**
framework — pick only the dimensions that fit the decision you're making:

| | Measures | Example signals |
|---|---|---|
| **H**appiness | attitudes | SUS, SEQ, satisfaction, NPS |
| **E**ngagement | voluntary depth of use | session depth, frequency, actions per session |
| **A**doption | new usage | sign-ups, first-time feature use |
| **R**etention | returning over time | week-4 return rate, churn |
| **T**ask success | efficiency + effectiveness | completion rate, time on task, error rate |

Derive each with **Goals → Signals → Metrics**: state the goal, decide what
behavior would signal success or failure, then pick the metric that captures it.
Metrics chosen without that chain measure whatever is easy to log.

Keep a dashboard to **6–8 metrics**, mixing behavioral, attitudinal, and business.
More than that is noise.

Engagement is not automatically good: more time on task can mean confusion, and
more sessions can mean people can't find things. Pair every engagement metric with
a task-success one.

---

## Laws that predict problems before you test

These are behavioral regularities, not preferences. Use them to find likely
severity-3s during design review.

- **Hick's Law** — decision time grows with the number of choices. Long flat menus and 12-option settings screens are slow by construction. Reduce, group, or default.
- **Fitts's Law** — acquisition time depends on target size and distance. Small or far targets are slow and error-prone; make the primary action big and near where attention already is. In keyboard UIs the analogue is keystrokes-to-target.
- **Miller's Law** — working memory holds roughly 7±2 chunks. Anything requiring users to hold more than a handful of items in mind will fail. Chunk it, or show it.
- **Jakob's Law** — users spend most of their time in *other* products, and expect yours to work the same way. Novel interaction patterns carry a real cost that must be earned.
- **Doherty Threshold** — interaction stays fluid when the system responds within ~400ms. Past that, attention drifts. If you can't be fast, acknowledge immediately and show progress.
- **Postel's Law** — be liberal in what you accept, strict in what you emit. Accept messy input (whitespace, formats, casing) and normalize it rather than rejecting it.
- **Peak–End Rule** — people judge an experience by its most intense moment and its ending. Invest in error moments and completion states.

---

## Principles that hold in any style

**Make state obvious.** Every screen answers: where am I, what happened, what can I do next. Loading, empty, partial, error, and success are five distinct states — design all five, not just the happy one.

**Prevent, don't scold.** Disable or constrain impossible actions. Validate as the user goes, not on submit. Reserve confirmation for genuinely destructive, irreversible actions — and scale friction to consequence: trivial → just undo; serious → confirm; catastrophic → require typing the name.

**Make everything reversible you can.** Undo beats confirmation. A user who knows they can back out explores; one who doesn't, stalls.

**Write errors that fix things.** A good error names what went wrong, in the user's terms, and gives the next action. "Invalid input" fails all three. Put the most important part last — that's where the eye lands.

**Defaults are the design.** Most users never change a setting. A preference is an admission you couldn't decide; each one adds a decision for every user.

**Progressive disclosure.** Show the common path; keep the rest one deliberate step away. This is how you serve novices and experts without two products.

**Respect attention.** Every badge, tooltip, animation, and modal spends a limited budget. Interruptions must be worth more than what they interrupt.

**Accessibility is usability.** Keyboard reachability, sufficient contrast, meaningful labels, and not encoding meaning in color alone are correctness requirements, not a separate track. If it only works with a mouse and perfect vision, it's broken.

---

## Common failure patterns

| Pattern | Why it's bad | Fix |
|---|---|---|
| Only the happy path designed | Real use is mostly edge cases | Design loading/empty/partial/error explicitly |
| Error messages that state the error code | User can't act | Name cause + next action in their words |
| Confirmation dialogs everywhere | Trained to click through; real warnings ignored | Undo by default; confirm only the irreversible |
| Settings instead of decisions | Pushes design work onto the user | Pick a good default; remove the toggle |
| Novel interaction "because it's cleaner" | Violates Jakob's Law; users must relearn | Use the convention unless the gain is large and demonstrated |
| Hidden system state | User can't form a mental model | Show status, progress, and what changed |
| Success with no feedback | Did it work? User repeats the action | Confirm what happened and what's next |
| Metrics without a goal chain | Measures the easy thing | Goals → Signals → Metrics |
| "It tested fine with the team" | Team knows the model | Test with someone who has never seen it |

---

## Producing a review

When asked to evaluate a UX, produce:

1. **Verdict** — good / needs work / not shippable, and which verdict rule fired.
2. **Findings table** — where · heuristic · severity · why that severity · fix.
   Sorted by severity, highest first.
3. **What's working** — genuinely, so it doesn't get refactored away.
4. **What to measure next** — the one or two metrics that would confirm or refute
   the biggest finding.

Be concrete about *where*. "The onboarding is confusing" is not a finding; "Step 3
asks for a workspace URL before explaining what a workspace is — heuristic 6,
severity 3" is.

Deeper material: `references/heuristic-audit.md` (running an audit, full checklist,
severity calibration), `references/metrics.md` (SUS scoring procedure, HEART
worked example, sample sizes, benchmarks).
