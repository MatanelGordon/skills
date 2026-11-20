# JavaScript/TypeScript adapter — StrykerJS

Official docs: <https://stryker-mutator.io/docs/stryker-js/configuration/> and
<https://stryker-mutator.io/docs/stryker-js/vitest-runner/>.

## Compatibility and setup

Audited pins:

- `@stryker-mutator/core@10.1.1` and `@stryker-mutator/vitest-runner@10.1.1`
  require Node `>=22.0.0`;
- `vitest@5.1.1` requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`.

In the disposable project root, use existing approved dependencies or install
without saving metadata:

```bash
npm install --no-save --ignore-scripts \
  @stryker-mutator/core@10.1.1 @stryker-mutator/vitest-runner@10.1.1 vitest@5.1.1
npx --no-install stryker run .mutation-tmp/stryker.config.json
```

Never return package/lock changes. `npx --no-install` prevents resolution to the
deprecated unscoped `stryker` package.

## Scope and proof

StrykerJS has no native Git-diff selector. Generate explicit changed file or
line/column `mutate` ranges and record that this is hand-derived scope:

```json
{
  "testRunner": "vitest",
  "mutate": ["src/calculator.js:8:1-8:80"],
  "reporters": ["clear-text", "json"],
  "jsonReporter": { "fileName": ".mutation-tmp/discovery.json" },
  "cleanTempDir": "always"
}
```

Keep `inPlace` disabled. Retain/hash each JSON report under a unique path. For
remediation, run clean Vitest, rerun the narrowest location/type selection, and
match the same mutant. Native `NoCoverage` is undetected/actionable; `Timeout`
is detected but visible and spot-checked; compile/runtime errors are excluded;
`Ignored` is out of scope; `Pending` is incomplete.

