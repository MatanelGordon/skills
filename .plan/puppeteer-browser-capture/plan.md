# Plan: CLI browser tooling and Puppeteer capture

**Status:** complete
**Created:** 2026-11-20   **Base branch:** main (`97c2ab3`)
**Branch:** `codex/cli-browser-capture`

## Goal

Give Claude Code, Codex CLI, and Copilot CLI a capability-adaptive browser
workflow without registering a browser MCP server, and replace Impeccable Lite's
hand-written Chrome/CDP launcher with a reusable local capture CLI powered by
pinned `puppeteer-core`. Success means the general `browser-interaction`
skill prefers native search/browser capabilities, routes CLI-only debugging to
the official `chrome-devtools` command when present, and Impeccable produces
its existing desktop/mobile hashed evidence through the new CLI with all
security and completion gates intact.

## Out of scope

- Installing a broad browser MCP into any harness or exposing its tool schemas
  in every model context.
- Reimplementing Chrome DevTools CLI, general web search, authenticated browser
  sessions, scraping, clicks, forms, or performance tooling.
- Allowing Impeccable Lite to browse the public web without a separate explicit
  user request; its runtime remains local-only.
- Bundling or downloading Chrome, Docker, an updater, telemetry, or a browser
  binary. Capture uses an already-installed standard Chrome channel or an
  explicit trusted executable path.
- Raising the repository installer or ordinary skills above Node 18. Browser
  tools use an isolated Node 22.12+ package because their fixed current
  dependencies require it.

## Background

Impeccable Lite introduced a built-ins-only capture runtime in `699e4ab` and
hardened evidence binding and workflow semantics in `e707f2d` and `033f92a`.
Its current `capture.mjs` is a bespoke CDP pipe client with a macOS/Linux path
list. The repository's `browser-interaction` skill already says to prefer an
existing browser capability over new automation.

Research found no high-adoption standalone Puppeteer `SKILL.md`. The two
relevant maintained tools are:

- Google Chrome's `chrome-devtools-mcp` project (58k+ stars), which ships a
  separate `chrome-devtools` terminal client and a CLI skill. It is
  Puppeteer-backed and cross-platform, but version 1.13.0 requires Node 20.19+
  and enables usage statistics, update checks, and CrUX integration by default.
  It therefore remains optional and must be pinned/hardened when installed.
- `dev-browser` (6.7k+ stars), which exposes real Puppeteer Page objects and a
  bundled skill, but downloads a compiled binary, is currently limited to
  macOS/glibc Linux, and makes no security-sandbox claim. It is not suitable as
  Impeccable's portable evidence dependency.

The archived `@modelcontextprotocol/server-puppeteer` is unmaintained and
explicitly rejected. There are no repository ADRs or memory entries constraining
this change. Baseline: `npm test` passes 35 tests and
`npm run test:impeccable-lite` passes 37 tests.

## Approach

### General browser work

Keep one original, vendor-neutral `browser-interaction` skill. It routes by
capability:

1. harness-native web search for fact/document retrieval;
2. harness-native browser/computer control for the user's real session;
3. the official `chrome-devtools` terminal client for CLI-only interaction,
   network/console/CSS/performance inspection, when already installed;
4. an explicit recommendation when none fits.

The upstream `chrome-devtools-cli` skill is referenced, not copied, so it does
not create a competing trigger or violate the registry's external-skill rule.
No package is added to the Node-18 repository dependency graph.

The supported optional CLI is exactly `chrome-devtools-mcp@1.13.0` on a Node
runtime satisfying its declared `^20.19.0 || ^22.12.0 || >=23` engine. The
skill treats any other or unverified installation as unavailable. A hardened
installation must set `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1` and
`CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`, start the background service with
`--performanceCrux=false`, `--isolated`, `--headless`, and an explicit
`--workspace=<project-root>`, and never use `@latest`. The skill does not stop,
reconfigure, or trust an already-running daemon whose startup policy it cannot
verify; it falls back to native harness capabilities or reports setup needed.

### Impeccable capture

Create a repository-level `browser-capture` executable with `capture`,
`serve`, and `doctor` commands. The shared engine uses exact-pinned
`puppeteer-core@25.18.1` in an isolated Node 22.12+ package and never downloads
Chrome. The repository root remains Node-18 compatible.
Puppeteer owns standard-channel discovery, process lifecycle, viewport
emulation, screenshots, and shutdown. Repository code retains the existing
loopback preview, exact-origin request interception, dead proxy/DNS defense,
resource and PNG hashing, overflow detection, isolated generations, cleanup,
and atomic publication.

Impeccable Lite keeps its public `capture`, `doctor`, and standalone
`serve.mjs` entrypoints. Capture and doctor are small compatibility adapters;
they resolve the general launcher from `BROWSER_CAPTURE_CLI`, the
repository-relative entrypoint, or `browser-capture` on PATH. The
Node-18-compatible launcher selects a local Node 22.12+ runtime from an
explicit override, the current runtime, common NVM/Volta locations, or PATH
without changing the machine default. A copied skill without the tool fails
with an actionable message; static audit remains available. `serve.mjs` keeps
its built-ins-only implementation so copied skills retain standalone preview
without the companion.

## Architecture

```text
CLI agent request
  |
  +-- factual lookup ------------------> native harness web search
  +-- real/session browser -----------> native harness browser control
  +-- CLI-only deep inspection -------> optional chrome-devtools command
  `-- deterministic local evidence ---> browser-capture CLI
                                           |
                                           +-- Puppeteer Core + installed Chrome
                                           +-- hardened loopback preview
                                           `-- PNGs + capture.json
                                                      |
                                                      `--> Impeccable gate
```

The capture manifest remains backward-compatible and adds
`schemaVersion: 1`, `producer: "browser-capture"`, and `browserVersion`.
Default general output is `.browser-capture/evidence`; the Impeccable adapter
preserves `.impeccable-lite/evidence`.

General CLI contract:

```text
browser-capture capture [--root <dir>] [--entry <relative-html>]
  [--out <relative-dir>] [--browser <absolute-executable>]
  [--timeout <1000-120000>] [--viewport <name:width:height> ...]
browser-capture serve [--root <dir>] [--port <1-65535>]
browser-capture doctor [--browser <absolute-executable>] [--json true]
```

- `capture` defaults to root `.`, entry `index.html`, output
  `.browser-capture/evidence`, timeout 30000, and desktop 1440x1000 plus mobile
  390x844. It prints one JSON manifest to stdout; exit 0 means `ok: true`, exit
  1 means a diagnostic generation was published, and exit 64 means arguments
  or operation failed before valid publication.
- `serve` defaults to root `.`, port `BROWSER_CAPTURE_PORT` or 4173, prints the
  loopback origin once, remains in the foreground, and exits 0 on SIGINT/SIGTERM
  or 64 on invalid input/startup failure.
- `doctor` prints plain text or JSON with `node`, `compatible`, `browser`,
  `browserVersion`, `dependencies`, and `network`; missing Chrome is reported
  but exits 0 because audit/serve remain usable, while incompatible Node exits 1.
- Impeccable's standalone `serve.mjs` retains its existing positional root,
  built-ins-only server, and `IMPECCABLE_LITE_PORT` environment contract so a
  copied skill can preview and audit even when the companion is unavailable.

## File map

| Path | Change | Phase | Owner |
|---|---|---|---|
| `.gitignore` | track this plan and verification record only | 0 | root |
| `.plan/puppeteer-browser-capture/plan.md` | approved execution record | 0-3 | root |
| `.plan/puppeteer-browser-capture/verification.md` | persisted demo evidence and disposition | 3 | root |
| `.adr/0001-cli-browser-and-local-capture.md` | record capability routing and narrow capture boundary | 1 | root |
| `package.json` | add browser-tool setup/test scripts and packaged tool files; patch release | 1, 3 | root |
| `package-lock.json` | align root release metadata without browser dependencies | 1, 3 | root |
| `install/package.test.mjs` | assert tool entrypoints ship | 1 | root |
| `install/validate.mjs` | syntax-check repository-level tool scripts | 1 | root |
| `tools/browser-capture/package.json` | isolated Node-22 runtime and exact Puppeteer dependency | 1 | root |
| `tools/browser-capture/npm-shrinkwrap.json` | ship and enforce the isolated browser dependency graph | 1 | root |
| `tools/browser-capture/README.md` | setup, command, and offline boundary | 2 | root |
| `tools/browser-capture/launcher.mjs` | Node-18-compatible runtime selection and CLI delegation | 2 | root |
| `tools/browser-capture/lib/contract.mjs` | CLI options, viewport bounds, manifest constants | 1 | root |
| `tools/browser-capture/lib/filesystem.mjs` | path/output containment | 2 | root |
| `tools/browser-capture/lib/static-server.mjs` | hardened loopback server | 2 | root |
| `tools/browser-capture/lib/capture.mjs` | Puppeteer engine and atomic publication | 2 | root |
| `tools/browser-capture/cli.mjs` | capture/serve/doctor commands | 2 | root |
| `tools/browser-capture/launcher.mjs` | Node-18-compatible discovery and handoff to isolated runtime | 2 | root |
| `tools/browser-capture/test.mjs` | run the isolated suite through the compatible runtime | 3 | root |
| `tools/browser-capture/README.md` | setup, contract, and security boundary | 2 | root |
| `tools/browser-capture/tests/contract.test.mjs` | red-first pure contract tests | 1 | root |
| `tools/browser-capture/tests/capture.test.mjs` | red-first real-browser/security tests | 1 | root |
| `tools/browser-capture/tests/cli.test.mjs` | red-first CLI and compatibility tests | 1 | root |
| `tools/browser-capture/tests/server.test.mjs` | loopback, private-path, host, CSP, and hashing tests | 2 | root |
| `tools/browser-capture/tests/fixtures/**` | local rendering/security fixtures | 1 | root |
| `skills/impeccable-lite/scripts/capture.mjs` | delete bespoke CDP client after parity | 2 | root |
| `skills/impeccable-lite/tests/capture.test.mjs` | delete after equivalent tool tests pass | 2 | root |
| `skills/impeccable-lite/tests/server.test.mjs` | verify compatibility re-export and server behavior | 2 | root |
| `skills/impeccable-lite/scripts/impeccable-lite.mjs` | capture/doctor compatibility adapter | 2 | root |
| `skills/impeccable-lite/scripts/serve.mjs` | retain copied-skill preview compatibility | 2 | root |
| `skills/impeccable-lite/SKILL.md` | route local evidence to CLI without authorizing browsing | 2 | root |
| `skills/impeccable-lite/references/offline-runtime.md` | new invocation and unchanged evidence contract | 2 | root |
| `skills/browser-interaction/SKILL.md` | capability-first routing with CLI fallback | 2 | root |
| `skills/browser-interaction/references/tools.md` | current native/CLI/MCP distinctions and hardening notes | 2 | root |
| `skills/browser-interaction/evals/evals.json` | CLI-only and native-search routing cases | 2 | root |
| `README.md` | document browser CLI routing, prerequisites, and external tool caveats | 2 | root |
| `CHANGELOG.md` | 1.21.2 release notes | 3 | root |

## Shared surface

Phase 1 fixes the exact dependency, bin names, contract, manifest additions,
compatibility defaults, and red tests. Phase 2 implements against them and does
not edit the contract or tests except to correct a demonstrated test-harness
defect. This is a solo sequential change; parallel ownership would add conflict
without shortening the critical path.

Public command compatibility:

| Existing command | Preserved behavior |
|---|---|
| `impeccable-lite capture` | session artifact fallback; `.impeccable-lite/evidence` default; explicit `--browser`; exit 0 success, 1 diagnostic, 64 operational/invocation failure |
| `impeccable-lite doctor` | same node/browser/dependencies/network fields; missing tool or Chrome does not disable audit |
| `IMPECCABLE_LITE_PORT=<port> node <skill>/scripts/serve.mjs <root>` | positional root plus existing environment-selected port; foreground loopback preview with the same host/path/CSP protections and shutdown behavior |

## Phases

### Phase 1 — plan, ADR, and red tests

Commit this executing plan and ADR. Add isolated exact dependency/bin declarations,
contract module, fixtures, and tests for package inclusion, CLI parsing,
compatibility, startup, viewport policy, path containment, browser absence,
network blocking, resource hashes, rollback, and exact dimensions. Observe the
new tests fail for the missing implementation.

### Phase 2 — implementation and migration

Implement the general CLI and Puppeteer engine. Make the red tests pass, then
move Impeccable entrypoints to compatibility adapters. Update the two skills and
README. Delete the raw CDP client only after real-browser parity is green.

### Phase 3 — review, demonstration, and release

Run the complete matrix, inspect package contents, capture the local fixture
through both the general and Impeccable commands, inspect both PNGs, and record
the exact paths and `disposition: pass|fix` in `verification.md`. Review root
containment, external traffic, cleanup, and partial-publication boundaries.
Update version/changelog to 1.21.2 as required by the supplied global registry
policy, commit all changes, and push the branch.

## Test strategy

### Critical path

```bash
npm test
npm run test:impeccable-lite
npm run test:browser-capture
npm run validate
npm pack --dry-run --json --ignore-scripts
```

### Edge cases

| Case | Status |
|---|---|
| omitted viewports | covered: exact desktop/mobile defaults |
| zero, duplicate, invalid, or >8 viewports | covered: reject before Chrome launch |
| one viewport | covered: general CLI permits; Impeccable completion still requires both |
| dimensions outside 240-4096 or non-integer | covered: contract tests |
| timeout outside 1000-120000ms | covered: contract tests |
| missing/unreadable/directory entry | implementation guard; no dedicated regression |
| traversal, absolute relative-input, or symlink escape | absolute output and output-symlink escape covered |
| missing Chrome or invalid explicit executable | covered: actionable doctor/capture output |
| public HTTP(S), redirect, WebSocket, or another loopback origin | other-origin HTTP and WebSocket covered; public/redirect paths use the same guard but lack a dedicated probe |
| service-worker forwarding | implementation guard via `setBypassServiceWorker`; no dedicated fixture |
| artifact/resource mutation during capture | double-hash guard; no dedicated mutation regression |
| concurrent captures | UUID staging/profile isolation; no concurrent regression |
| browser and cleanup failure together | error aggregation covered as a pure contract test |
| copied skill without general CLI | covered: actionable compatibility failure; audit remains available |
| CLI-only harness without chrome-devtools | covered: skill recommends setup or native fallback, never invents availability |
| real Windows/Linux Chrome launch | delegated to Puppeteer channel and CI; unknown if CI image lacks Chrome |

### Coverage

Core contract branches receive unit coverage. CLI and compatibility adapters
receive subprocess tests. Real Chrome covers exact CSS dimensions, resource
binding, another-origin HTTP and WebSocket blocking, and atomic rollback after
an injected second-viewport failure. The table above distinguishes additional
implementation guards from dedicated regressions. Upstream Chrome DevTools CLI
behavior is not reimplemented; version and supported hardening flags were
checked against the installed official 1.13.0 command.

## Definition of done

- No hand-written CDP transport or OS browser-path table remains.
- `browser-capture` runs on Node 22.12+ with fixed-current Puppeteer Core and an
  already installed Chrome; ordinary skills and the root installer retain Node
  18 support. Browser capture downloads nothing and emits no telemetry/update
  traffic.
- Impeccable's public commands and evidence gate remain compatible.
- General browser guidance uses native harness capabilities first and only then
  an already-installed CLI, with no MCP registration.
- External browsing never becomes implicit Impeccable authority.
- Critical-path commands pass, the demo images are inspected and recorded,
  release metadata is aligned, and the branch is pushed.

## Risks and mitigations

- Installed Chrome may drift from Puppeteer's supported version: use the
  documented stable channel and surface detected product/version.
- Puppeteer interception is not an OS firewall: retain dead proxy/DNS rules,
  background-network flags, CSP, exact-origin interception, and honest wording.
- Copied skills cannot assume the source repository exists: resolve PATH/env
  first and fail clearly while preserving static audit.
- Browser tooling requires newer Node than this repo: isolate its package and
  do not raise the root installer or ordinary skills above Node 18.
- Codex Desktop and Codex CLI can share a skill directory: the workflow is
  shell-command based rather than a guarantee that desktop never reads it.

## Decision

- `ADR-0001` — Native-first browser routing plus a narrow local capture CLI.

## Amendments

- 2026-11-20 — Replaced the proposed general MCP server with CLI-only routing
  after the user noted that Codex and Claude already provide native search and
  browser capabilities. The official Chrome DevTools terminal client is now an
  optional fallback, while the custom implementation is narrowed to
  deterministic Impeccable evidence.
- 2026-11-20 — Isolated browser dependencies on Node 22.12+: npm audit reported
  nine high-severity advisories in Puppeteer Core 24's transitive graph, while
  fixed release 25.18.1 no longer supports Node 18. The root installer and
  non-browser skill runtime retain Node-18 compatibility.
