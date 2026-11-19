# Go adapter — Gremlins

Official documentation: <https://gremlins.dev/latest/> and
<https://gremlins.dev/latest/usage/commands/unleash/>

## Compatibility and setup

Use Gremlins 0.6.0 as the audited baseline and re-check the current release
before pinning. Gremlins is pre-1.0 and large modules can take hours, so require
explicit time and mutant budgets.

```bash
go install github.com/go-gremlins/gremlins/cmd/gremlins@v0.6.0
gremlins version
```

The installation is an environment step, not a candidate repository change.

## Diff scope and run

Gremlins supports branch-diff selection and native workers:

```bash
gremlins unleash \
  --diff <merge-base> \
  --workers <native-worker-count> \
  --output .mutation-tmp/gremlins.json
```

Confirm that the chosen diff base denotes the exact frozen scope, especially in
repositories with merges. If needed, supply narrower package selection in
addition to `--diff`. Prefer Gremlins workers before extra subagents.

## Evidence and limits

Keep the JSON report with its raw `LIVED`, `NOT COVERED`, `TIMED OUT`, `KILLED`,
`NOT VIABLE`, and `SKIPPED` statuses. `LIVED` is a survivor. No coverage,
timeouts, skipped work, and budget exhaustion are incomplete. `NOT VIABLE`
requires review before invalid-mutant triage. Report partial runs honestly; do
not call an unfinished module clean. Gremlins does not document a portable
single-mutant selector; targeted proof therefore uses the narrowest package,
diff, and mutation-type scope available, then matches the same location/type
status in the new JSON report.
