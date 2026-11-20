# Test-only import guard

The mutation worktree/clone is disposable and never merged. A return candidate
must be exactly one non-merge commit whose parent is the frozen approved commit.
That makes the complete candidate history inspectable and prevents a branch that
mutated then restored production from replaying hidden commits.

## Validate

Run from any directory; `<mutation-testing-skill-dir>` is the installed skill
folder, not the user's repository:

```bash
node <mutation-testing-skill-dir>/scripts/mutation-protocol.mjs git-import \
  --repo /absolute/repository/path \
  --approved <frozen-reviewed-sha> \
  --integration <current-integration-ref> \
  --candidate <one-test-only-commit> \
  --allow 'tests/**' \
  --allow '**/*_test.go'
```

The current integration ref must still resolve to the approved SHA. The command
uses Git plumbing with replacement refs and inherited `GIT_*` selectors disabled,
and enumerates modes, object IDs, submodules, and every changed path. It rejects
production paths, deletions, type/mode changes, symlinks, submodules, new
executables, runner/dependency/build configuration, hidden/dependency paths,
unsafe names, portable collisions involving a changed path, unsupported globs,
and an empty candidate.

Allowed fixture/testdata paths may contain canonical data names such as
`package.json` or `.toml`; ordinary ecosystem test names such as
`config.test.js`, `test_config.py`, `config_test.go`, and `*Tests.cs` are valid.
The configuration-name filter is best effort. Repository-specific allow patterns
remain a reviewed trust boundary; use narrow paths. Supported syntax is literal
text plus `*` and `**`; `[`, `?`, `{}`, a leading `./`, and trailing `/` fail
with `INVALID_ALLOWLIST` instead of silently mis-matching.

Success requires both exit status 0 **and** JSON stdout containing `"ok": true`.
Never treat an empty stdout or exit status alone as approval. Failure writes JSON
to stderr and exits nonzero, including through a symlink-installed skill.

## Import paths, never history

Use the exact `candidate` and `changed` values from the success JSON:

```bash
git restore --source=<candidate-sha> --staged --worktree -- <changed-paths...>
git diff --quiet --no-ext-diff --no-relative --ignore-submodules=none \
  --no-renames <approved-sha> -- . ':(exclude,glob)tests/**'
```

Inspect, run clean tests and the targeted fault proof, then commit the restored
paths on the reviewed branch. Do not cherry-pick, merge, or replay candidate
history. A stale target or conflict means regenerate one new direct-child
candidate from the current reviewed head.

Run the guard again on the resulting one-commit import, then the clean suite and
targeted proof. Rust tests embedded in production files are outside this guard.

