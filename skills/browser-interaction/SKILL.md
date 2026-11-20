---
name: browser-interaction
description: >
  Human-like browser drive: open, click, type, inspect, report evidence. Use when asked to test/try/click through/"see if it works"; check Chrome/Safari/Firefox/Edge; reproduce UI bugs; verify forms/flows/logins/layouts; investigate local-pass but reported-fail behavior; or choose a tool to drive a browser. Seek an existing host capability, installed CLI/library, or published skill and say plainly if none fits. Covers page structure, console/network evidence, WebKit ≠ Safari, and signed-in state. Not factual lookups, test suites, or CI.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Browser interaction

Driving a browser by hand so you can report what actually happened, with
evidence, instead of what the code implies.

**Scope: exploratory verification.** Open, interact, capture, report. Not test
suites, not assertions, not CI wiring.

---

## Route by capability; do not stack browser systems

Use the smallest capability that answers the question:

1. **Facts, documentation, or current public information:** use the harness's
   native web search. Search retrieves sources; it is not a reason to start a
   controllable browser or a background daemon.
2. **A real page or signed-in flow:** use the harness's native browser/computer
   control when available. It preserves the user's actual profile, cookies, and
   extensions better than a clean automated browser. This may act on real
   accounts: confirm before any action that mutates real data, submits a form,
   purchases, publishes, or changes account state.
3. **Shell-only CLI with no native browser control:** for Chrome console,
   network, CSS, performance, or interaction evidence, use the official
   `chrome-devtools` terminal client only when its pinned, hardened setup is
   already verified. Read the CLI section of
   [references/tools.md](references/tools.md) before using it.
4. **Installed library or driver:** when routes 2–3 are unavailable or do not
   fit, use an installed Playwright, Puppeteer, Selenium, or `safaridriver` for
   exploratory work, cross-engine checks, real Safari, or a requested script.
   Reuse the project's dependency when it has one.
5. **Nothing fits:** say what is unavailable, name the closest option and its
   limitation, and recommend one concrete setup. Do not improvise a raw CDP
   client.

"CLI-only" means a terminal agent such as Claude Code, Codex CLI, or Copilot
CLI that exposes shell commands but no browser tool. It does not mean every
request originating in a CLI. If the harness already exposes web search or
browser control, use it; do not start `chrome-devtools` for the same job. MCP is
an explicit host/user choice or an already-configured capability, not a default
installation this skill adds.

Always state the route used and its boundary: for example, "native search for
the release facts", "host browser for the signed-in flow", or "pinned
chrome-devtools CLI for console/network evidence".

When the route is not obvious, use the decision table in
[references/tools.md](references/tools.md). Do not read it when the host already
provides the only fitting browser capability.

## UA-dependent testing

Only test UA-dependent behavior on an owned or explicitly authorized target.
Prefer native browser control or headed mode; if a page-scoped diagnostic
override is still required, follow [references/tools.md](references/tools.md).

## Read the page as structure, not pixels

The instinct is to screenshot everything. For an agent, a **structured snapshot
is better evidence than an image**: it is smaller, diffable, quotable, and it
carries the accessible names that tell you whether a control is actually
reachable.

```python
page.locator("body").aria_snapshot()
```

```
- heading "Checkout" [level=1]
- button "Pay now"
- paragraph: idle
```

*Verified on this machine — Playwright Python 1.58.0, Chromium.*

**Note the API moved.** `page.accessibility.snapshot()` no longer exists in
current Playwright; it raises `AttributeError`. Use `locator.aria_snapshot()`.
Documentation and blog posts still show the old call.

Take a screenshot **as well** when the question is visual — spacing, overlap,
colour, "it looks wrong". Take one **instead** never: an image alone can't tell
you a button has no accessible name.

## The loop

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()          # headless=False to watch it
    page = browser.new_page()
    messages = []
    page.on("console", lambda m: messages.append(f"{m.type}: {m.text}"))

    page.goto("http://localhost:3000/checkout")
    print(page.inner_text("#status"))                    # before
    page.click("#pay")
    page.wait_for_function(
        "document.getElementById('status').textContent !== 'idle'")
    print(page.inner_text("#status"))                    # after
    print(messages)
    page.screenshot(path="finding.png")
    browser.close()
```

*Verified on this machine — this exact shape ran, clicked, observed the state
change, and captured `warning: duplicate charge guard missing` from the console.*

**Collect console messages from the start.** Attach the listener before
`goto`, or you miss everything logged during load — which is where the
interesting errors are.

## Waiting

Playwright auto-waits for elements to be actionable, so most explicit waiting is
unnecessary and `sleep` is almost always wrong. When you need to wait for a
*state change* rather than an element, wait for the condition:

```python
page.wait_for_function("document.getElementById('status').textContent !== 'idle'")
page.wait_for_url("**/success")
page.wait_for_load_state("networkidle")   # last resort; flaky on polling apps
```

A fixed `sleep` passes on a fast machine and fails in CI. If you find yourself
reaching for one, you have not identified what you are actually waiting for.

## Cross-browser reality

| Target | How | Caveat |
|---|---|---|
| **Chrome / Edge** | Playwright `chromium`, or `channel="chrome"` for the real branded build | Bundled Chromium ≠ shipped Chrome; use the channel when Chrome-specific behaviour is the question |
| **Firefox** | Playwright `firefox` | Playwright's own build, not your installed Firefox |
| **Safari** | Playwright `webkit` gets you close — **but it is not Safari** | See below. This one bites people |
| **Real Safari** | `safaridriver` + WebDriver | macOS only |

**WebKit is not Safari.** Playwright's WebKit is built from WebKit main, often
ahead of what ships in Safari, and Playwright explicitly does not work with
branded Safari because it relies on patches. Running `webkit` green means
"probably fine in Safari" — nothing stronger. Codecs and platform integrations
differ, and WebKit-on-Linux differs further from WebKit-on-macOS.

When Safari specifically is the question, drive the real thing:

```bash
safaridriver --enable        # once; may need sudo
# then enable Develop ▸ Allow Remote Automation in Safari
safaridriver -p 4444         # W3C WebDriver endpoint
```

*`safaridriver` is present by default on macOS — confirmed on this machine. The
`--enable` step and the automation run were not executed here, since they change
system state and open a browser window.*

**Browsers are not installed until you install them.** Playwright ships bundles
separately:

```bash
playwright install chromium firefox webkit   # or: npx playwright install
```

On this machine only the Chromium bundles were present; Firefox and WebKit would
each need downloading first. Check before promising cross-browser coverage.

## Signed-in and real-profile testing

Most interesting bugs live behind a login, and a clean headless browser has no
session. Options, best first:

1. **Drive the user's real browser** through whatever host integration exists —
   real profile, real cookies, real extensions. Closest to the user's actual
   experience.
2. **Reuse a saved storage state** — log in once, persist cookies and
   localStorage, load it on later runs.
3. **Log in through the UI each run** — slow, brittle, and it exercises the login
   flow whether or not that is what you were testing.

Never paste real credentials into a script or a transcript. If a login is
genuinely required and no session exists, ask — don't improvise with secrets.
Confirm before driving the real profile through any mutation of account or
business data.

## Report what happened

1. **What you did** — URL, the actions, in order.
2. **What you saw** — the ARIA snapshot region or quoted text, console errors,
   failed requests. A screenshot when it's visual.
3. **What it means** — the finding, stated plainly.
4. **Reproduction** — the script or MCP calls, and which browser and viewport.

> On `/checkout` in Chromium at 1280×720, clicking **Pay now** set status to
> "charged twice" and logged `duplicate charge guard missing`. Reproduced 3/3.
> Not reproduced in WebKit — so this is likely Chromium-specific, needs a real
> Safari check before we call it cross-browser.

Say what you could *not* check. "Firefox not installed, unverified" is a useful
sentence; silently omitting it is how a claim of cross-browser coverage becomes
false.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Starting a CLI daemon when native search/control already answers the task | Duplicates capability, loses real-session fidelity, and adds lifecycle and policy state. |
| Using browser automation for a factual lookup | Search is smaller, source-oriented, and does not need a page-control session. |
| Hand-writing a raw CDP client | Recreates a large transport and lifecycle surface already owned by maintained tools. |
| Cycling user agents until a site admits the session | Turns a diagnostic compatibility control into brittle access-control evasion; use one matching-UA retry and report the result. |
| Screenshot as the only evidence | Can't show console errors, failed requests, or a button with no accessible name. |
| `page.accessibility.snapshot()` | Removed from current Playwright. Use `locator.aria_snapshot()`. |
| Attaching the console listener after `goto` | Load-time errors are the interesting ones and you just missed them. |
| `sleep(2)` | Passes locally, fails in CI. Wait for the condition you actually mean. |
| Claiming Safari coverage from a WebKit run | Different build, and Playwright can't drive branded Safari at all. |
| Assuming browser bundles are installed | They're downloaded separately; an uninstalled engine is not coverage. |
| Testing only at your own window size | Layout bugs are viewport bugs. Set it explicitly. |
| Real credentials in a script or transcript | Leaks a secret into logs and history. Use saved state, or ask. |
| Reporting "works fine" with no evidence | Unfalsifiable. Show the snapshot or the screenshot. |
| Building an assertion suite and CI wiring | Out of scope — that is a separate, deliberate decision. |
