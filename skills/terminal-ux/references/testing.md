# Testing Ink UIs

Verified against ink 7.1.1 · ink-testing-library 4.0.0 · vitest 4 · React 19 · Node 24.

## Setup

Ink is ESM-only and components are JSX, so the transform must be configured.
Vitest with the React plugin is the least friction:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['**/*.test.tsx'] },
});
```

```json
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "module": "esnext", "target": "es2022",
  "moduleResolution": "bundler", "strict": true, "skipLibCheck": true } }
```

`environment: 'node'` — not jsdom. Ink renders to a stream, not a DOM.

**Import gotcha:** Vite resolves `./x.js` → `./x.ts`, but **not** → `./x.tsx`.
Import component modules without the extension (`from './ui'`) or the test fails
with "Cannot find module".

## The API

```tsx
import { render, cleanup } from 'ink-testing-library';

const { lastFrame, frames, rerender, unmount, stdin, stdout, stderr } = render(<App />);
```

| | |
|---|---|
| `lastFrame()` | most recent rendered frame as a string |
| `frames` | array of every frame, in order |
| `rerender(tree)` | re-render with new props or a different component |
| `unmount()` | unmount |
| `stdin.write(data)` | feed input — **asynchronous, see below** |
| `stdout` / `stderr` | each with `lastFrame()` and `frames` |

Always `afterEach(() => cleanup())` — leaked instances keep timers alive and make
later tests flaky.

Ink also exports **`renderToString(tree)`**, which produces a frame with no test
harness at all. Best tool for static layout assertions:

```tsx
import { renderToString } from 'ink';
expect(renderToString(<Panel title="Latency" series={[1,5,2,9]} />)).toContain('Latency');
```

## The async input gotcha

`stdin.write()` does **not** apply synchronously. Verified behaviour:

| Pattern | Result |
|---|---|
| `stdin.write('+')` then `lastFrame()` | `'Count: 0'` — **stale**, input not applied |
| `stdin.write('+')`; `await tick()` | `'Count: 1'` ✓ |
| `stdin.write('+')`; `await vi.waitFor(...)` | `'Count: 1'` ✓ |

```tsx
const tick = () => new Promise(r => setImmediate(r));

it('increments on +', async () => {
  const { lastFrame, stdin } = render(<Counter />);
  stdin.write('+');
  await tick();
  expect(lastFrame()).toBe('Count: 1');
});

it('handles a sequence', async () => {
  const { lastFrame, stdin, frames } = render(<Counter />);
  for (const k of ['+', '+', '+']) { stdin.write(k); await tick(); }
  stdin.write('\u001B[B');          // down arrow
  await tick();
  expect(frames).toEqual(['Count: 0','Count: 1','Count: 2','Count: 3','Count: 2']);
});
```

Awaiting between writes is also what makes `frames` capture each intermediate
state; without it the whole burst collapses.

## Special keys

Write the raw escape sequence:

| Key | Sequence |
|---|---|
| Up / Down / Right / Left | `\u001B[A` / `\u001B[B` / `\u001B[C` / `\u001B[D` |
| Enter | `\r` |
| Escape | `\u001B` |
| Tab / Shift-Tab | `\t` / `\u001B[Z` |
| Backspace | `\b` or `\u007F` |
| Ctrl-C | `\u0003` |

Define them once as named constants — a test full of bare escape sequences is
unreadable, and a stray literal control character in source is easy to introduce
and hard to spot.

## Async component updates

`lastFrame()` is a synchronous snapshot; effects and timers have not necessarily
run.

```tsx
it('loads', async () => {
  const { lastFrame } = render(<Async />);
  expect(lastFrame()).toBe('loading');
  await vi.waitFor(() => expect(lastFrame()).toBe('ready'), { timeout: 1000 });
});
```

`vi.waitFor` polls, so it works for effects, promises, and timers alike. With fake
timers, advance them *and* yield to the microtask queue before asserting.

## What to test, in priority order

**1. Pure render functions — the highest-value tests.** No React, no harness,
instant. Cover empty, single element, all-equal, negative, out-of-range, huge:

```ts
it('handles a flat series without dividing by zero', () =>
  expect(sparkline([3,3,3])).toBe('   '));
it('handles empty input', () => expect(sparkline([])).toBe(''));
it('clamps out-of-range values', () => expect(hbar(50,10,5)).toBe('█████'));
```

**2. Layout invariants — what snapshots miss.** These catch real breakage without
being brittle:

```tsx
it('every line is the same width', () => {
  const out = renderToString(<Panel title="RPS" series={[1,2,3]} />);
  expect(new Set(out.split('\n').map(l => [...l].length)).size).toBe(1);
});

it('never exceeds the terminal width', () => {
  const out = renderToString(<Dashboard width={80} data={fixture} />);
  for (const line of out.split('\n')) {
    expect(stringWidth(line)).toBeLessThanOrEqual(80);
  }
});

it('bars stay aligned with wide characters', () => {
  const out = renderToString(<Gauge label="日本語" value={5} max={10} width={10} />);
  expect(new Set(out.split('\n').map(stringWidth)).size).toBe(1);
});
```

Property-test the pure functions where you can — "output is always exactly `width`
cells for any input" is a much stronger claim than three examples.

**3. Frame content.** Prefer `toContain` over equality for bordered output:

```tsx
expect(lastFrame()).toContain('cpu');
expect(renderToString(<Panel .../>)).toContain('╭');   // border actually drawn
```

**4. Input behaviour** — keystroke in, state change out (with `await tick()`).

**5. Full-frame snapshots — last, and sparingly.** They break on every cosmetic
change and train reviewers to approve diffs unread. Snapshot one or two
representative screens, not every component.

## Testing color

**By default, `lastFrame()` contains no ANSI codes at all.** Under a test runner
stdout is not a TTY, so Ink's color layer strips them. Verified:

```
render(<Text color="red" bold>danger</Text>).lastFrame()
  default        -> "danger"
  FORCE_COLOR=1  -> "\u001b[1m\u001b[31mdanger\u001b[39m\u001b[22m"
```

Two consequences, both of which bite:

- Asserting on escape codes **fails by default** - the codes are not there.
- `stripAnsi()` is a no-op by default. Harmless, but it is not what is protecting
  you; plain-text assertions already work.

`FORCE_COLOR` only adds codes where a style is actually applied. A plain
`<Text>Count: 0</Text>` stays exactly `"Count: 0"` even when forced, while a styled
one becomes `"\u001b[2mcpu\u001b[22m ... \u001b[31m\u2588\u2588\u2588\u2585\u001b[39m"`.
So enabling `FORCE_COLOR` breaks equality assertions only for the styled parts of
your output - a good reason to keep it off globally and turn it on in the one file
that tests color.

To test color you must opt in:

```ts
// vitest.config.ts - only if you actually assert on color
export default defineConfig({ test: { env: { FORCE_COLOR: '1' } } });
```

```ts
import stripAnsi from 'strip-ansi';

// with FORCE_COLOR=1
it('turns red past the threshold', () => {
  const { lastFrame } = render(<Gauge label="cpu" value={9} max={10} width={4} />);
  expect(lastFrame()).toContain('\u001B[31m');            // red
  expect(stripAnsi(lastFrame()!)).toContain('cpu');
});
```

Better still: do not assert on escape codes. Extract the decision into a pure
function and test that instead:

```ts
export const loadColor = (ratio: number) => (ratio > 0.8 ? 'red' : 'green');
expect(loadColor(0.9)).toBe('red');
```

Faster, readable, and it survives a palette change. Reserve `FORCE_COLOR`
assertions for the rare case where the escape output itself is the contract.

## Fixtures and awkward data

Keep a shared fixture set and run the visual components against all of it:

```ts
export const SERIES = {
  empty: [], single: [42], flat: [3,3,3], negative: [-5,0,5],
  huge: [1e9, 2e9], spiky: [1,1,1,999,1,1],
} as const;
```

Text fixtures: `''`, a very long unbroken string, `'日本語テスト'`, `'🎉🎉🎉'`,
a string containing ANSI codes. These are where terminal layout actually breaks.

## Testing the whole app

Extract everything below the entry point so the app can be constructed with
injected dependencies:

```tsx
const { lastFrame } = render(
  <App client={fakeClient} clock={() => new Date('2026-01-01')} />,
);
```

Inject the clock, the data source, and anything spawning processes. Never let a
test start a real engine, hit the network, or read the real terminal size — pass
`columns`/`rows` explicitly so layout tests are deterministic across machines.

## Flakiness checklist

- Missing `cleanup()` → leaked timers and cross-test interference
- Asserting immediately after `stdin.write()` → stale frame
- Real timers with real delays → slow and racy; use `vi.waitFor` or fake timers
- Depending on ambient terminal width → pass dimensions explicitly
- Snapshot tests over decorative output → break on every style tweak
- Asserting on raw ANSI when you meant to assert on text → use `strip-ansi`
