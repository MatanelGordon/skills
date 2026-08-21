# Running a heuristic audit

## Procedure

1. **Define the scope and the tasks.** An audit without tasks drifts into opinion.
   Write 3–6 concrete tasks a real user would attempt ("add a teammate and give
   them read-only access"). Audit those paths.
2. **Walk each task twice.** First as a first-time user (does it explain itself?),
   then as a returning user (is it fast?). Different problems surface in each.
3. **Record every violation as you go** — where, heuristic, what you expected,
   what happened.
4. **Assign severity after the walk**, not during. Rating in the moment inflates
   whatever annoyed you most recently.
5. **Sort by severity and cut the list.** A 40-item audit gets ignored. Lead with
   every 4 and 3; group the 1s into one line.

Independent evaluators find substantially different problems — roughly five are
needed to surface ~75% of issues, and one finds far fewer. When it matters, run
multiple passes with different people (or agents given different lenses:
first-time user, power user, accessibility, error paths).

## Severity calibration

Severity = **frequency × impact × persistence**.

- **Frequency** — does every user hit it, or only in a rare branch?
- **Impact** — a moment of confusion, or a blocked task / lost data?
- **Persistence** — does it stop biting once learned, or every single time?

Calibration examples:

| Finding | Severity | Reasoning |
|---|---|---|
| Delete removes data with no undo and no confirm | 4 | Irreversible loss, unrecoverable |
| Checkout fails silently on invalid postcode | 4 | Core task cannot complete; no feedback |
| Primary action label doesn't match the page's noun | 3 | Every user, every time, causes hesitation |
| Required field's format only revealed on submit error | 3 | High frequency, forces retry loop |
| Settings grouped unintuitively | 2 | Occasional, recoverable by scanning |
| Inconsistent capitalization in menu | 1 | Cosmetic |
| Slightly non-standard icon with a text label | 0–1 | Label carries the meaning |

Bias to a **higher** severity when the task is on the critical path, and when the
user cannot recover without outside help.

## Per-heuristic checklist

Concrete things to look for, phrased so a "no" is a finding.

**1. Visibility of system status**
- Is there feedback within ~400ms of every action?
- For operations over ~1s, is progress shown (and is it honest)?
- After a change, is it stated what changed?
- Can the user tell which mode/state/selection is active?

**2. Match with the real world**
- Are labels the user's vocabulary, not the database's?
- Do icons/metaphors mean the same thing outside this product?
- Is jargon defined at the point of use?
- Do sort/date/number formats match the user's locale expectations?

**3. User control and freedom**
- Is there an obvious cancel/back/undo from every state?
- Can a multi-step flow be exited without losing everything?
- Is anything irreversible without warning?
- Can the user stop a long operation?

**4. Consistency and standards**
- Same concept, same word, everywhere?
- Same action, same position and affordance across screens?
- Platform conventions honored (shortcuts, gestures, back behavior)?
- Do similar things look similar and different things look different?

**5. Error prevention**
- Are invalid options disabled rather than error-on-submit?
- Is input constrained where the valid set is known (picker over free text)?
- Are destructive actions separated from routine ones?
- Are defaults safe?
- Is input normalized (trimmed, case-insensitive) rather than rejected?

**6. Recognition rather than recall**
- Must the user remember anything from a previous screen?
- Are options visible or hidden behind memory of a command?
- Are previously entered values shown when relevant?
- Is the format/example visible *before* an error?

**7. Flexibility and efficiency**
- Are there shortcuts for repeat use, discoverable but not in the way?
- Can bulk actions be done in bulk?
- Are sensible defaults pre-filled?
- Can the common case be completed without touching optional settings?

**8. Aesthetic and minimalist design**
- Can anything be removed without loss? Remove it.
- Does the primary action stand out from the secondary ones?
- Is any content repeated?
- Is there more than one thing competing for "most important"?

**9. Error recovery**
- Does each message say what happened, why, and what to do?
- Is it in plain language, free of codes and stack traces?
- Is the fix actionable from where the message appears?
- Is the user's input preserved after the error?

**10. Help and documentation**
- Is help available where the task happens, not only in a separate manual?
- Is it task-oriented ("how to invite a teammate") rather than feature-oriented?
- Are there concrete examples?
- Is it findable by searching what the user would actually type?

## Beyond the ten

Heuristics miss whole categories. Explicitly also check:

- **Information architecture** — do the groupings match how users think about the
  domain, or how the codebase is organized?
- **Content quality** — most "UX problems" are wording problems. Read every string
  aloud.
- **Accessibility** — keyboard-only traversal, contrast, labels, no
  meaning-by-color-alone, respects reduced-motion.
- **First-run and empty states** — the state every user sees first is often the
  least designed.
- **Failure and degraded modes** — offline, slow network, partial data, expired
  session, permission denied.
- **Business goals** — an interface that is pleasant and doesn't accomplish the
  product's purpose is still failing.

## Output format

```markdown
## Verdict
Not shippable — 2 severity-4 findings on the checkout path. [rule: any severity-4]

## Findings
| # | Where | Heuristic | Sev | Problem | Fix |
|---|---|---|---|---|---|
| 1 | Checkout step 3 | 5 Error prevention | 4 | Invalid postcode silently drops the order | Validate inline; block submit; preserve entry |
| 2 | Account delete | 3 Control & freedom | 4 | No confirm, no undo, immediate | Require typing the account name; 30-day soft delete |
| 3 | Invite flow | 6 Recognition | 3 | Role names never explained; user must guess | Inline one-line description per role |

## Working well
- Status is visible throughout the upload flow, including honest progress.

## Measure next
- Task success rate on "complete a purchase" — expect the postcode bug to show as
  a completion cliff. If it's above 95%, finding #1 is rarer than it looks.
```
