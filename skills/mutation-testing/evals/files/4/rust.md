# Rust adapter — cargo-mutants

Official docs: <https://mutants.rs/in-diff.html> and
<https://mutants.rs/mutants-out.html>.

## Compatibility and setup

Use cargo-mutants 27.1.0:

```bash
cargo install cargo-mutants --version 27.1.0 --locked --root .mutation-tools
.mutation-tools/bin/cargo-mutants mutants --version
```

The direct binary still requires the `mutants` cargo subcommand token.

## Diff scope and run

```bash
mkdir -p .mutation-tmp
git diff --unified=0 <merge-base> <frozen-head> -- '*.rs' > .mutation-tmp/change.diff
.mutation-tools/bin/cargo-mutants mutants \
  --in-diff .mutation-tmp/change.diff \
  --output .mutation-tmp/discovery
```

`--output` creates `mutants.out` inside the named directory, so retain
`.mutation-tmp/discovery/mutants.out/outcomes.json`. For targeted proof use the
narrowest audited selector, for example:

```bash
.mutation-tools/bin/cargo-mutants mutants --re '<mutant name>' \
  --output .mutation-tmp/targeted
# or scope a file with --file '<path>'
```

`CaughtMutant` is detected, `MissedMutant` undetected/actionable, `Unviable`
excluded, and timeout detected but spot-checked. In-file `#[cfg(test)]` edits
cannot return through the path-based import guard; add them before the freeze in
the normal reviewed workflow.
