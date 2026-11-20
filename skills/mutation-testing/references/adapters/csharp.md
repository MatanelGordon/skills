# C# adapter — Stryker.NET

Official docs: <https://stryker-mutator.io/docs/stryker-net/getting-started/>
and <https://stryker-mutator.io/docs/stryker-net/configuration/>.

## Compatibility and setup

Use Stryker.NET 5.1.0 (requires .NET 10 to execute):

```bash
dotnet tool install dotnet-stryker --version 5.1.0 --tool-path .mutation-tools
dotnet tool list --tool-path .mutation-tools
```

`--version` is project/dashboard metadata in this release; it is not the tool
version check. Tool manifests/config changes stay in the disposable worktree.

## Scope and run

Run from the test project directory so project-relative paths are honest. Use
native Git scoping against the exact merge base:

```bash
cd tests/App.Tests
../../.mutation-tools/dotnet-stryker \
  --since:<merge-base> \
  --reporter json \
  --output ../../.mutation-tmp/discovery
```

For TUnit or xUnit v3 add `--test-runner mtp` and report that MTP support is
preview. If a targeted proof needs a span, use a test-project-relative source
pattern such as:

```bash
../../.mutation-tools/dotnet-stryker \
  --mutate '../../src/App/Calculator.cs{42..42}' \
  --reporter json --output ../../.mutation-tmp/targeted
```

`--since` is native diff selection; `--mutate` is explicit project-relative
scope. Native `NoCoverage` is undetected/actionable, timeout detected with a
spot check, compile/runtime errors excluded, `Ignored` out of scope, and
`Pending` incomplete.
