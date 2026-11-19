# Mutation adapter contract

Every language adapter supplies the same evidence. Read the chosen language
file under `adapters/` for commands and engine-specific limitations.

## Inputs

- frozen green commit and merge base;
- changed production paths and lines;
- explicit project root when multiple manifests exist;
- clean test command and supported runner;
- wall-clock and mutant budgets;
- isolated resource configuration;
- compatible engine version selected from its current official documentation.

## Required phases

1. **Compatibility check** — report runtime, test runner, engine version, and
   whether the combination is stable, preview, or unsupported.
2. **Clean baseline** — run the unmutated suite and stop if it is not green.
3. **Changed scope** — configure exact files or diff lines where supported;
   record any unavoidable broader scope.
4. **Native run** — prefer the engine's worker pool before agent sharding.
5. **Machine artifact** — retain the raw JSON or native outcome files and hash
   them before triage.
6. **Normalization** — copy engine status into the shared raw field unchanged.
7. **Targeted proof** — after a test change, run clean code and the exact mutant
   when supported. Otherwise rerun the narrowest reproducible location/type
   scope and verify the same native mutant location/type no longer survives.
8. **Combined rerun** — rerun the accepted scope after integration.

## Shared statuses

Map only to these normalized completion classes:

| Engine evidence | Completion class |
|---|---|
| killed/caught | verified |
| survived/lived | actionable-survivor pending separate triage |
| no coverage | incomplete |
| timeout | incomplete |
| compile/unviable/runtime/harness error | incomplete until disposition is evidenced |
| skipped/unrun/budget-exhausted | incomplete |

The raw engine label remains alongside the normalized class. Human triage never
replaces it.

## Concurrency

One coordinator owns scope and the final report. Native workers are the default.
Additional lanes require:

- disjoint projects or behavior clusters;
- disjoint test and fixture paths;
- isolated ports, databases, files, caches, and services;
- a measured or estimated saving larger than duplicated setup;
- at most three lanes;
- one merged report before assigning remediation.

If ownership overlaps, merge the clusters or run them serially.
