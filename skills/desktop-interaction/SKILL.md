---
name: desktop-interaction
description: >
  Drive a webview-based desktop app the way a human tester would - launch or
  attach to it, click, type, read the window back, report the finding. Use when
  asked to manually test, try, inspect, or "see if it works" in a desktop app,
  a webview app, or an embedded browser window - including apps built with
  Electron, Tauri, pywebview, or Neutralino; to reproduce a bug that only shows
  up in the packaged app and not in the browser; or to check window, menu, or
  multi-window behaviour. Always searches for an existing tool first - an MCP
  server, a published skill, or a CLI - and recommends one rather than
  hand-rolling, saying so plainly when nothing fits. Covers launching under
  control versus attaching to a running app over a debugging port, reaching the
  main process as well as the window, and where each framework's tooling breaks
  down. Webview apps only, not native Swift, Qt or WinUI. Exploratory
  verification, not test suites or CI.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Desktop interaction

Driving a desktop application built on a webview, so you can report what the
packaged app actually did.

**Scope: webview-based desktop apps only** — Electron, Tauri, pywebview,
Neutralino, and anything else rendering its UI in an embedded browser engine.

**Not in scope: genuinely native apps** — Swift/AppKit, Qt, WinUI, GTK. Driving
those means accessibility trees, synthetic input, and platform automation APIs,
which is a different discipline with a much worse success rate. If the app is
native, say so and stop rather than pretending a webview technique applies.

**Exploratory verification only.** Launch, interact, capture, report. Not test
suites, not assertions, not CI.

---

## Search for a tool before automating

1. **An MCP server for the framework** — several exist for Electron, wrapping
   CDP to give screenshots, console, network, DOM and UI automation. Landscape in
   [references/frameworks.md](references/frameworks.md).
2. **A published Agent Skill** — `gh search code --filename SKILL.md "electron"`
   finds several, including ones specifically about driving Electron over CDP.
3. **A CLI or library** — Playwright, WebdriverIO, `tauri-driver`.
4. **Nothing fits** — say so, name the closest option and its limitation, and
   **recommend the right tool** rather than building a worse one.

## First: is it actually a webview app?

Cheap checks before committing to an approach:

```bash
# Electron ships its UI in an asar archive alongside a bundled Chromium
ls "MyApp.app/Contents/Resources" | grep -qi 'app.asar' && echo "Electron"

# Tauri links the OS webview instead, so look for its runtime symbols
strings "MyApp.app/Contents/MacOS/MyApp" | grep -qi 'wry\|tauri' && echo "Tauri"

# Neither, and no bundled engine? Treat it as native and stop.
du -sh "MyApp.app"    # Electron apps are ~100MB+; Tauri and native are far smaller
```

An Electron app ships `app.asar` and a bundled Chromium. A Tauri app is a small
native binary using the OS webview. If neither, treat it as native and stop.

## Two ways in

| | **Launch under control** | **Attach to a running app** |
|---|---|---|
| You get | A clean, reproducible start | The app in its current, possibly broken, state |
| Needs | The app's source or entry point | The app started with a debugging port |
| Use for | Reproducing from scratch, flows from first launch | "It's wrong *right now*", state that took effort to reach |

Both are worth knowing. The second is what you want when a user has an app in a
bad state and re-launching would lose it.

## Electron — the good case

Electron is the only one of these with a genuinely solid story, because it
bundles Chromium and speaks CDP natively.

### Launch under control — Node only

```js
const { _electron: electron } = require('playwright');

const app = await electron.launch({ args: ['main.js'] });

// The main process — unique to Electron, and unavailable through a browser
const appPath = await app.evaluate(async ({ app }) => app.getAppPath());

const win = await app.firstWindow();
win.on('console', console.log);
await win.click('text=Save');
await win.screenshot({ path: 'finding.png' });
await app.close();
```

Being able to `evaluate` in **both** the main process and the renderer window is
Electron's real advantage: you can inspect menus, dialogs, IPC and window state,
not just the DOM.

**This API is Node-only.** *Verified on this machine: Playwright Python exposes
only `chromium`, `firefox` and `webkit` — there is no `_electron`, and reaching
for it raises `AttributeError`.* If you are in Python, use the CDP route below.

Playwright documents support for Electron v12.2.0+, v13.4.0+ and v14+
([playwright.dev/docs/api/class-electron](https://playwright.dev/docs/api/class-electron)).
If launches hang, check the `nodeCliInspect` fuse is not disabled — hardened
production builds commonly disable it, which is one reason a dev build drives
and the packaged build does not.

### Attach to a running app — works from anywhere

Every Electron app is Chromium, so it accepts `--remote-debugging-port`:

```bash
./MyApp --remote-debugging-port=9333
```

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    page = browser.contexts[0].pages[0]
    page.click("text=Save")
    print(page.locator("body").aria_snapshot())
    browser.close()
```

*Verified on this machine — attach over CDP, drive, and read an ARIA snapshot
back, using a Chromium process with a debugging port standing in for Electron.
The CDP mechanism is confirmed; Electron itself was not installed here.*

This route reaches the **window only**, not the main process. That is the
trade-off for not needing the app's source.

### Wait for the port, don't sleep

The debugging port is not open the moment the process starts. Poll for it:

```python
def wait_for_cdp(url, attempts=60):
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=0.5) as r:
                return json.load(r)
        except Exception:
            time.sleep(0.25)
    return None

wait_for_cdp("http://127.0.0.1:9333/json/version")
```

This is not theoretical. Verifying the recipe above, a fixed 2.5-second sleep
gave `ECONNREFUSED`; the identical code polling for `/json/version` connected
first try. A fixed sleep is a guess about a machine you are not on.

## Tauri — the ragged case

Tauri uses the OS webview, so there is no bundled Chromium and no CDP. Driving it
goes through WebDriver, and support is uneven in a way that matters:

| Route | Platforms | Notes |
|---|---|---|
| **`tauri-driver`** | Windows, Linux **only** | **No macOS support** — macOS ships no WKWebView driver. This surprises people mid-task |
| **`@wdio/tauri-service`** (WebdriverIO) | Windows, Linux, macOS | The recommended route; also gives Tauri API access and IPC mocking |
| **In-app WebDriver plugin** (e.g. `tauri-webdriver`) | macOS | Runs an HTTP server inside the app, debug builds only |

If you are on macOS and someone suggests `tauri-driver`, that is the wrong
answer. Reach for the WebdriverIO service.

Because driving Tauri is this much worse than driving Electron, faking a desktop
prototype in Electron can be the right call even when the real app will be Tauri.

## pywebview — weakest on macOS

```python
webview.start(debug=True)     # enables the web inspector
```

Remote debugging is available only on the `edgechromium` and `qt` renderers,
set via `webview.settings['REMOTE_DEBUGGING_PORT']`. **On macOS, which uses the
Cocoa/WebKit renderer, there is no remote debugging port** — you get a
right-click inspector for a human, and no programmatic route.

Say that plainly rather than promising automation you can't deliver.

## Report what happened

1. **What you did** — how the app was launched or attached to, then the actions.
2. **What you saw** — ARIA snapshot or quoted text, console output, main-process
   state if you could reach it. Screenshot when the question is visual.
3. **What it means** — the finding.
4. **Reproduction** — the launch command and script, plus app version and OS.

Include what you could not reach. "Attached over CDP so I could see the window
but not the main process; the menu state is unverified" is honest and useful.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Treating a native app as a webview app | Nothing here applies. Identify the framework first, and stop if it's native. |
| Automating before searching for a tool | Electron MCP servers and skills already exist and are better maintained. |
| `_electron` from Python | Doesn't exist — Node-only. Attach over CDP instead. |
| Sleeping until the debugging port is "probably up" | Verified to fail here. Poll `/json/version`. |
| `tauri-driver` on macOS | Unsupported. Use the WebdriverIO Tauri service. |
| Promising pywebview automation on macOS | No remote debugging port on that renderer. Say so. |
| Attaching over CDP then reporting on main-process behaviour | You only saw the window. Don't infer menus, dialogs or IPC. |
| Testing the dev build and reporting on the packaged app | Packaging changes paths, fuses, signing and permissions — often the bug itself. |
| Leaving the app running after the run | Holds ports and windows, and poisons the next attempt. |
| Assuming one window | Desktop apps have menus, dialogs and multiple windows. `firstWindow()` is not "the app". |
| Building an assertion suite and CI wiring | Out of scope; that is a separate decision. |
