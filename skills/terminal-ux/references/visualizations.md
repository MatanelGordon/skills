# Terminal visualization recipes

All implementations below are verified working (ink 7.1.1, Node 24) and unit
tested. Keep them as pure functions — no React — so they can be tested, reused for
`--json`/log output, and property-tested.

## Character palettes

```ts
export const BLOCKS   = [' ','▁','▂','▃','▄','▅','▆','▇','█'] as const; // 8 vertical levels
export const SHADES   = [' ','░','▒','▓','█'] as const;                  // 4 density levels
export const HALVES   = ['▀','▄'] as const;                              // 2 rows per cell
export const BOX      = { h:'─', v:'│', tl:'┌', tr:'┐', bl:'└', br:'┘' } as const;
export const ROUND    = { tl:'╭', tr:'╮', bl:'╰', br:'╯' } as const;
```

Braille occupies `U+2800`–`U+28FF`: each cell is a **2×4 dot matrix**, 8 dots, so
one cell addresses 8 independent points — the densest pure-text plotting available.

## Sparkline — trend in one line

```ts
export const sparkline = (values: readonly number[]): string => {
  if (values.length === 0) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;                 // flat series must not divide by zero
  return values
    .map(v => BLOCKS[Math.round(((v - min) / span) * (BLOCKS.length - 1))]!)
    .join('');
};
```

Auto-scales to its own min/max. For comparable sparklines across panels, pass a
shared domain instead of deriving per-series — otherwise two charts with wildly
different magnitudes look identical.

## Horizontal bar — magnitude comparison

```ts
export const hbar = (value: number, max: number, width: number): string => {
  const ratio = max === 0 ? 0 : Math.max(0, Math.min(1, value / max));  // clamp + guard
  const full = Math.floor(ratio * width);
  const rem = Math.round((ratio * width - full) * 8);
  const partial = rem > 0 ? BLOCKS[rem]! : '';
  return ('█'.repeat(full) + partial).padEnd(width, ' ');
};
```

Partial blocks give 8× the resolution of whole cells — a 20-cell bar resolves 160
steps. The result is **always exactly `width` cells**, which is what keeps a column
of bars aligned; assert that in tests.

## Braille plot — precise curves and scatter

```ts
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];

export const braille = (
  points: readonly (readonly [number, number])[],
  w: number,
  h: number,
): string[] => {
  const cols = Math.ceil(w / 2), rows = Math.ceil(h / 4);
  const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;     // drop out-of-range
    grid[Math.floor(y / 4)]![Math.floor(x / 2)]! |= DOT[y % 4]![x % 2]!;
  }
  return grid.map(r => r.map(c => String.fromCharCode(0x2800 + c)).join(''));
};
```

`w`/`h` are in **dots**, not cells: output is `ceil(w/2)` columns by `ceil(h/4)`
rows. To plot a series, first map data space → dot space:

```ts
export const seriesToDots = (
  values: readonly number[], w: number, h: number,
): [number, number][] => {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => [
    Math.round((i / Math.max(1, values.length - 1)) * (w - 1)),
    h - 1 - Math.round(((v - min) / span) * (h - 1)),      // invert: row 0 is top
  ]);
};
```

Braille dots within a cell can't have independent colors — the whole cell takes
one style. If you need multi-series color, use separate rows or fall back to
blocks.

## Heatmap

```ts
export const heat = (v: number, min: number, max: number): string => {
  const t = max === min ? 0 : (v - min) / (max - min);
  return SHADES[Math.min(SHADES.length - 1, Math.floor(t * SHADES.length))]!;
};
```

Shade blocks work without color and survive `NO_COLOR`. When color *is* available,
`<Text backgroundColor>` on a space gives a full-cell block; keep the shade version
as the fallback rather than a second code path.

## Progress

```ts
export const progress = (done: number, total: number, width: number): string => {
  const pct = total === 0 ? 0 : done / total;
  return `${hbar(done, total, width)} ${String(Math.round(pct * 100)).padStart(3)}%`;
};
```

Show a percentage *and* a bar — the bar reads at a glance, the number is precise.
Add ETA only when the estimate is stable; a jittering ETA is worse than none.
Indeterminate work gets a spinner, never a fake-progress bar.

## Aligned tables

```ts
import stringWidth from 'string-width';

export const column = (rows: readonly string[][], widths: readonly number[]): string[] =>
  rows.map(cells =>
    cells.map((c, i) => {
      const w = widths[i]!;
      if (stringWidth(c) <= w) return c + ' '.repeat(w - stringWidth(c));
      let out = '', used = 0;                       // truncate by display width
      for (const ch of c) {
        const cw = stringWidth(ch);
        if (used + cw > w - 1) break;
        out += ch; used += cw;
      }
      return out + '…' + ' '.repeat(Math.max(0, w - used - 1));
    }).join(' '),
  );
```

Iterate by code point (`for...of`), measure with `string-width`, never `.length`.
For anything beyond simple columns, prefer nested `<Box>` and let Yoga align it.

## Choosing a technique

| Question the reader has | Use |
|---|---|
| Is it going up or down? | sparkline |
| Which is biggest? | horizontal bars, sorted |
| What is the exact shape? | braille plot |
| Where are the hot spots? | heatmap |
| How far along? | progress bar + % |
| What are the values? | table |

Match density to the space: one line → sparkline; a panel → bars or braille; a
full screen → braille with axes and labels.

## Composing a dashboard

```tsx
<Box flexDirection="column" gap={1}>
  <Box gap={2}>
    <Panel title="Requests/s" series={rps} />
    <Panel title="p99 latency" series={p99} />
  </Box>
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold>Workers</Text>
    {workers.map(w => <Gauge key={w.id} label={w.id} value={w.load} max={100} />)}
  </Box>
  <Static items={events}>{e => <Text key={e.id} dimColor>{e.line}</Text>}</Static>
</Box>
```

Give every panel a fixed or flex-derived width so the layout doesn't jump when
data changes length — a dashboard that reflows on every tick is unreadable. Right-
align numbers (`padStart`) so digits line up.
