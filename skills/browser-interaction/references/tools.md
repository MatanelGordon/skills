# Browser tool routing

Read this only when the harness does not already make the route obvious. The
goal is one browser capability per job, not the largest possible tool stack.

> **Checked 2026-11-20.** The optional terminal client below is the official
> `chrome-devtools` CLI shipped by
> [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp).
> The upstream project is Apache-2.0. Its package, flags, and defaults can
> change; verify the pinned release before updating this reference.

## Decision table

| Need | First route | Why |
|---|---|---|
| Current fact, docs, public source | Harness-native web search | Source retrieval without browser lifecycle or session state |
| Click through a real or signed-in page | Harness-native browser/computer control | Real profile, cookies, extensions, and visible user session |
| Chrome console/network/CSS/performance from a shell-only agent | Hardened `chrome-devtools` CLI | Deep DevTools evidence without adding MCP schemas to every prompt |
| Cross-engine exploratory run | Existing Playwright installation | Chromium, Firefox, and WebKit behind one API |
| Genuine Safari behavior | `safaridriver` on macOS | Playwright WebKit is not branded Safari |
| Deterministic screenshots of offline local HTML | Repository `browser-capture` CLI | Narrow exact-viewport evidence; not a general browsing tool |

Native search and browser control do not overlap. Search answers from sources;
browser control observes a rendered, interactive session. Use both only when
the task needs both kinds of evidence.

## Optional CLI-only Chrome diagnosis

Use this only when a terminal agent has shell access but no native browser
control. The supported setup is:

- `chrome-devtools-mcp@1.13.0`, pinned exactly rather than `@latest`;
- Node `^20.19.0 || ^22.12.0 || >=23`;
- the package's official `chrome-devtools` terminal client;
- telemetry, update checks, and CrUX disabled;
- isolated profile, headless mode, and an explicit workspace.

One-time operator installation:

```bash
npm install --global chrome-devtools-mcp@1.13.0
```

Harden each service start:

```bash
export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1
export CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1
chrome-devtools start \
  --performanceCrux=false \
  --usageStatistics=false \
  --isolated \
  --headless \
  --workspace=/absolute/path/to/project
```

Before relying on it, verify the Node and package versions and record the exact
start policy in the report. Do not attach to or reconfigure an already-running
service whose telemetry, profile, CrUX, or workspace policy cannot be verified;
fall back to native harness capability or report that a hardened restart is
needed. The terminal client may use a local background service internally. The
benefit is that the agent invokes commands from the shell instead of registering
an MCP tool surface in every model context.

The CLI is general browser interaction, so ordinary task authorization still
applies. A request to inspect a local page does not authorize unrelated public
browsing, account mutations, purchases, form submission, or use of stored
credentials.

## MCP when it is already part of the host

Do not broadly register a browser MCP just for this skill. If the user selected
one or the host already exposes one, it is a native capability for this task:

| Existing server | Best fit | Limit |
|---|---|---|
| Playwright MCP | Accessible interaction and cross-engine journeys | Clean automation session unless configured otherwise |
| Chrome DevTools MCP | Chrome performance, network, console, and CSS debugging | Chromium-only and a larger always-visible tool schema |

Prefer Playwright-style accessibility snapshots for actions and Chrome
DevTools evidence for diagnosis. Do not start both unless the evidence actually
requires both.

## Libraries and drivers

| Tool | Strength | Limit |
|---|---|---|
| Playwright | Auto-waiting, traces, ARIA snapshots, three engines | Browser bundles install separately; WebKit is not Safari |
| Puppeteer | Mature Chrome automation and DevTools access | Primarily Chromium; use an existing project dependency |
| Selenium / WebDriver | W3C route to shipped browsers | More driver and wait management |
| `safaridriver` | Real Safari on macOS | Requires Allow Remote Automation and macOS |

When the user explicitly asks for a script, the script is the deliverable: use
the project's installed library and write it. Tool discovery is for choosing a
runtime, not for evading an explicit coding request. Never put real credentials
in the script or transcript.

## When nothing fits

State the missing capability and recommend one setup:

- cross-browser interaction: Playwright;
- shell-only Chrome diagnosis: the pinned, hardened CLI above;
- signed-in real session: host browser control or a user-provided saved storage
  state;
- genuine Safari: `safaridriver`.

Do not hand-roll CDP transport, browser-process discovery, or daemon lifecycle.
