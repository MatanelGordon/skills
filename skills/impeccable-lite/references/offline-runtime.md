# Offline runtime

Read this reference only after explicit runtime opt-in for a locally servable
HTML artifact. The runtime adds resumable state, handoffs, static checks, and
captured evidence; ordinary design rules still govern the work.

## Guarantees

- Workflow state, packets, audit, and preview use Node.js 18+ built-ins only.
  Screenshot capture delegates to the repository's narrow `browser-capture`
  companion: an isolated Node.js 22.12+ package with exact-pinned
  `puppeteer-core`. The skill never invokes a package manager. Provisioning the
  companion is a one-time operator action outside an invoked design task.
- There is no Docker image, bundled browser, catalog, API key, updater,
  telemetry, hook, model subprocess, or public-web browsing command.
- All project artifacts and persistent outputs stay under the declared project
  root, with physical symlink checks. Chromium's temporary profile uses the
  system temp directory and is deleted before evidence is published.
- Preview is foreground-only on `127.0.0.1`. It refuses dotfiles,
  `node_modules`, directory listings, symlink escapes, and foreign Host values.
- Capture uses an already-installed standard Chrome channel. Puppeteer request
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

In a registry checkout, an operator can provision and verify the optional
companion once:

```text
npm run setup:browser-capture
node tools/browser-capture/launcher.mjs doctor
```

The launcher finds a compatible local Node runtime without changing the
machine's default. Impeccable first checks `BROWSER_CAPTURE_CLI` for an absolute
launcher path, then the repository-relative tool, then `browser-capture` on
`PATH`. This keeps symlink installs automatic and gives managed copies an
explicit, portable override. Missing capture tooling never disables audit.

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
brief → direction → build → audit → complete
                    ↑       ↓
                    └───────┘
```

The CLI validates audit, capture, and completion evidence. Direction and build
remain human decisions recorded as notes. A minimal progression is:

```text
node <skill-dir>/scripts/impeccable-lite.mjs advance --to direction --note "Direction: field guide."
node <skill-dir>/scripts/impeccable-lite.mjs advance --to build
node <skill-dir>/scripts/impeccable-lite.mjs audit
node <skill-dir>/scripts/impeccable-lite.mjs advance --to audit --evidence .impeccable-lite/reports/audit.json
```

If delegating the build, add `--owned index.html --owned styles.css` to the
direction transition before generating its packet. Existing ownership paths
and ancestors are physically checked for symlinks; new paths must remain below
the project root.

The artifact may be absent through direction selection, but must exist before
`build → audit`. `audit` may return exit code 1 for material findings; that is a
useful gate, not a runtime crash. `build → audit` requires a passing audit
report. `audit → complete` requires that current audit, a valid `capture.json`
manifest and its desktop/mobile PNG evidence from one generation, and a local
reviewer-return file that follows the strict ship contract. A non-ship review
returns `audit → build` for a bounded revision.
Invocation or containment errors return non-zero with a clear message. State
changes are locked and published atomically. Audit inputs, the captured artifact,
every same-origin resource actually served during capture, and both PNGs are
content-hashed; changing them invalidates the gate instead of silently reusing
stale proof. The gate recomputes the current audit rather than trusting editable
report fields. These are honest-process and staleness checks inside a writable
project, not tamper-proof attestations or proof of who created a file. Version 2
sessions load automatically; a legacy `review` phase resumes at the version 3
`audit` boundary.

## Prompt packets and role routing

Generate a packet, then pass its text to an isolated agent only when the role
earns fresh context:

```text
node <skill-dir>/scripts/impeccable-lite.mjs packet --role direction
node <skill-dir>/scripts/impeccable-lite.mjs packet --role builder --out .impeccable-lite/packets/builder.md
node <skill-dir>/scripts/impeccable-lite.mjs packet --role reviewer --audit .impeccable-lite/reports/audit.json --evidence <capture-generation>/desktop.png --evidence <capture-generation>/mobile.png --evidence <capture-generation>/capture.json
```

- **Direction explorer:** optional and read-only for open-ended work.
- **Builder:** optional; when used, it is the only writer and follows the
  structured ownership recorded by `advance --to direction --owned <path>`.
- **Finish reviewer:** fresh and read-only; required only to complete the full
  state machine after audit and captures. Without one, use standalone audit and
  capture and report the workflow as not independently completed.

The script never spawns these agents. The host remains responsible for explicit
delegation, one-writer ownership, collecting the response, and deciding whether
to revise. The runtime binds a response to a session and capture generation but
cannot attest that a separate agent authored it. Never simulate several agents
in one context.

## Audit, preview, and capture

Run the static audit against the brief's artifact:

```text
node <skill-dir>/scripts/impeccable-lite.mjs audit
```

It writes JSON and Markdown reports under `.impeccable-lite/reports/`. It checks
the HTML plus directly referenced, same-root scripts and stylesheets for remote
dependencies and network calls. Document semantics, names, labels, duplicate
IDs, focus/reduced-motion rules, and obvious fixed-width risks are
heuristics on the HTML and directly linked CSS sources. This is not visual,
WCAG, CSS, or JavaScript proof.

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
an isolated `.impeccable-lite/evidence/capture-<uuid>/` generation. Overflow
or a blocked request publishes a diagnostic generation with `ok: false`; it
cannot pass the completion gate. Rendering, cleanup, or publication failures
publish nothing, so reviewers cannot receive mixed evidence from two runs.
Before publication Puppeteer closes Chrome, the runtime closes its ephemeral
server, and the temporary browser profile is deleted. It sets the real CSS
viewport through Puppeteer and returns non-zero for a
diagnostic generation. Use only the paths returned by that run. Inspect both
images together, apply at most one material fix batch, recapture once when
warranted, and stop.

If the reviewer requests a fix, advance back to build:

```text
node <skill-dir>/scripts/impeccable-lite.mjs advance --to build --note "Reviewer requested one hierarchy fix."
```

After a valid ship return, close the flow with the exact evidence the reviewer
saw:

```text
node <skill-dir>/scripts/impeccable-lite.mjs advance --to complete --evidence .impeccable-lite/reports/audit.json --evidence <capture-generation>/desktop.png --evidence <capture-generation>/mobile.png --evidence <capture-generation>/capture.json --review reviewer-return.md
```

The reviewer packet prints the two session-binding values to copy. The return file
must contain exactly these five fields, with no additional prose:

```text
disposition: ship
material_findings: none
keep: <one concrete strength to preserve>
session_id: <exact session UUID from the packet>
evidence_generation: <exact capture generation from the packet>
```

## Failure handling

- If Node is missing or below 18, use the skill without its runtime. If only
  the Node 22.12+ capture runtime is missing, keep audit and preview.
- If the companion or Chrome is missing, keep the audit and inspect through an
  already-open local browser or the host's local image tools; do not install a
  package or browser during the design task.
- If audit finds a remote reference, remove or localize it. Do not weaken the
  rule merely to make the report green.
- If capture fails operationally, report capture as unverified. If it publishes
  `ok: false`, use it only to diagnose the blocked request or overflow. Never
  treat static audit as visual evidence.
- If a reviewer intends to ship but violates the five-line ship contract, do
  not normalize it silently. Ask that same reviewer to recast the existing
  judgment without re-reviewing or changing findings.
- If a reviewer says `recapture`, repair the evidence before interpreting its
  design verdict. If it says `fix` or `rebuild`, return to `build` explicitly.
- A hard crash during stale-lock recovery may leave the exact
  `<state-path>.lock.recovery` file behind. The runtime fails closed. After
  confirming no Impeccable Lite process is active, remove only that named file
  and retry; never delete the surrounding state directory.
