# Verification: CLI browser tooling and Puppeteer capture

**Date:** 2026-11-20  
**Disposition:** PASS

## Automated checks

| Check | Result |
|---|---|
| `npm test` on Node 18.18.0 | PASS — 36/36 |
| `npm run test:impeccable-lite` on Node 18.18.0 | PASS — 33/33 |
| `npm run test:browser-capture` launched from Node 18.18.0 | PASS — 14/14 through selected compatible Node |
| `npm run validate` | PASS — 25 skills + 2 agents |
| root `npm audit --json` | PASS — 0 vulnerabilities |
| isolated capture `npm audit --json` | PASS — 0 vulnerabilities |
| `npm pack --dry-run --json --ignore-scripts` | PASS — capture source and shrinkwrap included; nested `node_modules` excluded |
| official `chrome-devtools --version` | PASS — 1.13.0 under Node 22.12.0 |
| official `chrome-devtools start --help` | PASS — documented CrUX, usage-statistics, isolated, headless, workspace, and URL-policy flags present |
| fresh independent implementation review | READY — no blockers |

## Manual self-test

A self-contained responsive event page was created at:

```text
/tmp/impeccable-lite-cli-demo.ObgEWg/index.html
```

Impeccable static audit returned `PASS — 0 blocking, 0 major, 0 minor`.
Both the general CLI and the Impeccable compatibility command captured it with
Chrome 157.0.8103.80. Each manifest reported `producer: browser-capture`,
`ok: true`, zero blocked requests, and no horizontal overflow at 1440×1000 and
390×844.

General manifest:

```text
/private/tmp/impeccable-lite-cli-demo.ObgEWg/general-evidence/capture-9a044718-6550-41f5-9aec-6663dfb76683/capture.json
```

Impeccable manifest and inspected frames:

```text
/private/tmp/impeccable-lite-cli-demo.ObgEWg/.impeccable-lite/evidence/capture-8eefa077-277e-46f8-ab4e-bb9f6f228578/capture.json
/private/tmp/impeccable-lite-cli-demo.ObgEWg/.impeccable-lite/evidence/capture-8eefa077-277e-46f8-ab4e-bb9f6f228578/desktop.png
/private/tmp/impeccable-lite-cli-demo.ObgEWg/.impeccable-lite/evidence/capture-8eefa077-277e-46f8-ab4e-bb9f6f228578/mobile.png
```

Visual inspection disposition: PASS. The desktop frame preserves the intended
asymmetric editorial hierarchy, readable supporting copy, complete schedule,
and footer. The mobile frame recomposes rather than crops, keeps the call to
action visible, wraps the headline deliberately, and shows no clipped or
overlapping content.

## Scope notes

- The Chrome DevTools terminal client was installed and its version/help were
  verified; no unverified existing daemon was adopted and no public page was
  opened during verification.
- Dedicated real-browser regressions cover exact viewports, resource hashes,
  another-origin HTTP and WebSocket blocking, missing Chrome, output-symlink
  refusal, and rollback on injected viewport failure. Additional guards listed
  in the plan are not represented as tested when no focused probe exists.
