# C# adapter — Stryker.NET

Official documentation:
<https://stryker-mutator.io/docs/stryker-net/getting-started/> and
<https://stryker-mutator.io/docs/stryker-net/configuration/>

## Compatibility and setup

Use Stryker.NET 5.1.0 as the audited baseline and re-check the official release
notes before pinning. This release requires the .NET 10 runtime to execute even
when the project targets an older framework.

```bash
dotnet tool install dotnet-stryker --version 5.1.0 --tool-path .mutation-tools
.mutation-tools/dotnet-stryker --version
```

Prefer an ephemeral tool path or an already approved tool manifest. Do not
return tool manifests or lock changes in a mutation test-only commit.

## Runner selection

- xUnit, NUnit, and MSTest normally use the VSTest runner.
- TUnit and xUnit v3 require `--test-runner mtp`.
- The Microsoft Testing Platform integration is preview. Preserve that fact in
  the report and spot-check suspicious results; MTP does not create different
  result categories.

## Scope and run

Stryker.NET `mutate` patterns support file globs and span filters. Generate a
temporary config outside the candidate commit or pass approved CLI options:

```bash
.mutation-tools/dotnet-stryker \
  --mutate 'src/**/*.cs' \
  --reporter json \
  --output .mutation-tmp/stryker-output
```

For TUnit or xUnit v3 add `--test-runner mtp`. Stryker.NET normally selects
covering tests and uses roughly half the logical processors. Use its native
concurrency before creating agent lanes.

## Evidence and limits

Retain the JSON report plus runtime, runner, target framework, mutation pattern,
and command. Treat timeout, no coverage, compile error, and preview-runner
anomalies as incomplete until evidenced. Restore production code before every
test edit and targeted proof.
