# Use native-first browser routing and a narrow local capture CLI

**Status:** accepted

General browser work uses each harness's native web-search or browser capability first, then the official `chrome-devtools` terminal client when a CLI-only agent needs deeper interaction or DevTools evidence. Impeccable Lite does not inherit that browsing authority: deterministic local screenshots come from a separate repository-owned `browser-capture` CLI built on pinned `puppeteer-core`, preserving its offline evidence contract without registering a broad MCP server or maintaining a raw CDP transport.

## Constraints this creates

- Browser-search and interaction tools never activate implicitly inside Impeccable Lite's local-only runtime.
- The `chrome-devtools` command is optional, externally maintained, and must be pinned and hardened when installed; it is not a Node-18 repository dependency.
- The local capture CLI may launch an installed Chrome but must not download a browser, call an updater, emit telemetry, or permit non-preview network traffic.
- CLI skills remain capability-adaptive: absent native or external browser tooling is reported, not simulated.

## Rejected alternatives

The archived Puppeteer MCP has no security-maintenance guarantee. A custom general browser MCP would duplicate native Codex/Claude capabilities and add permanent tool-schema context. `dev-browser` is useful for short Puppeteer scripts but its downloaded binary and current macOS/glibc-Linux support do not meet this repository's portable Impeccable boundary.
