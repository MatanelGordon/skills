# Diagrams for the review file

A diagram earns its place when it shows a relationship that a sentence
cannot: before and after, a flow, who owns what, the order of phases. One idea
per diagram. The first one always answers "what changes?".

## How it must be delivered

- One file per diagram: `.plan/<name>/diagrams/<short-name>.svg`.
- Linked from `review.md` as `![what it shows](diagrams/<short-name>.svg)`.
  Never paste `<svg>` into the Markdown: GitHub removes it.
- One file serves light and dark themes: it paints its own background and
  swaps its palette under `prefers-color-scheme`. Do not make a second file.
- Self-contained: no `<script>`, no `<foreignObject>`, no images, fonts or
  `@import` from the network.

## Skeleton: copy it, then replace the shapes

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 232" role="img" aria-labelledby="t d">
  <title id="t">Login before and after the rate limiter</title>
  <desc id="d">Today the form calls the password check directly. After this plan a limiter sits between them and counts failures in Redis.</desc>
  <style>
    .bg { fill: #ffffff; }
    .zone { fill: none; stroke: #d1d9e0; stroke-dasharray: 4 4; }
    .card { fill: #f6f8fa; stroke: #d1d9e0; }
    .new { fill: #ddf4ff; stroke: #0969da; }
    .gone { fill: none; stroke: #818b98; stroke-dasharray: 6 4; }
    .ask { fill: #fff8c5; stroke: #9a6700; }
    .ink { fill: #1f2328; }
    .muted { fill: #59636e; }
    .wire { fill: none; stroke: #818b98; stroke-width: 1.5; }
    .tip { fill: #818b98; }
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-size: 14px; }
    .small { font-size: 12px; }
    .caps { font-size: 11px; font-weight: 600; letter-spacing: .08em; }
    .strong { font-weight: 600; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #0d1117; }
      .zone { stroke: #3d444d; }
      .card { fill: #151b23; stroke: #3d444d; }
      .new { fill: #121d2f; stroke: #4493f8; }
      .gone { stroke: #656c76; }
      .ask { fill: #272115; stroke: #d29922; }
      .ink { fill: #f0f6fc; }
      .muted { fill: #9198a1; }
      .wire { stroke: #656c76; }
      .tip { fill: #656c76; }
    }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
      <path class="tip" d="M0 0 L8 4 L0 8 Z"/>
    </marker>
  </defs>
  <rect class="bg" width="720" height="232" rx="8"/>

  <text class="muted caps" x="24" y="36">TODAY</text>
  <rect class="card" x="24" y="48" width="152" height="48" rx="8"/>
  <text class="ink" x="100" y="77" text-anchor="middle">Login form</text>
  <path class="wire" d="M176 72 H532" marker-end="url(#arrow)"/>
  <rect class="card" x="536" y="48" width="160" height="48" rx="8"/>
  <text class="ink" x="616" y="77" text-anchor="middle">Password check</text>

  <text class="muted caps" x="24" y="132">AFTER THIS PLAN</text>
  <rect class="card" x="24" y="144" width="152" height="48" rx="8"/>
  <text class="ink" x="100" y="173" text-anchor="middle">Login form</text>
  <path class="wire" d="M176 168 H276" marker-end="url(#arrow)"/>
  <rect class="new" x="280" y="144" width="152" height="48" rx="8"/>
  <text class="ink strong" x="356" y="165" text-anchor="middle">Rate limiter</text>
  <text class="muted small" x="356" y="182" text-anchor="middle">5 fails, then lock</text>
  <path class="wire" d="M432 168 H532" marker-end="url(#arrow)"/>
  <rect class="card" x="536" y="144" width="160" height="48" rx="8"/>
  <text class="ink" x="616" y="173" text-anchor="middle">Password check</text>

  <rect class="new" x="24" y="208" width="12" height="12" rx="3"/>
  <text class="muted small" x="44" y="219">new in this plan</text>
</svg>
```

## Rules

1. **Canvas.** `viewBox` is 720 wide; the height is what the content needs,
   usually 160 to 420. Change the height in `viewBox` and in the `.bg`
   rectangle together. Keep the corners and sizes of boxes and zones on a grid
   of 8; text baselines and arrow ends follow from them.
2. **Text fits its box.** Allow 8 units per character at 14px and 7 at 12px,
   plus 24 of padding: a 152-wide box holds 16 characters of 14px text. A
   longer label gets a wider box or a second line in `.muted .small`, 17 units
   lower. Centre labels with `text-anchor="middle"` at the box's middle x.
3. **Labels are names from the plan,** one to three words: a file, a
   component, a phase. A `.small` second line may add four words. No
   sentences inside boxes.
4. **Seven boxes at most,** not counting zones. To show structure, group
   boxes inside a `.zone` rectangle with a `.caps` label. More than seven:
   draw a second diagram.
5. **One reading direction,** left to right or top to bottom. Arrows follow
   it, stay horizontal or vertical, do not cross, and stop 4 units short of
   the box they point at. Label an arrow only when the relation is not obvious.
6. **Colour means something or is absent.** `.new`: added or changed by this
   plan. `.gone`: removed by it. `.ask`: an open question, labelled with its
   `Q` id. Everything else is `.card`. Colour picks out the few: when most
   boxes would be `.new`, make them all `.card` and drop the legend. Keep a
   legend line for each colour you used. Leave the style block as it is. No
   gradients, shadows, icons or emoji.
7. **Say it in words too.** `<title>` names the diagram. `<desc>` is one or
   two sentences a reader could use instead of the picture. The alt text in
   the Markdown link repeats the title.
8. **Write it as strict XML.** For special characters use `&amp;`, `&lt;`,
   `&gt;` or a numeric reference such as `&#8594;`; `&nbsp;` and other HTML
   names break the file. Quote every attribute value. Link with plain `href`,
   not `xlink:href`, which needs a namespace declaration of its own.
9. **Look at it.** Open the file in a browser, or take a headless-browser
   screenshot, when you can. Otherwise re-read the numbers: no box overlaps
   another, no label is wider than its box, and nothing lies outside the
   `viewBox`.

For the visual standard behind these rules (one dominant idea, an obvious
reading order, grouping, restraint), read the `impeccable-lite` skill when it
is installed.
