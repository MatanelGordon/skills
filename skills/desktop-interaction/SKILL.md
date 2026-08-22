---
name: desktop-interaction
description: >
  Manually test webview desktop apps by launching or attaching, interacting,
  inspecting app and window behavior, and reporting evidence. Use for Electron,
  Tauri, pywebview, or Neutralino apps; packaged-only bugs; and window, menu, or
  multi-window flows. Prefer an existing MCP server, skill, or CLI. Not for
  native Swift, Qt, or WinUI apps, test suites, or CI.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Desktop interaction

Driving a webview-based desktop app so you can report what the packaged app actually did.

**Scope: webview-based desktop apps only** — Electron, Tauri, pywebview, Neutralino, and anything else rendering its UI in an embedded browser engine.

**Not in scope: genuinely native apps** — Swift/AppKit, Qt, WinUI, GTK. Driving those means accessibility trees, synthetic input, and platform automation APIs, a different discipline with a much worse success rate. If the app is native, say so and stop.

**Exploratory verification only.** Launch, interact, capture, report. Not test suites, not assertions, not CI.

---

## Search for a tool before automating

1. **An MCP server for the framework** — several exist for Electron, wrapping CDP for screenshots, console, network, DOM and UI automation. Landscape in [references/frameworks.md](references/frameworks.md).
2. **A published Agent Skill** — `gh search code --filename SKILL.md "electron"` finds several.
3. **A CLI or library** — Playwright, WebdriverIO, `tauri-driver`.
4. **Nothing fits** — say so, name the closest option and its limitation, and **recommend the right tool** rather than building a worse one.

## First: is it actually a webview app?

Cheap checks:

```bash
ls "MyApp.app/Contents/Resources" | grep -qi 'app.asar' && echo "Electron"
strings "MyApp.app/Contents/MacOS/MyApp" | grep -qi 'wry\|tauri' && echo "Tauri"
du -sh "MyApp.app"    # Electron ~100MB+; Tauri and native far smaller
```

Electron ships `app.asar` and bundled Chromium. Tauri is a small native binary using OS webview. If neither, treat as native and stop.

## Two ways in

| | **Launch under control** | **Attach to running app** |
|---|---|---|
| You get | Clean, reproducible start | App in its current, possibly broken, state |
| Needs | App's source or entry point | App started with debugging port |
| Use for | Reproducing from scratch, flows from first launch | "It's wrong *right now*", state that took effort to reach |

## Electron — the good case

Electron bundles Chromium and speaks CDP natively.

### Launch under control — Node only

```js
const { _electron: electron } = require('playwright');

const app = await electron.launch({ args: ['main.js'] });
const appPath = await app.evaluate(async ({ app }) => app.getAppPath());
const win = await app.firstWindow();
win.on('console', console.log);
await win.click('text=Save');
await win.screenshot({ path: 'finding.png' });
await app.close();
```

Evaluating in **both** the main process and renderer window is Electron's real advantage: inspect menus, dialogs, IPC and window state, not just DOM.

**This API is Node-only.** Playwright Python exposes only `chromium`, `firefox`, `webkit` — no `_electron` (raises `AttributeError`). In Python, use the CDP route below.

Playwright supports Electron v12.2.0+, v13.4.0+, v14+. If launches hang, check the `nodeCliInspect` fuse isn't disabled — hardened production builds commonly disable it.

### Attach to a running app — works from anywhere

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

*Verified: attach over CDP, drive, and read ARIA snapshot back using Chromium with debugging port standing in for Electron.*

This route reaches the **window only**, not the main process. Trade-off for not needing the app's source.

### Wait for the port, don't sleep

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

Verified: fixed 2.5s sleep gave `ECONNREFUSED`; polling `/json/version` connected first try. A fixed sleep guesses about a machine you are not on.

## Tauri — the ragged case

Tauri uses OS webview, so no bundled Chromium and no CDP. Driving goes through WebDriver:

| Route | Platforms | Notes |
|---|---|---|
| **`tauri-driver`** | Windows, Linux **only** | **No macOS support** — macOS ships no WKWebView driver. Surprises people mid-task. |
| **`@wdio/tauri-service`** (WebdriverIO) | Windows, Linux, macOS | Recommended; also gives Tauri API access and IPC mocking |
| **In-app WebDriver plugin** (e.g. `tauri-webdriver`) | macOS | Runs HTTP server inside app, debug builds only |

On macOS, if someone suggests `tauri-driver`, that is the wrong answer. Use WebdriverIO service.

Because driving Tauri is this much worse than Electron, faking a desktop prototype in Electron can be the right call even when the real app will be Tauri.

## pywebview — weakest on macOS

```python
webview.start(debug=True)     # enables web inspector
```

Remote debugging only on `edgechromium` and `qt` renderers, set via `webview.settings['REMOTE_DEBUGGING_PORT']`. **On macOS (Cocoa/WebKit renderer), no remote debugging port** — you get right-click inspector for a human, no programmatic route. Say that plainly.

## Report what happened

1. **What you did** — how launched/attached, then actions.
2. **What you saw** — ARIA snapshot or quoted text, console output, main-process state if reachable. Screenshot when visual.
3. **What it means** — the finding.
4. **Reproduction** — launch command and script, plus app version and OS.

Include what you could not reach. "Attached over CDP so I saw the window but not the main process; menu state unverified" is honest and useful.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Treating a native app as a webview app | Nothing applies. Identify framework first, stop if native. |
| Automating before searching for a tool | Electron MCP servers and skills already exist and are better maintained. |
| `_electron` from Python | Doesn't exist — Node-only. Attach over CDP instead. |
| Sleeping until debugging port "probably up" | Verified to fail. Poll `/json/version`. |
| `tauri-driver` on macOS | Unsupported. Use WebdriverIO Tauri service. |
| Promising pywebview automation on macOS | No remote debugging port on that renderer. Say so. |
| Attaching over CDP then reporting on main-process behaviour | You only saw the window. Don't infer menus, dialogs or IPC. |
| Testing the dev build and reporting on the packaged app | Packaging changes paths, fuses, signing, permissions — often the bug itself. |
| Leaving the app running after the run | Holds ports and windows, poisons the next attempt. |
| Assuming one window | Desktop apps have menus, dialogs, multiple windows. `firstWindow()` is not "the app". |
| Building an assertion suite and CI wiring | Out of scope; that is a separate decision. |
