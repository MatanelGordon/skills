# browser-capture

Deterministic screenshot evidence for local HTML. This is the narrow offline
companion used by Impeccable Lite; it is not a crawler, search tool, general
browser agent, or MCP server.

## Setup

From the registry root:

```bash
npm run setup:browser-capture
node tools/browser-capture/launcher.mjs doctor
```

The runtime needs Node 22.12 or newer and an installed standard Chrome channel.
The Node-18-compatible launcher checks `BROWSER_CAPTURE_NODE`, the current
runtime, common NVM/Volta locations, and `PATH`. It does not download Node or
change the default version. The exact `puppeteer-core` dependency lives only in
this directory.

## Commands

```text
browser-capture capture [--root <dir>] [--entry <relative-html>]
  [--out <relative-dir>] [--browser <absolute-executable>]
  [--timeout <1000-120000>] [--viewport <name:width:height> ...]
browser-capture serve [--root <dir>] [--port <1-65535>]
browser-capture doctor [--browser <absolute-executable>] [--json true]
```

Capture defaults to `index.html`, `.browser-capture/evidence`, 30 seconds,
desktop 1440×1000, and mobile 390×844. Exit 0 is clean evidence, exit 1 is
a published diagnostic generation such as overflow or a blocked request, and
exit 64 is an invocation or operational failure with no new valid generation.

## Boundary

- Chrome discovery and lifecycle use Puppeteer standard channels.
- The preview binds only to `127.0.0.1`, refuses private paths and symlink
  escapes, and applies a self-only content security policy.
- Chrome uses a dead proxy, fail-closed DNS rules, isolated temporary profiles,
  service-worker bypass, and exact-origin request interception.
- HTTP, HTTPS, WebSocket, and secure WebSocket attempts outside the exact
  preview origin are recorded and make the generation diagnostic.
- Screenshots and every served resource are SHA-256 bound in `capture.json`.
  Generation directories publish atomically only after browser, server, and
  temporary-profile cleanup succeeds.
- No command downloads a browser, browses the public web, installs packages,
  updates itself, or emits telemetry.
