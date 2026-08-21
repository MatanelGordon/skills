# Browser driving tool landscape

What to look for before writing automation, and what to recommend when nothing
suitable is installed.

> **Verification status.** The Playwright loop and `aria_snapshot()` in `SKILL.md`
> were **executed on this machine** (Playwright Python 1.58.0, Chromium; macOS).
> `safaridriver` was confirmed present. Everything else below was **found by
> search on 2026-08-22 and not installed or run here** — capabilities and names
> change quickly in this space, so re-check before depending on one.

---

## How to search

```bash
# published Agent Skills
gh search code --filename SKILL.md "playwright" --limit 20
gh search code --filename SKILL.md "browser automation" --limit 20

# MCP servers
gh search repos "mcp browser automation" --limit 20
gh search repos "mcp playwright" --limit 20
```

Also check the host's own configured MCP servers and any built-in browser
integration — those are already authorised and cost nothing to use.

## MCP servers — the two main options solve different problems

| | **Playwright MCP** | **Chrome DevTools MCP** |
|---|---|---|
| Engines | Chromium, Firefox, WebKit | Chromium only |
| How the agent sees the page | Accessibility-tree snapshots | Screenshots plus CDP calls |
| Built for | Cross-browser interaction and journeys | Performance, network, console, DevTools-style debugging |
| Best when | You need to click through a flow, especially across engines | You need to know *why* — what failed, what was slow, what the console said |

**Rule of thumb:** if the task is "click through this and tell me what happens",
start with Playwright MCP. If the task is "why is this slow / which request
failed / what's in the console", reach for Chrome DevTools MCP. They compose —
using both is normal, not redundant.

Accessibility-tree snapshots are usually the better default for an agent: fewer
tokens than an image, quotable in a report, and they expose accessible names, so
a control that is invisible to assistive tech is visible *to you* as a problem.

## Host browser control

Some agent environments can drive the **user's own browser** — real profile, real
cookies, real logins, real extensions. When available this is the strongest
option for anything behind authentication or dependent on real session state, and
no headless tool substitutes for it.

Trade-offs worth stating before using one: it acts on a real browser the user may
be using, it can touch real accounts, and it is not reproducible in CI. Confirm
before driving anything that mutates real data.

## Libraries and CLIs

| Tool | Strength | Weakness |
|---|---|---|
| **Playwright** | Three engines, one API. Auto-waiting removes most flakiness. Trace viewer, video, network interception, ARIA snapshots | Browser bundles download separately; WebKit is not Safari |
| **Puppeteer** | Mature, direct CDP access, small API | Chromium-centric |
| **Selenium / WebDriver** | The W3C standard; the only route to *real* branded Safari | More ceremony, manual waiting, separate drivers per browser |
| **`safaridriver`** | Ships with macOS. The only way to drive genuine Safari | macOS only; needs `--enable` and Allow Remote Automation |
| **Stagehand** | Natural-language actions layered on Playwright | Extra dependency and indirection; less predictable than explicit selectors |
| **browser-use** | Agent-oriented browsing loop | Aimed at autonomous browsing rather than targeted verification |

## Engine-to-browser mapping

| Engine | Ships in | Playwright name |
|---|---|---|
| Chromium (Blink) | Chrome, Edge, Brave, Opera | `chromium`, or `channel="chrome"` / `channel="msedge"` for branded builds |
| Gecko | Firefox | `firefox` |
| WebKit | Safari | `webkit` — **approximation only** |

Playwright's WebKit tracks WebKit main, frequently ahead of shipped Safari, and
Playwright cannot drive branded Safari because it depends on patched builds. For
the closest approximation run WebKit **on macOS**, where platform-dependent
behaviour like media codecs is nearer to Safari's. For an actual answer about
Safari, use `safaridriver`.

## When nothing is installed — what to recommend

Say plainly that nothing suitable is configured, then recommend by need:

- **General interaction, cross-browser** → Playwright MCP if the host supports
  MCP; otherwise the Playwright library.
- **Debugging why something failed or is slow** → Chrome DevTools MCP.
- **Anything behind a real login** → host browser control, else Playwright with
  saved storage state.
- **A genuine Safari question** → `safaridriver`; nothing else answers it.

Give the install command with the recommendation, so the user can act on it in
one step:

```bash
pip install playwright && playwright install chromium firefox webkit
# or
npm i -D playwright && npx playwright install
```

Do not hand-roll a CDP client. It is a large, sharp, undocumented-in-practice
surface, and Playwright exists precisely because doing it directly is a bad
trade — a point the CDP maintainers themselves make.
