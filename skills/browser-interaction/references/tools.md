# Browser tool routing

Read this when the harness does not already make the route obvious, or before
using the optional shell-only Chrome client. The goal is one browser capability
per job, not the largest possible tool stack.

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

One-time operator installation (never perform this implicitly during a browser
task):

```bash
npm install --global chrome-devtools-mcp@1.13.0
```

Every client call must carry both privacy environment variables; shell state
does not reliably persist between agent calls. First inspect the daemon:

```bash
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 \
  chrome-devtools status
```

If no daemon is running, start one with a URL boundary for the authorized
origin. `start` means start **or restart**, so do not run it over an existing
service. Replace the example origin and workspace with the task's actual scope:

```bash
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 \
chrome-devtools start \
  --performanceCrux=false \
  --usageStatistics=false \
  --isolated \
  --headless \
  --allowedUrlPattern='http://localhost:3000/*' \
  --workspace=/absolute/path/to/project
```

Run `status` again with the same environment prefix and compare its version and
arguments with this policy. If an existing daemon differs, do not use it:
either ask before stopping/restarting it or report that a hardened restart is
needed. A status failure followed by another tool command is unsafe because
ordinary commands auto-start an unhardened daemon.

Core shell-only interaction, with the environment repeated on every call:

```bash
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools new_page --url='http://localhost:3000/' --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools take_snapshot 1 --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools list_console_messages 1 --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools list_network_requests 1 --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools status
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools stop
```

Stop the task-owned daemon when finished. The client may use a local background
service internally; its benefit is shell invocation without registering an MCP
tool surface in every model context.

The CLI is general browser interaction, so ordinary task authorization still
applies. A request to inspect a local page does not authorize unrelated public
browsing, account mutations, purchases, form submission, or use of stored
credentials.

### Testing UA-dependent behavior on an owned or authorized target

First use native browser control or restart the task-owned daemon without
`--headless`; that preserves coherent Chrome client hints without spoofing. If
the application specifically needs a UA-string compatibility test, version
1.13.0 supports `emulate <pageId> --userAgent=<value>`. Capture the blocked
baseline, start from `about:blank`, and use one value consistent with the actual
Chrome engine, major version, operating system, and viewport.

```bash
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools list_pages --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools emulate 1 \
  --userAgent='Mozilla/5.0 (<matching OS>) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<installed-major>.0.0.0 Safari/537.36' \
  --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools navigate_page 1 --type=url --url='https://authorized.example/' --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools evaluate_script \
  '() => ({userAgent: navigator.userAgent, userAgentData: navigator.userAgentData?.toJSON?.() ?? null})' \
  --pageId 1 --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools list_network_requests 1 --output-format=json
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1 chrome-devtools get_network_request 1 --reqid=<document-request-id> --output-format=json
```

The final request inspection proves the sent `user-agent` header. Clear the
override with the same environment prefix and
`chrome-devtools emulate 1 --userAgent=''`. Both setting and clearing the UA
replace all emulation settings, so reapply any viewport, color-scheme, or
throttling configuration that the test still needs.

A local probe confirmed that the header and `navigator.userAgent` changed, but
`navigator.userAgentData` returned empty brands and platform values because
this CLI option supplies only the UA string, not coherent client-hint metadata.
Sites can also inspect browser behavior, cookies, IP reputation, TLS, and other
automation signals. Therefore this can fix a simplistic `HeadlessChrome`
compatibility block, but it cannot guarantee admission and may make a
fingerprint less coherent. This is compatibility testing, not stealth. Do not
impersonate Safari/Firefox with a Chrome engine, rotate identities, bypass a
site's access policy, or hide the override from the verification report. If one
matching-UA retry fails, prefer native browser control or report the block.

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
