---
name: impeccable-lite
description: >
  Design, redesign, critique, or polish user-facing interfaces when visual judgment is central. Use for web pages, app screens, components, documentation sites, and frontend UX that needs stronger hierarchy, typography, layout, color, motion, accessibility, responsiveness, perception, or finish. Do not use for backend work, function-only frontend changes, exact implementation with no design judgment, or non-interface documents.
license: "MIT; references/perception-first-lens.md is CC BY-SA 4.0"
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  inspired_by: https://github.com/pbakaus/impeccable
  requires: Node.js 18+ for the optional offline runtime; local Chromium is optional for screenshots
---

# Impeccable Lite

Make interfaces feel deliberate, distinctive, and finished without turning a
design task into a framework. Work from the user's brief and the product already
in front of you. Use ordinary repository tools and existing local capabilities.

## Local-only boundary

This skill grants no external-access authority. Work from local project files
and capabilities already in scope. A separate explicit user request may
authorize an external tool, but that action is outside this skill and does not
weaken its offline runtime.

- Do not browse, fetch remote pages, call catalogs, send telemetry, or run an
  updater.
- Do not install packages, download fonts or images, start an external service,
  or add hooks. A foreground preview may bind only to `127.0.0.1`.
- Existing local files, local development servers, installed tools, and local
  browser automation are allowed when already within the task's scope. Capture
  uses an already-installed Chromium browser and blocks external traffic; it
  never downloads a browser.
- If required material exists only remotely, ask the user to provide a local
  copy or explicitly authorize that separate access.

Do not create `PRODUCT.md`, `DESIGN.md`, a design system, or persistent process
files unless the user asks. The only exception is `.impeccable-lite/` state
after explicit runtime opt-in. Do not spawn subagents merely because a task is
visual.

## Use the offline runtime only when it earns its state

Work directly by default. Use the runtime only when the user explicitly wants
resumable state, evidence-gated handoffs, or locally bound screenshots for a
locally servable HTML artifact. Then read
[references/offline-runtime.md](references/offline-runtime.md). Standalone audit
and capture work without subagents; completing the full state machine requires
an independent reviewer.

Subagents are optional seams, not a default team:

- use a direction explorer only when the brief is genuinely open-ended;
- give edit ownership to one builder only;
- use a fresh, read-only reviewer when completing an opted-in runtime workflow
  for a meaningful redesign or new surface;
- stay solo for small, precise work or when the harness cannot isolate roles.

The packet is the role boundary, not a substitute for missing decisions. Record
the selected direction in the transition note and pass builder-owned files with
the runtime's structured `--owned` option. Do not send the whole skill or a
broad repository walk when the packet and named local files are sufficient.

## Load the perception lens only when it changes the decision

For an explicit Perception-First Design request, or when the task genuinely
depends on cognitive load, first impressions, felt fluency, trust formation,
stated-versus-observed behavior, or decision architecture, read
[references/perception-first-lens.md](references/perception-first-lens.md).

Do not load it for ordinary visual polish, a precise implementation request, or
as a second generic checklist. It is a diagnostic and derivation lens, not a
mandatory phase. The brief, product truth, accessibility, local-only boundary,
surface mode, and requested scope always outrank the lens.

## The working rule

**The brief wins.** Preserve explicit product truth, brand choices, content,
behavior, constraints, and requested aesthetics. Do not redirect a clear brief
toward your own taste.

Before editing, inspect the relevant implementation, real content, nearby
components, tokens, and available assets. For a precise request, then proceed
directly. For open-ended or whole-surface work, choose the smallest useful mode:

| Mode | Visitor success | Design priority |
|---|---|---|
| **Persuade** | Decide and act | Proof, attention, and a clear action |
| **Operate** | Complete a task | Scanability, states, speed, and control |
| **Read** | Understand | Structure, typography, and wayfinding |
| **Experience** | Explore the work | The artifact and its transitions lead |

Decide scope only when the request leaves it open:

- **Refinement:** preserve identity, behavior, and content; improve execution.
- **Redesign:** preserve product truth and function; replace the visual system
  only to the extent the user requested.
- **New surface in an existing product:** inherit the surrounding visual world.
  Do not turn one component or route into a rebrand.

If one missing answer would materially change the direction, ask one compact
question. Otherwise proceed from the brief and state any consequential
assumption.

## Set a direction before building

For open-ended or whole-surface work, write three short notes in conversation or
scratch context, not new project files:

1. **Goal:** what the user or visitor should accomplish.
2. **Visual thesis:** one sentence naming the composition, material, and energy.
3. **Hierarchy:** what dominates first, what supports it, and what action or
   information comes next.

Offer at most three genuinely different directions only when choosing among
directions would help.

## Build with commitment

One coherent idea should govern the whole surface. Do not combine several safe
styles into an average one.

- **Hierarchy:** give each viewport one dominant idea and an obvious reading
  order. The opening should demonstrate the product or task, not merely announce
  a mood.
- **Layout:** group related things tightly and separate unrelated things
  generously. Vary density intentionally. Do not use cards as the default
  container for every piece of content.
- **Typography:** use clear role and scale changes, comfortable body measure,
  and the real copy at every target width. Monospace is for code or data, not a
  shortcut to looking technical.
- **Color:** choose a strategy before choosing swatches. Use color for hierarchy,
  state, or material character; keep contrast accessible. Dark or light follows
  the actual use scene, not the product category.
- **Content and imagery:** specific content beats decorative chrome. Use local,
  attributable assets. Never invent customers, prices, benchmarks, capabilities,
  or other factual claims. Label illustrative data when it could be mistaken for
  reality.
- **Components:** controls name their action and expose hover, focus, disabled,
  loading, error, empty, and success states when those states exist.
- **Motion:** prefer one purposeful motion idea over scattered hover effects.
  Keep content visible by default and respect reduced-motion preferences.
- **Responsive behavior:** recompose for the available space instead of merely
  shrinking. Check real copy, long labels, empty states, and overflow.
- **Accessibility and performance:** preserve semantics, keyboard use, focus,
  contrast, readable targets, and working behavior. Visual ambition does not
  excuse regressions.

## Resist default AI styling

These are warnings, not universal bans. Use one only when the brief or product
earns it:

- repeated same-size icon cards as the page structure;
- nested cards or rounded rectangles around every region;
- a generic hero made from a large metric and supporting stats;
- excessive pills, badges, section numbers, or eyebrow labels;
- gradient text, decorative glass, arbitrary glow, or texture without meaning;
- emoji or random Unicode glyphs standing in for a coherent icon system;
- a serif, monospace, terminal, dashboard, or editorial costume chosen only
  because of the product category;
- many small animations replacing one meaningful interaction.

When a surface feels generic, do not add more decoration. Strengthen its
composition, content, type, imagery, or interaction thesis.

## Critique without rewriting

When the user asks only for a review, do not edit. Inspect the actual artifact
when available and report the smallest useful set of findings. For each finding,
give:

- severity (`blocking`, `major`, or `minor`);
- concrete evidence from the interface;
- the user impact;
- one specific fix.

Distinguish defects from taste. Do not manufacture findings to look thorough.

## Finish in bounded passes

Use existing local preview or test tools when available; do not install a new
stack just to inspect the result.

1. Inspect all relevant sizes and states together in one pass.
2. Check hierarchy, real copy, overflow, contrast, keyboard focus, interaction
   states, motion timing, console errors, and every explicit brief requirement.
3. Fix material issues in one batch.
4. Confirm once more when the fixes justify it, then stop.

Do not enter an open-ended polish loop. Report what was verified and what could
not be verified with the available local tools.

## Manual training

When the user explicitly asks to teach or update this skill, turn demonstrated
recurring failures into the smallest rule that would have prevented them. Update
or add a behavioral eval with the rule. Do not universalize a one-off taste or
copy a large upstream playbook back into this skill.

## Provenance

This is an independently written local skill. Its inspirations, licenses, and
the separately licensed perception reference are recorded in `ATTRIBUTION.txt`.
