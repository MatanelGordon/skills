# Fastest convincing fake, per surface

Getting to running code fast. One recommended default per surface, what the
rejected options cost, and the smallest thing that runs.

> **Verification status:** the recommendations below are documentary — assembled
> from vendor documentation plus at least one independent source each, and
> **not executed on this machine**. Commands are transcribed from primary docs,
> not from a terminal session here. Treat version-specific behaviour as
> unverified until you run it.

Driving these once they exist — clicking, typing, capturing what happened — is a
separate discipline with its own skills in this repo for terminal, browser and
desktop interaction. This file only covers getting something on screen.

---

## Backend / logic

**Question:** does this state model or flow hold up under the awkward cases?

**Default: one script — a pure module plus a scenario list that prints state
after every step.**

The pure module is the only part worth keeping; the scenario runner around it is
throwaway. Keeping them separate is what lets the validated model lift into the
real codebase without the prototype's scaffolding riding along.

```js
// refund-model.mjs — the part that might survive
export const reduce = (state, action) => { /* ... */ };

// scenarios.mjs — throwaway, prints everything
import { reduce } from './refund-model.mjs';

const run = (name, actions) => {
  console.log(`\n=== ${name} ===`);
  let s = { status: 'authorized', refunded: 0 };
  for (const a of actions) {
    s = reduce(s, a);
    console.log(`${a.type.padEnd(18)} →`, JSON.stringify(s));
  }
};

run('webhook retries mid-capture', [
  { type: 'CAPTURE' }, { type: 'REFUND', amount: 50 },
  { type: 'WEBHOOK_RETRY' }, { type: 'REFUND', amount: 50 },
]);
```

`node scenarios.mjs`. The awkward cases go in the list, the state is visible at
every step, and the agent reads stdout to report the verdict.

**When a non-developer must judge it** — a PM, a designer, a domain expert —
build a single self-contained HTML file with one button per action instead, and
label everything in domain language rather than code. One file, no install, opens
by double-click, survives being emailed. This is Matt Pocock's shareable-demo
shape and it is the right call whenever the person who knows the answer doesn't
read code.

| Rejected | Why |
|---|---|
| A test suite as the harness | Tests assert what you expect; a prototype exists to find out what you don't. Also makes it non-throwaway. |
| A REPL session | Nothing to re-run, nothing to hand over, no record of the scenarios. |
| Wiring to the real database | The question is the model. Persistence adds setup time and a second failure source. |

---

## Browser UI

**Question:** what should this look like, or which variation wins?

**Default: variants on the existing route behind `?variant=`.**

A UI is far easier to judge when it's butting up against real header, real
sidebar, real data, real density. A standalone route is a vacuum where every
variant looks fine.

```tsx
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A', 'B', 'C']} current={variant} />
  </>
);
```

Keep the existing data fetching above the switcher; only the rendered subtree
changes. Gate the switcher on a non-production check so a stray merge can't ship
it. Three variants, structurally different — different layout, different
information hierarchy, different primary affordance. Three tweaked card grids is
wallpaper, not a prototype.

**When there's genuinely no host page**, one self-contained HTML file with inline
CSS and no build step beats scaffolding a route. No framework, no bundler, no dev
server — those exist to make long-lived apps maintainable, which is the opposite
of the goal.

| Rejected | Why |
|---|---|
| A new throwaway route | Empty routes hide the density and layout problems a populated page exposes. Last resort only. |
| Figma or static mockups | Can't be clicked through with real data; the interesting failures only show up in a real browser. |
| Scaffolding a fresh app to hold the variants | Minutes of setup to answer a question about rendering. |

---

## Terminal UI

**Question:** does this interaction feel right in a terminal?

The answer depends on whether the question is about a **flow** (a sequence of
prompts) or a **layout** (a full screen with panes that update).

**Default for a flow: `gum`.** Shell-scriptable TUI widgets — no code, no
project, no dependencies beyond one binary. This is the fastest possible fake of
a terminal interaction, because you are writing a shell script rather than an
application.

```bash
brew install gum   # or: go install github.com/charmbracelet/gum@latest

NAME=$(gum input --placeholder "project name")
ENV=$(gum choose staging production)
gum confirm "Deploy $NAME to $ENV?" && gum spin --title "Deploying…" -- sleep 2
echo "state: name=$NAME env=$ENV"
```

**Default for a layout: Textual (Python).** Its dev mode is the reason —
`textual run --dev` watches `.tcss` files and applies style changes in
milliseconds without a restart, and `textual console` streams logs and events
from a second terminal. That iteration loop is what makes layout questions cheap
to answer. Requires the separate `textual-dev` package.

```bash
pip install textual textual-dev
textual run --dev app.py     # live CSS reload
textual console              # second terminal: logs and events
```

| Rejected | Why |
|---|---|
| `fzf` | Superb at exactly one thing — fuzzy selection. Not a widget set; you'll hit its edge in minutes. |
| `dialog` / `whiptail` | Available everywhere, but looks like 1995 and the quoting is painful. Fine for a yes/no, wrong for judging feel. |
| **bubbletea** (Go), **ratatui** (Rust) | Excellent frameworks — but you are writing an application, not faking one. Correct only when the real thing will be Go/Rust, where the prototype doubles as a spike. Both have existing published skills: `pedronauck/skills` → `curated/ratatui-tui`, and a `bubbletea` skill in `compozy/compozy`. *Verified present 2026-08-22 via GitHub code search.* |
| **Ink** (React for CLIs) | Strong choice if the project is already React/Node, but it's a component framework with real setup. This repo has dedicated terminal UI skills that own Ink specifics — defer there rather than duplicating. |
| **clack**, **@inquirer/prompts** (Node) | The right pick *if* the project is already Node and the real thing will be Node — good-looking prompt flows with little code. Still slower than `gum`, which needs no project at all. |
| **blessed** | Legacy, largely unmaintained. Reach for Ink or Textual instead. |

---

## Desktop UI

**Question:** does this window, layout, or flow feel right as an app?

**Default: a bare Electron app — one `main.js`, one `index.html`, run with
`npx electron .`.** No scaffolding tool, no forge, no bundler.

```js
// main.js
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1000, height: 700 });
  win.loadFile('index.html');
});
```

```json
{ "name": "proto", "main": "main.js" }
```

```bash
npm i -D electron && npx electron .
```

Roughly fifteen lines to a real application window with real chrome, real menus
and real window behaviour. The brief this skill grew from guessed Electron was
too heavy to earn a place; at this size it isn't — the weight lives in packaging
and distribution, neither of which a prototype does.

It also has by far the best story for being driven and observed, which matters
more than it sounds: a desktop prototype you can't inspect can't settle much.
That advantage is a legitimate reason to fake a desktop app in Electron even when
the real one will be Tauri.

| Rejected | Why |
|---|---|
| **Tauri dev mode** | Right when the real thing will be Tauri, but needs a Rust toolchain and a slow first build. Driving it is also markedly worse — notably, `tauri-driver` has **no macOS support**, since macOS ships no WKWebView driver. |
| **pywebview** | Genuinely fast if the project is already Python — `webview.create_window(...)` and go. Its remote-debugging port only works on the `edgechromium` and `qt` renderers, so on macOS you lose programmatic inspection. |
| **Chromeless browser** (`chrome --app=file://…`) | Cheapest possible desktop-ish fake and fine for pure layout questions. But no native menus, no file dialogs, no multi-window — so it can't answer anything about app-shell behaviour. |
| **Slint live preview** | Good live-preview story, but a niche toolkit and its own language. Only if the real thing is Slint. |
| **Native quick-and-dirty** (tkinter, SwiftUI previews) | Fast to a window, but nothing transfers if the real app is web-tech, and driving them is far harder. SwiftUI previews are excellent — and macOS-only, Swift-only. |
| **Electron Forge / a scaffold** | Generates a project when you needed a window. Setup, config, and a build step in exchange for nothing the prototype uses. |
