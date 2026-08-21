---
name: browser-interaction
description: >
  Drive a browser the way a human tester would - open the page, click, type,
  read back what happened, and report the finding with evidence. Use when asked
  to manually test, try, click through, or "see if it works" in a browser; to
  check a page in Chrome, Safari, Firefox or Edge; to reproduce a UI bug, check
  a form, a flow, a login, or a layout; or when something works locally but is
  reported broken. Always searches for an existing tool first - an MCP browser
  server, a published skill, or a CLI - and recommends one rather than
  hand-rolling automation, saying so plainly when nothing fits. Covers reading
  the page as structure instead of pixels, console and network evidence,
  cross-browser reality including why WebKit is not Safari, and testing signed-in
  state. For exploratory verification, not for authoring test suites or CI.
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

## Search for a tool before automating anything

This landscape is well populated and changes fast. **Look for an existing tool
before writing a line of automation**, in this order:

1. **An MCP browser server** — the best option when available. The agent gets
   structured page state and a real input channel instead of a script it has to
   maintain. Playwright MCP and Chrome DevTools MCP solve different halves of
   this; see [references/tools.md](references/tools.md).
2. **The host's own browser control** — some agent environments can drive the
   user's actual browser, with their real profile and real logins. Nothing
   headless can reproduce a signed-in session as faithfully. Check for this
   before spinning up a clean browser.
3. **A published Agent Skill** — `gh search code --filename SKILL.md "playwright"`.
4. **A CLI or library** — Playwright, Puppeteer, Selenium, `safaridriver`.
5. **Nothing fits** — say so plainly, name the closest option and what it can't
   do, and **recommend installing the right tool** rather than quietly building
   a worse one. Hand-rolling is the outcome of a failed search, not the default.

Always state which route you took. "I used the Playwright MCP", "I checked and
nothing was configured, recommend installing X" — both are good answers.

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
| Writing automation without searching for a tool | An MCP server probably does this better, with no script to maintain. |
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
