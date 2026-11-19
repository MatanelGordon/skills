# Perception-first lens

Read this reference only when perception or decision psychology materially
changes the work. It is a bounded lens inside Impeccable Lite, not a second
default workflow.

This reference is an original compact adaptation informed by
Perception-First Design™ by Stefan Kovalik / Aurochs, pinned during adaptation
to upstream commit `1704ff61c18872a66d969e860c9b6e45a8f50f16`. It is licensed
CC BY-SA 4.0; see `../ATTRIBUTION.txt`. No upstream prose, corpus, commands, or
learning logs are vendored here, and no substantive passage is copied verbatim.

## Routing

Use the lens when the user explicitly asks for PFD/perception-first reasoning,
or when the deciding question is one of these:

- Is the surface overloading attention before the task can begin?
- Does the first view create the wrong category, quality, safety, or relevance
  judgment?
- Does inconsistency make the experience feel harder or less trustworthy than
  its functional metrics suggest?
- Do observed choices conflict with stated preferences or internal opinion?
- Is the path to the user's next decision unclear, effortful, or coercive?

Do not use it merely because a task is visual. Skip it for routine polish,
pixel-precise implementation, a small component fix, or work already explained
by ordinary hierarchy, accessibility, responsive, or interaction defects.

Choose the contract that matches the request:

- **Evaluate:** diagnose an existing artifact. Findings and fixes are allowed.
- **Derive:** turn an open design problem into constraints before proposing a
  direction.
- **Analyze:** explain a mechanism, trade-off, or hypothetical. Stay descriptive
  unless the user also asks for a recommendation.

## Five dependent gates

Inspect bottom-up. A lower gate can prevent evidence at a higher gate from ever
being perceived, but do not force a finding at every gate.

### 0. Cognitive bandwidth

Ask what the person must notice, remember, compare, or decide at once. Separate
task complexity from complexity imposed by the interface.

Look for competing focal points, ungrouped choices, hidden context, long forms,
unexplained state, or background inconsistency that consumes attention. Prefer
chunking, progressive disclosure, stable context, and useful defaults when they
serve the task.

Density is not automatically overload. Expert tools may need many visible
controls because hiding them would increase memory and navigation costs.

### 1. First-impression framing

Ask what the opening communicates before close reading: what this is, who it is
for, whether it appears credible, and what deserves attention first.

Look for category confusion, quality that contradicts positioning, uncanny or
placeholder material, an opening with no dominant proposition, or a mood that
obscures the actual job.

Do not require a marketing hero, trust badges, or an above-the-fold CTA on an
operate, read, or experience surface. Judge the first view by its real job.

### 2. Felt fluency

Ask whether the surface feels coherent and predictable, not merely whether it
passes automated metrics.

Look for inconsistent grouping, near-duplicate styles, shifting terminology,
unsteady spacing, competing component languages, copy that fights the visual
tone, or controls whose behavior violates the pattern established nearby.

Consistency supports trust, but it is not sameness. Deliberate contrast may
clarify hierarchy or state; accidental variation creates noise.

### 3. Perception and behavior

Ask whether decisions are being driven by the evidence of actual behavior or
by internal preference and post-hoc explanation.

Distinguish observed behavior, user testimony, analytics, and team hypothesis.
Do not invent analytics or assume a cognitive bias explains a result. When the
evidence is absent, state the hypothesis and name what observation would
confirm or falsify it.

Trust is partly produced by the experience itself. Fix obvious incoherence or
broken promises before adding argumentative copy intended to overcome distrust.

### 4. Decision architecture

Ask whether the environment makes the user's appropriate next choice easy to
understand and carry out.

Look for weak information scent, generic control labels, unclear consequences,
missing back paths, competing primary actions, premature commitment, or a
journey that helps the business while obstructing the user.

The right choice is the one aligned with the user's informed goal. Never use
the lens to justify hidden costs, false scarcity, forced continuity, deceptive
defaults, or other dark patterns.

## Apply without adding ceremony

### Evaluation

Scan all five gates, then report only material findings. Start with the lowest
failing gate. For each finding give the local evidence, perceptual mechanism,
user impact, and one specific fix. Use Impeccable Lite's blocking/major/minor
severity vocabulary; do not manufacture a numeric score.

### Derivation

Before choosing a visual solution:

1. State the user's real goal and the obstacle in experiential terms.
2. Scan each gate and write only the constraints that the evidence supports.
3. Resolve conflicts among lens-derived constraints in favor of the lower
   gate. Then reapply Impeccable Lite's precedence: the explicit brief, product
   truth, accessibility, local-only boundary, surface mode, and requested scope
   outrank the lens. Report a tension instead of silently overriding them.
4. Choose the smallest coherent direction satisfying the accumulated
   constraints.

Do this only for a genuinely open or consequential problem. A small refinement
does not earn five-layer ceremony.

### Analysis

Trace what changes at each relevant gate, including bidirectional effects.
Check whether consequences differ by user experience, accessibility needs,
device, culture or target population, adjacent workflows, or time horizon.
Do not universalize first-impression or behavioral priors across regions without
evidence from the intended population. Keep explanation separate from
recommendation and label unsupported predictions as hypotheses.

## Precedence and conflict resolution

| Tension | Resolution inside Impeccable Lite |
|---|---|
| PFD can trigger on almost any communication task | This lens inherits Impeccable Lite's user-interface scope and narrow routing above. |
| PFD derivation analyzes every layer before proposing a solution | Use that depth only for open, consequential problems; routine work stays direct. |
| PFD promotes repeated Ralph loops and persistent insight logs | Do neither. Keep one inspection, one fix batch, and at most one confirmation; create no process files. |
| PFD audits may use large corpora, live URLs, and citations | Stay local and offline. Do not load a corpus, browse, or invent citations. Ask separately if sourced research is required. |
| PFD heuristics can favor sparse conversion paths | Surface mode wins: expert tools may be dense, reading surfaces may have no CTA, and experiences may invite exploration. |
| PFD scoring uses numerical layer ratings | Use evidence and severity; avoid false precision. |
| Persuasion can optimize business action | Product truth, informed user goals, accessibility, and anti-manipulation constraints win. |

## Stop condition

The lens is complete when it has changed a concrete constraint, finding, or
decision. If it only restates existing visual guidance, omit it from the answer
and continue with the ordinary Impeccable Lite workflow.
