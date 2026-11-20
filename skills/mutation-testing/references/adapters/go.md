# Go adapter — Gremlins

Official docs: <https://gremlins.dev/latest/> and
<https://gremlins.dev/latest/usage/commands/unleash/>.

## Compatibility and setup

Use Gremlins 0.6.0. It is pre-1.0 and large modules can take hours, so require
explicit time/mutant budgets.

```bash
go install github.com/go-gremlins/gremlins/cmd/gremlins@v0.6.0
gremlins --version
```

`version` is not a subcommand; Cobra exposes the root `--version` flag.

## Diff scope and run

```bash
mkdir -p .mutation-tmp
gremlins unleash \
  --diff <merge-base> \
  --workers <native-worker-count> \
  --output .mutation-tmp/gremlins.json
```

Confirm the base is the exact frozen scope. Add narrower package/mutation-type
selection when useful. Diff-scoped `SKIPPED` mutants are out of scope, not
incomplete. `KILLED` and timeout are detected, `LIVED` and `NOT COVERED` are
undetected/actionable, `NOT VIABLE` is excluded. Gremlins has no documented
portable single-mutant selector; targeted proof uses the narrowest package,
diff, and mutation-type scope, then matches the same location/type in JSON.
