# Rust adapter — cargo-mutants

Official documentation: <https://mutants.rs/in-diff.html> and
<https://mutants.rs/mutants-out.html>

## Compatibility and setup

Use cargo-mutants 27.1.0 as the audited baseline and confirm the current crate
release before pinning:

```bash
cargo install cargo-mutants --version 27.1.0 --locked --root .mutation-tools
```

Keep the tool install and generated output outside candidate test commits.

## Diff scope and run

Create a stable diff file from the intended merge base and frozen commit, then
pass it explicitly:

```bash
git diff --unified=0 <merge-base> <frozen-head> -- '*.rs' > .mutation-tmp/change.diff
.mutation-tools/bin/cargo-mutants \
  --in-diff .mutation-tmp/change.diff \
  --output .mutation-tmp/mutants.out
```

The diff filter chooses mutants in changed regions. Record any dependency or
macro expansion that makes the effective scope wider. Use cargo-mutants' own
parallelism before agent sharding.

## Evidence and limits

Retain `outcomes.json` and the native missed, caught, timeout, and unviable
artifacts. Map missed to survivor and caught to killed without changing the raw
label. Timeout is incomplete. Unviable needs evidence before it can be treated
as an invalid mutant. For remediation, restore clean sources, add a behavioral
test, and use cargo-mutants' narrowest selector available for the recorded
mutant. If it cannot address one mutant, rerun the smallest file/name scope and
match the same location/type outcome.
