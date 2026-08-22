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

Everything that computes text lives in a pure function; components only place it.

```ts
// chart.ts — pure, no React, trivially testable
const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

export const sparkline = (values: readonly number[]): string => {
  if (values.length === 0) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
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

This split makes visualization testable without terminal, reusable for `--json`,
logs, or snapshots.

## Layout

`<Box>` is a flex container (Yoga). Props: `flexDirection`, `flexGrow`/`flexShrink`/
`flexBasis`, `justifyContent`, `alignItems`, `alignSelf`, `gap`/`rowGap`/
`columnGap`, `width`/`height` (number or `"50%"`), `min/maxWidth`, `min/maxHeight`,
`padding*`, `margin*`, `display`, `borderStyle`/`borderColor`/`borderDimColor`
(per-side `borderTop*`, `borderLeft*`, …), `backgroundColor`, `overflow`.

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
`measureElement(ref)` reports rendered size when computing against real dimensions.

**Terminal size:** `useWindowSize()` gives `{columns, rows}` and updates on resize.
Design for ~80×24 floor; decide explicitly what degrades: drop columns, shorten
labels, or show "terminal too small" — never let content wrap into garbage.

**Text overflow:** `<Text wrap>` accepts `wrap` (default), `truncate`,
`truncate-start`, `truncate-middle`, `truncate-end`. Choose deliberately for
every variable-length text; unbounded content in fixed box is the most common
TUI layout bug.

## Width: the wide-character trap

`"🎉".length === 2` and `"日".length === 1`, but both occupy **2 terminal columns**.
Any padding/truncation/box-drawing with `.length` will misalign.

Ink handles this correctly inside `<Box>`/`<Text>` — bordered boxes containing
`日本語テスト` and `🎉🎉🎉` align perfectly. **But your pure functions don't.**
If you pad or truncate manually:

```ts
import stringWidth from 'string-width';

const padTo = (s: string, w: number): string =>
  s + ' '.repeat(Math.max(0, w - stringWidth(s)));
```

Prefer letting `<Box width>` do the work.

## Input & focus

`useInput((input, key) => { ... })` handles keystrokes. `key` has `return`,
`escape`, `tab`, `backspace`, `delete`, `up`/`down`/`left`/`right`, `pageup`/
`pagedown`, `home`/`end`, `ctrl`, `shift`, `meta`. Check `key.ctrl && key.key
=== 'c'` for Ctrl-C.

Focus: `useFocus({ autoFocus: true })` on one component; `focus.next()` /
`focus.previous()` for tab order. Only one component focused at a time.

## Colors & themes

Ink uses chalk colors: `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`,
`white`, `gray`, `dimColor`, `bold`, `italic`, `underline`, `strikethrough`,
`inverse`. Hex: `color="#ff6b6b"`. Background: `backgroundColor`.

**Themes:** `<ThemeProvider>` with `default` and `dark` maps. Always define both.

**`NO_COLOR` and `TERM=dumb`:** Ink respects these automatically — no color
output when set. Your pure functions must too: check `process.env.NO_COLOR` or
`ink`'s `useTheme()` before emitting ANSI.

**Color is information:** never sole signal. Pair with symbol/label:
`●` success, `○` pending, `✕` error — not just green/yellow/red.

## Static vs dynamic content

`<Static>` renders once and never re-renders — use for append-only logs, history,
completed items. Everything inside `<Static>` is final; new items append below.
Don't put changing content in `<Static>`.

```tsx
<Box flexDirection="column">
  <Static items={logs.map(l => <LogLine key={l.id} {...l} />)} />
  <LiveDashboard data={liveData} />
</Box>
```

## Performance

- `<Static>` for append-only — avoids Ink diffs/repaints; full-screen re-render
  at high frequency flickers and burns CPU.
- Throttle high-frequency data to ~10–20 fps before state. Terminals can't show
  more; per-event re-render is usual sluggish TUI cause.
- Memoize expensive pure renders (`useMemo`) keyed on data, not frame.

## Accessibility

Terminals have no accessibility tree/ARIA. Compensate deliberately:

- `useIsScreenReaderEnabled()` — when true, prefer plain sequential text over
  boxes, spinners, redrawing regions.
- Offer `--plain` / `--no-animation` disabling borders, spinners, cursor movement.
  Screen readers re-read regions that repaint.
- Never rely on color, position, or ASCII art alone for state.
- Everything reachable by keyboard, with visible focus.

## CLI conventions this sits inside

A TUI is one mode of program also having non-interactive mode. Follow `clig.dev`:

- Primary output to **stdout**, messages/errors to **stderr**.
- **Only go interactive when stdin is a TTY**; support `--no-input`. Never hang
  waiting for input that cannot come.
- Provide `--json` / `--plain` for machine consumption — TUI not only way to
  get data.
- Print something within ~100ms; show progress past ~1s.
- `Ctrl-C` exits immediately; print what's happening if cleanup takes time.
- Exit 0 on success, non-zero on failure.

---

## Testing

Full patterns in `references/testing.md`. Essentials:

```tsx
import { render, cleanup } from 'ink-testing-library';
import { renderToString } from 'ink';

afterEach(() => cleanup());

it('renders label and bar', () => {
  const { lastFrame } = render(<Gauge label="cpu" value={5} max={10} width={10} />);
  expect(lastFrame()).toContain('cpu');
});

it('renders without harness', () => {
  expect(renderToString(<Panel title="Latency" series={[1,5,2,9]} />)).toContain('Latency');
});
```

**Gotcha:** `stdin.write()` is **not applied synchronously**. Verified on ink
7.1.1 — reading `lastFrame()` immediately after write returns *previous* frame.
Await a tick after every write:

```tsx
const tick = () => new Promise(r => setImmediate(r));

it('increments on +', async () => {
  const { lastFrame, stdin } = render(<Counter />);
  stdin.write('+');
  await tick();                       // REQUIRED
  expect(lastFrame()).toBe('Count: 1');
});
```

Test priority:

1. **Pure render functions** — exhaustively: empty, single, flat, out-of-range.
2. **Layout invariants** — every line same width; output fits terminal; no line
   exceeds `columns`. Catches failures snapshots miss.
3. **Frame content** — `lastFrame()` contains what matters. Prefer `toContain`
   over full-string equality for bordered output.
4. **Input behavior** — keystroke in, state change out (awaiting tick).
5. **Full-frame snapshots** — last, sparingly. Break on cosmetic changes.

```tsx
it('never exceeds terminal width', () => {
  const out = renderToString(<Dashboard width={80} data={fixture} />);
  for (const line of out.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(80);
});
```

Test with awkward data: empty arrays, one point, all-equal, negatives, NaN,
huge numbers, long labels, emoji and CJK text.

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| Manual `' '.repeat()` alignment | `<Box width>` / flexbox |
| `str.length` for width | `stringWidth(str)` |
| Logic inside component | pure function + thin component |
| `console.log` in live UI | Ink state, or `<Static>` for append-only |
| Re-rendering whole screen per event | throttle ~10–20fps; `<Static>` for history |
| Color as only signal | color **+** symbol/label |
| Hardcoded 80 columns | `useWindowSize()` |
| Spinner regardless of context | check `isTTY`; skip when piped |
| Hotkeys only in help screen | inline hints + per-view footer |
| Full-frame snapshot tests | invariants + `toContain` |
| `stdin.write()` then assert | `stdin.write()`, `await tick()`, assert |

## Review checklist

- [ ] Rendering logic pure and tested independently of React
- [ ] No `.length` used for terminal width anywhere
- [ ] Every variable-length text has explicit `wrap`/truncate mode
- [ ] Layout holds at 80×24 and degrades deliberately below it
- [ ] `NO_COLOR`, `TERM=dumb`, non-TTY honored; no animation when piped
- [ ] Meaning never carried by color alone
- [ ] Current-view hotkeys visible; `?` help; `Ctrl-C` always exits
- [ ] `<Static>` used for append-only history
- [ ] High-frequency updates throttled
- [ ] Tests await tick after `stdin.write()`
- [ ] Tested with empty, single, flat, negative, wide-character data
