# JavaScript/TypeScript adapter — StrykerJS

Official documentation:
<https://stryker-mutator.io/docs/stryker-js/configuration/>,
<https://stryker-mutator.io/docs/stryker-js/parallel-workers/>, and
<https://stryker-mutator.io/docs/stryker-js/vitest-runner/>

## Compatibility and setup

Use these audited compatible pins for the executable fixture:

```text
Node >=22.22.2 for the audited lock (Stryker itself requires Node >=22)
@stryker-mutator/core 10.1.1
@stryker-mutator/vitest-runner 10.1.1
vitest 5.1.1
```

Re-check official peer requirements before selecting versions in another
project. Install only in the disposable worktree or use an already approved
project dependency. Never return package or lockfile changes as mutation
remediation.

## Scope and run

Stryker's `mutate` setting accepts file globs and exact line/column ranges. Use
the narrowest stable changed-production selection:

```json
{
  "testRunner": "vitest",
  "mutate": ["src/calculator.js:8:1-8:80"],
  "reporters": ["clear-text", "json"],
  "jsonReporter": { "fileName": ".mutation-tmp/mutation.json" },
  "cleanTempDir": "always"
}
```

Run from the disposable project root:

```bash
npx stryker run .mutation-tmp/stryker.config.json
```

The Vitest runner uses per-test coverage and normally runs only related tests
for each mutant. Stryker owns worker concurrency; Vitest runs serially inside a
worker. Keep `inPlace` disabled and prefer native workers before agent lanes.

## Evidence and limits

Retain the JSON mutation-testing-elements report and hash it before triage.
Fixed ports, databases, files, or shared global state can falsely kill mutants;
isolate them or reduce concurrency. For a survivor, restore clean production,
add a public test, rerun clean Vitest, then target the same mutant/location and
prove it is killed.
