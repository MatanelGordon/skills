# Offline runtime

Read this reference only for a multi-stage design task that benefits from
resumable state, a handoff, static checks, or captured evidence. The skill's
ordinary design rules still govern the work; the runtime only keeps the work
bounded and inspectable.

## Guarantees

- Node.js 18+ built-ins only; no package manager, Docker image, binary bundle,
  catalog, API key, updater, telemetry, hook, or model subprocess.
- All inputs and outputs are contained by the declared project root, including
  physical symlink checks for files that are read or served.
- Preview is foreground-only on `127.0.0.1`. It refuses dotfiles,
  `node_modules`, directory listings, symlink escapes, and foreign Host values.
- Capture uses an already-installed Chromium browser. Chrome request
  interception, a strict self-only preview policy, a dead loopback proxy, and
  DNS rules allow only the exact ephemeral preview origin. Missing Chrome
  disables capture, not audit.
- Static audit is conservative lint, not a claim of visual or WCAG compliance.

Resolve this skill's installed directory and use these checked-in entrypoints:

```text
node <skill-dir>/scripts/impeccable-lite.mjs <command>
node <skill-dir>/scripts/serve.mjs <site-root>
```

Run `doctor` first only when runtime availability is uncertain.

## Brief and state

Create a small local JSON brief. Do not copy the user's whole conversation or
secrets into it.

```json
{
  "goal": "Help visitors choose a workshop.",
  "audience": "Independent creative professionals",
  "artifact": "index.html",
  "mode": "persuade",
  "scope": "new",
  "thesis": "A typographic field guide with one electric signal.",
  "hierarchy": "Promise, proof, workshop choice.",
  "constraints": ["No external assets", "Keyboard accessible"]
}
```

Initialize from the target project root:

```text
node <skill-dir>/scripts/impeccable-lite.mjs init --brief brief.json
node <skill-dir>/scripts/impeccable-lite.mjs status
```

The default state is `.impeccable-lite/session.json`. Phases are:

```text
brief → direction → build → audit → review → complete
                                ↘ build ↗
```

The CLI enforces evidence gates; a phase cannot merely claim work that does not
exist. A minimal progression is:

```text
node <skill-dir>/scripts/impeccable-lite.mjs advance --to direction --note "Selected the field-guide direction."
node <skill-dir>/scripts/impeccable-lite.mjs advance --to build
node <skill-dir>/scripts/impeccable-lite.mjs audit
node <skill-dir>/scripts/impeccable-lite.mjs advance --to audit --evidence .impeccable-lite/reports/audit.json
```

`audit` may return exit code 1 for material findings; that is a useful gate, not
a runtime crash. `build → audit` requires a passing audit report;
`audit → review` additionally requires a valid `capture.json` manifest and its
desktop and mobile PNG evidence from the same generation; `review → complete`
requires a local reviewer-return file that follows the strict ship contract.
Invocation or containment errors return non-zero with a clear message. State
changes are locked and published atomically. Audit inputs, the captured artifact,
every same-origin resource actually served during capture, and both PNGs are
SHA-256 bound to their evidence; changing them invalidates the gate instead of
silently reusing stale proof.

## Prompt packets and role routing

Generate a packet, then pass its text to an isolated agent only when the role
earns fresh context:

```text
node <skill-dir>/scripts/impeccable-lite.mjs packet --role direction
node <skill-dir>/scripts/impeccable-lite.mjs packet --role builder --out .impeccable-lite/packets/builder.md
node <skill-dir>/scripts/impeccable-lite.mjs packet --role reviewer --audit .impeccable-lite/reports/audit.json --evidence <capture-generation>/desktop.png --evidence <capture-generation>/mobile.png --evidence <capture-generation>/capture.json
```

- **Direction explorer:** read-only; useful for an open-ended direction round.
- **Builder:** the only writer; useful only when ownership is isolated and the
  parent is not already implementing.
- **Finish reviewer:** fresh and read-only; useful for a new surface or material
  redesign after audit and captures exist.

The script never spawns these agents. The host remains responsible for explicit
delegation, one-writer ownership, collecting the response, and deciding whether
to revise. Never simulate several agents in one context.

## Audit, preview, and capture

Run the static audit against the brief's artifact:

```text
node <skill-dir>/scripts/impeccable-lite.mjs audit
```

It writes JSON and Markdown reports under `.impeccable-lite/reports/`. It checks
the HTML plus directly referenced, same-root local scripts and stylesheets for
remote dependencies and script calls. It also checks basic document semantics,
names and labels, duplicate IDs, focus visibility, reduced motion, and obvious
fixed-width overflow risks. This remains bounded heuristic analysis, not a
general JavaScript proof.

For manual inspection, either keep a foreground server open:

```text
node <skill-dir>/scripts/serve.mjs .
```

or capture both standard viewports in one bounded run:

```text
node <skill-dir>/scripts/impeccable-lite.mjs capture
```

Capture prints a JSON result containing `reportPath` and the exact capture
paths. It publishes `desktop.png`, `mobile.png`, and `capture.json` together in
an immutable `.impeccable-lite/evidence/capture-<uuid>/` generation; a failed
run publishes nothing, so reviewers cannot receive mixed evidence from two
runs. Before publication it stops the direct Chromium process, closes its
ephemeral server, and deletes its temporary browser profile; cleanup failure
keeps the generation unpublished. It sets the real CSS viewport through
Chrome's local debugging pipe, reports horizontal overflow and blocked
requests, and returns non-zero when either exists. Use only the paths returned
by that run. Inspect both images together, apply at most one material fix batch,
recapture once when warranted, and stop.

After a valid reviewer return, close the flow explicitly:

```text
node <skill-dir>/scripts/impeccable-lite.mjs advance --to review --evidence .impeccable-lite/reports/audit.json --evidence <capture-generation>/desktop.png --evidence <capture-generation>/mobile.png --evidence <capture-generation>/capture.json
node <skill-dir>/scripts/impeccable-lite.mjs advance --to complete --review reviewer-return.md
```

The reviewer packet prints the two provenance values to copy. The return file
must contain exactly these five fields, with no additional prose:

```text
disposition: ship
material_findings: none
keep: <one concrete strength to preserve>
session_id: <exact session UUID from the packet>
evidence_generation: <exact capture generation from the packet>
```

## Failure handling

- If Node is missing or below 18, use the skill without its runtime.
- If Chromium is missing, keep the audit and inspect through an already-open
  local browser or the host's local image tools; do not install a browser.
- If audit finds a remote reference, remove or localize it. Do not weaken the
  rule merely to make the report green.
- If capture fails, report capture as unverified. Never treat static audit as
  visual evidence.
- If a reviewer violates the return contract, do not interpret or normalize it
  silently. Ask that same reviewer to recast the existing judgment into the
  required fields without re-reviewing, changing findings, or adding prose.
- If a reviewer says `recapture`, repair the evidence before interpreting its
  design verdict. If it says `fix` or `rebuild`, return to `build` explicitly.
