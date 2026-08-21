# Webview desktop framework tooling

Per-framework driving support, and what to recommend when nothing is installed.

> **Verification status.** Two things were **executed on this machine** (macOS,
> Playwright Python 1.58.0): Playwright Python has no `_electron` attribute, so
> Electron launch really is Node-only; and `connect_over_cdp` attach → click →
> `aria_snapshot` works, using a Chromium process with `--remote-debugging-port`
> standing in for an Electron app. **Electron, Tauri and pywebview were not
> installed here**, so framework-specific claims below are documentary — drawn
> from vendor docs plus an independent source each, on 2026-08-22.

---

## How to search

```bash
gh search code --filename SKILL.md "electron" --limit 20
gh search repos "mcp electron debug" --limit 20
gh search repos "tauri webdriver" --limit 20
```

## The support gradient

Worth internalising, because it decides how much you can promise:

| Framework | Engine | Protocol | Driving quality |
|---|---|---|---|
| **Electron** | Bundled Chromium | CDP, natively | **Strong** — launch or attach, window *and* main process |
| **Neutralino** | OS webview | Varies | Weak, thin tooling |
| **Tauri** | OS webview (WKWebView / WebView2 / WebKitGTK) | WebDriver | **Uneven** — platform-dependent, macOS is the problem |
| **pywebview** | OS webview or Qt/Edge | CDP on some renderers only | **Weak on macOS** — no remote debugging there |

The gap between Electron and the rest is large and it is structural: Electron
ships its own browser, so it brings its own automation protocol. Everything using
the OS webview inherits whatever that platform's webview offers, which on macOS
is very little.

## Electron

**Launch under control** — `_electron.launch()`, Node only. Supported on Electron
v12.2.0+, v13.4.0+, v14+. If launch times out, check the `nodeCliInspect` fuse
has not been disabled — a hardened production build commonly disables it, which
is one reason dev builds drive and packaged builds don't.

**Attach to a running app** — `--remote-debugging-port=PORT`, then any CDP client.
Works from any language. Reaches the renderer window only.

**MCP servers** — several wrap CDP for agents, offering screenshots, console
errors, network logs, DOM inspection, JS evaluation and UI automation; some can
spawn as well as attach. `electron-mcp-server` and `debug-electron-mcp` are two;
check what the host has configured before adding another.

**Published skills** — an `electron` skill exists in `TerminalSkills/skills`, and
agent-browser style Electron skills appear in several plugin collections. Worth
reading before writing your own driver.

**Dev build vs packaged build.** Packaging changes resource paths, fuses, code
signing and OS permissions. A bug that only reproduces in the packaged app is
common and often *is* the bug. Say which one you tested.

## Tauri

The WebDriver story, in order of preference:

1. **`@wdio/tauri-service`** — the recommended route. Windows, Linux **and**
   macOS. Also provides Tauri API access via `browser.tauri.execute()`, IPC
   command mocking, and frontend/backend log capture.
2. **In-app WebDriver plugin** (e.g. `Choochmeque/tauri-plugin-webdriver`,
   `danielraffel/tauri-webdriver`) — runs an HTTP server inside the app to find
   elements, click, read text, manage windows and execute JS. **Debug builds
   only**, which means you are not testing the shipped artifact.
3. **`tauri-driver` directly** — Windows and Linux only. Underneath it uses the
   platform driver (`WebKitWebDriver` on Linux, Edge driver on Windows).

**The macOS gap is the thing to remember.** Apple ships no WKWebView driver, so
`tauri-driver` has no macOS support at all. Anyone recommending it on a Mac is
working from Linux instructions.

## pywebview

- `webview.start(debug=True)` enables the web inspector on macOS, GTK and Qt
  (QtWebEngine only). This is a *human* affordance — right-click, Inspect.
- `webview.settings['REMOTE_DEBUGGING_PORT']` gives a real CDP port, but only on
  the **`edgechromium`** and **`qt`** renderers.
- On macOS the default Cocoa/WebKit renderer offers **neither** — no CDP, no
  WebDriver. Programmatic driving is not available; a human must look.

If a pywebview app must be driven programmatically on macOS, the honest options
are: switch the renderer to Qt for testing, or test the web UI in a browser
separately from the shell.

## What to recommend when nothing is installed

- **Electron, have the source** → Node Playwright, `_electron.launch()`.
  `npm i -D playwright`
- **Electron, only the binary** → relaunch with `--remote-debugging-port` and
  attach with any CDP client. Works from Python.
- **Electron, agent-driven and repeated** → an Electron MCP server; no script to
  maintain.
- **Tauri, any platform** → WebdriverIO with `@wdio/tauri-service`.
- **Tauri on macOS** → the same. Explicitly *not* `tauri-driver`.
- **pywebview on Windows/Linux** → set `REMOTE_DEBUGGING_PORT`, attach over CDP.
- **pywebview on macOS** → say it cannot be driven programmatically, and offer
  the two workarounds above.
- **Native app** → out of scope for this skill. Say so rather than improvising.
