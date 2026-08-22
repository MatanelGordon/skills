---
name: terminal-ux
description: >
  Build complex, testable terminal UIs and data visualizations with Ink (React for CLIs)
  — dashboards, live charts, sparklines, braille plots, gauges, tables, progress, log
  panes, and keyboard-driven layouts. Use whenever writing or reviewing a TUI, CLI
  output, or terminal visualization: Ink components, Box flexbox layout, colors,
  keyboard input and focus, redraw performance, terminal width and resize handling, and
  rendering data as text. Also use when asked to test a terminal UI — covers
  ink-testing-library, renderToString, snapshot and layout-invariant tests, simulating
  keystrokes, and the async input gotcha. Ink specific: assumes React + Ink, not
  blessed/blessed-contrib/Textual.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
  requires: Ink-specific (React for CLIs); assumes Node >= 22.
---

# Terminal UX (Ink)

Build terminal UIs with **Ink** — React for CLIs, using Yoga for flexbox layout.
Claude Code and GitHub Copilot CLI are both built with it.

Verified against **ink 7.1.1 · react 19 · ink-testing-library 4.0.0 · Node ≥ 22**.
Re-check versions before relying on specific APIs.

```bash
npm install ink react
npm install -D ink-testing-library vitest @vitejs/plugin-react
```

## The five rules

1. **Logic goes in pure functions**, not components. A chart is a `(data) => string[]`.
2. **Layout with `<Box>`**, never manual padding arithmetic.
3. **Measure display width, never `.length`** — emoji and CJK are 2 columns wide.
4. **Color is information, never decoration** — and must survive `NO_COLOR`.
5. **Test the frame, not the implementation.** `lastFrame()` is the contract.

---

## Architecture: pure core, thin components

The single most important structural decision. Everything that computes text lives
in a pure function; components only place it.

```ts
// chart.ts — pure, no React, trivially testable, property-testable
const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

export const sparkline = (values: readonly number[]): string => {
  if (values.length === 0) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;                       // guard: flat series
  return values
    .map(v => BLOCKS[Math.round(((v - min) / span) * (BLOCKS.length - 1))]!)
    .join('');
};
```

```tsx
// panel.tsx — placement only
export const Panel = ({ title, series }: { title: string; series: readonly number[] }) => (
  <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
    <Text bold>{title}</Text>
    <Text color="magenta">{sparkline(series)}</Text>
  </Box>
);
```

This split is why the visualization is testable without a terminal, and why it can
be reused for `--json`, logs, or a snapshot.

## Layout

`<Box>` is a flex container (Yoga). Available props include `flexDirection`,
`flexGrow`/`flexShrink`/`flexBasis`, `justifyContent`, `alignItems`, `alignSelf`,
`gap`/`rowGap`/`columnGap`, `width`/`height` (number or `"50%"`),
`min/maxWidth`, `min/maxHeight`, `padding*`, `margin*`, `display`,
`borderStyle`/`borderColor`/`borderDimColor` (plus per-side `borderTop*`,
`borderLeft*`, …), `backgroundColor`, `overflow`.

```tsx
<Box flexDirection="column" height="100%">
  <Box borderStyle="single" paddingX={1}><Text bold>Header</Text></Box>
  <Box flexGrow={1}>
    <Box width="30%" borderStyle="single"><Text>Sidebar</Text></Box>
    <Box flexGrow={1} borderStyle="single"><Text>Main</Text></Box>
  </Box>
  <Box><Text dimColor>q quit · ? help</Text></Box>
</Box>
```

`<Spacer />` pushes siblings apart; `<Newline count={n} />` inserts breaks.
`measureElement(ref)` reports a node's rendered size when you must compute against
real dimensions.

**Terminal size:** `useWindowSize()` gives `{columns, rows}` and updates on resize.
Design for ~80×24 as the floor unless you know otherwise, and decide explicitly
what degrades: drop columns, shorten labels, or show a "terminal too small"
message — never let content wrap into garbage.

**Text overflow:** `<Text wrap>` accepts `wrap` (default), `truncate`,
`truncate-start`, `truncate-middle`, `truncate-end`. Choose deliberately for every
piece of variable-length text; unbounded content in a fixed box is the most common
TUI layout bug.

## Width: the wide-character trap

`"🎉".length === 2` and `"日".length === 1`, but both occupy **2 terminal columns**.
Any padding, truncation, or box-drawing you do with `.length` will misalign.

Ink handles this correctly inside `<Box>`/`<Text>` — verified: bordered boxes
containing `日本語テスト` and `🎉🎉🎉` align perfectly. **But your own pure
functions don't get that for free.** If you pad or truncate manually:

```ts
import stringWidth from 'string-width';

const padTo = (s: string, w: number): string =>
  s + ' '.repeat(Math.max(0, w - stringWidth(s)));
```

Prefer letting `<Box width>` do the work. Reach for manual padding only inside a
single `<Text>` (a bar, a table cell), and use `string-width` there.

## Visualization techniques

Pick by data shape and available space — see `references/visualizations.md` for
verified implementations of each.

| Need | Technique | Density |
|---|---|---|
| Trend in one line | Sparkline (`▁▂▃▄▅▆▇█`) | 1 cell per point |
| Magnitude comparison | Horizontal bars with partial blocks | 1 row per series |
| Precise curve / scatter | Braille (`⠀`–`⣿`) | **2×4 dots per cell** — 8× the resolution |
| Distribution over 2 axes | Heatmap via background color or shade blocks `░▒▓█` | 1 cell per bucket |
| Progress | Bar + percentage + ETA | 1 row |
| Structured records | Aligned columns with explicit widths | 1 row each |

Braille is the highest-resolution option in pure text: each cell packs a 2×4 dot
matrix, so an 80×20 area addresses 160×80 points.

**Never animate when output is not a TTY** — check `useStdin().isTTY`. Progress
bars in CI logs produce thousands of junk lines.

## Color

- Color is a **redundant** channel. Never encode meaning in color alone — pair it
  with a symbol, label, or position. This is both accessibility and terminal-theme
  robustness.
- Honor **`NO_COLOR`** (any non-empty value), `TERM=dumb`, and non-TTY output.
- Don't assume a dark background. Avoid low-contrast pairs; prefer named colors
  and `dimColor` over hardcoded near-black/near-white hex.
- Keep a small semantic palette — success / warning / error / muted / accent — and
  use it consistently. More than ~5 meanings and users stop decoding.

```tsx
const useColor = () => {
  const { isTTY } = useStdin();
  return isTTY && !process.env['NO_COLOR'] && process.env['TERM'] !== 'dumb';
};
```

## Keyboard and interaction

```tsx
useInput((input, key) => {
  if (input === 'q' || key.escape) exit();
  if (key.downArrow || input === 'j') move(1);
  if (key.upArrow   || input === 'k') move(-1);
});
```

`key` includes `upArrow`, `downArrow`, `leftArrow`, `rightArrow`, `return`,
`escape`, `tab`, `backspace`, `delete`, `pageUp`, `pageDown`, `ctrl`, `shift`,
`meta`. `useFocus()`/`useFocusManager()` handle focus across panes; `usePaste()`
handles bracketed paste (important — pasted text arrives as one burst, not
keystrokes).

**Discoverability is the hard part of TUI UX.** Keyboard-only interfaces have no
affordances, so:

- Show hotkeys **inline next to what they act on** (`s shop · a account · q quit`),
  not only in a help screen.
- Keep a persistent footer of the 3–5 keys valid *right now*, and change it per view.
- Use conventional bindings: `q` quit/back, `?` help, `/` search, `Enter` select,
  `Esc` cancel, arrows + `jk` navigate, `Ctrl-C` always exits.
- Provide a `?` overlay listing everything, scoped to the current view.
- Make destructive keys hard to hit by accident — require confirmation or a modifier.

## Performance and redraw

- **`<Static>`** renders items once and never redraws them — the correct component
  for append-only logs and completed task lists above a live region. Without it,
  a long history is re-rendered every frame.
- Keep the live region small. Ink diffs and repaints; a full-screen re-render at
  high frequency will flicker and burn CPU.
- Throttle high-frequency data to ~10–20 fps before it reaches state. Terminals
  cannot usefully show more, and re-rendering per event is the usual cause of a
  sluggish TUI.
- Memoize expensive pure renders (`useMemo`) keyed on the data, not the frame.

## Accessibility

Terminals have no accessibility tree and no ARIA. Compensate deliberately:

- `useIsScreenReaderEnabled()` — Ink exposes this; when true, prefer plain
  sequential text over boxes, spinners, and redrawing regions.
- Offer a flag (`--plain` / `--no-animation`) that disables borders, spinners, and
  cursor movement. Screen readers re-read regions that repaint.
- Never rely on color, position, or ASCII art alone to convey state.
- Everything reachable by keyboard, with visible focus.

## CLI conventions this sits inside

A TUI is one mode of a program that also has a non-interactive mode. Follow the
established CLI contract (see `clig.dev`):

- Primary output to **stdout**, messages/errors to **stderr**.
- **Only go interactive when stdin is a TTY**; support `--no-input`. Never hang
  waiting for input that cannot come.
- Provide `--json` / `--plain` for machine consumption — a TUI must not be the
  only way to get the data.
- Print something within ~100ms; show progress past ~1s.
- `Ctrl-C` exits immediately; print what's happening if cleanup takes time.
- Exit 0 on success, non-zero on failure.

---

## Testing

Full patterns in `references/testing.md`. The essentials:

```tsx
import { render, cleanup } from 'ink-testing-library';
import { renderToString } from 'ink';

afterEach(() => cleanup());

it('renders the label and bar', () => {
  const { lastFrame } = render(<Gauge label="cpu" value={5} max={10} width={10} />);
  expect(lastFrame()).toContain('cpu');
});

it('renders without any harness', () => {
  expect(renderToString(<Panel title="Latency" series={[1,5,2,9]} />)).toContain('Latency');
});
```

**The gotcha that will cost you an hour:** `stdin.write()` is **not applied
synchronously**. Verified on ink 7.1.1 — reading `lastFrame()` immediately after a
write returns the *previous* frame. Await a tick after every write:

```tsx
const tick = () => new Promise(r => setImmediate(r));

it('increments on +', async () => {
  const { lastFrame, stdin } = render(<Counter />);
  stdin.write('+');
  await tick();                       // REQUIRED
  expect(lastFrame()).toBe('Count: 1');
});
```

What to test, in priority order:

1. **Pure render functions** — exhaustively, including empty, single-element,
   flat, and out-of-range data. This is where the bugs are.
2. **Layout invariants** — every line the same width; output fits the terminal;
   no line exceeds `columns`. These catch the failures snapshots miss.
3. **Frame content** — `lastFrame()` contains what matters. Prefer `toContain`
   over full-string equality for anything with borders.
4. **Input behavior** — keystroke in, state change out (awaiting a tick).
5. **Full-frame snapshots** — last, and sparingly. They break on every cosmetic
   change and train people to accept diffs blindly.

```tsx
it('never exceeds the terminal width', () => {
  const out = renderToString(<Dashboard width={80} data={fixture} />);
  for (const line of out.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(80);
});
```

Test with awkward data as a matter of course: empty arrays, one point, all-equal
values, negatives, NaN, huge numbers, very long labels, emoji and CJK text.

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| Manual `' '.repeat()` alignment | `<Box width>` / flexbox |
| `str.length` for width | `stringWidth(str)` |
| Logic inside a component | pure function + thin component |
| `console.log` in a live UI | Ink state, or `<Static>` for append-only |
| Re-rendering the whole screen per event | throttle to ~10–20fps; `<Static>` for history |
| Color as the only signal | color **+** symbol/label |
| Hardcoded 80 columns | `useWindowSize()` |
| Spinner regardless of context | check `isTTY`; skip when piped |
| Hotkeys only in a help screen | inline hints + per-view footer |
| Full-frame snapshot tests | invariants + `toContain` |
| `stdin.write()` then assert | `stdin.write()`, `await tick()`, assert |

## Review checklist

- [ ] Rendering logic is pure and tested independently of React
- [ ] No `.length` used for terminal width anywhere
- [ ] Every variable-length text has an explicit `wrap`/truncate mode
- [ ] Layout holds at 80×24 and degrades deliberately below it
- [ ] `NO_COLOR`, `TERM=dumb`, and non-TTY are honored; no animation when piped
- [ ] Meaning never carried by color alone
- [ ] Current-view hotkeys visible; `?` help; `Ctrl-C` always exits
- [ ] `<Static>` used for append-only history
- [ ] High-frequency updates throttled
- [ ] Tests await a tick after `stdin.write()`
- [ ] Tested with empty, single, flat, negative, and wide-character data
