# Test-only import guard

The mutation worktree is disposable and never merged. A candidate test commit
may return only through this fail-closed sequence.

## Before integration

1. Identify the reviewed target commit and candidate parent.
2. Enumerate every changed path, including modes and symlink targets.
3. Allow only repository-approved test and fixture paths.
4. Reject production paths, generated output, snapshots unrelated to the
   behavior, runner configuration, manifests, dependency metadata, and lockfiles.
5. Reject every symlink, submodule, device, or other non-regular file.
6. Compare all nonallowed paths byte-for-byte with the reviewed target.
7. Run the candidate test on clean production code.
8. Run the targeted mutant proof and observe the new test fail for that fault.

9. Obtain focused approval from an independent reviewer for the public
   assertion, deterministic fixture, and test-only diff.

Run the Git-backed guard so it enumerates the trees itself rather than trusting
a caller-supplied file list:

```bash
node scripts/mutation-protocol.mjs git-import \
  --repo /absolute/repository/path \
  --approved <reviewed-ref> \
  --candidate <test-only-ref> \
  --allow 'tests/**' \
  --allow '**/*.test.js'
```

It fails on an empty candidate, unsafe/non-canonical path, deletion, rename,
mode change, symlink, submodule, runner/config/manifest/dependency change,
or any changed path outside the repository-specific test/fixture allowlist. The
metadata rule is deliberately conservative: manifest-shaped TOML, lock, project,
toolchain, requirements/constraints, and build files are rejected even under a
test directory. Hidden path segments and repository/editor/linter metadata are
also rejected because they can alter checkout or test behavior. Rename
legitimate fixture data to an explicitly non-metadata name before replaying it
on the reviewed head. Paths must also be portable: controls, non-NFC Unicode,
Windows-invalid characters/device names, trailing dot/space, and conservative
Unicode case-fold collisions across the entire candidate tree are rejected.

## Integration

Cherry-pick or replay the test-only commit onto the reviewed target. If any
conflict occurs:

```text
abort the cherry-pick → regenerate or replay on reviewed head → rerun every gate
```

Never hand-resolve a conflict from a mutation branch. Manual reconstruction can
silently import mutated code or invalidate the original proof.

## After integration

Rerun the path allowlist, file-type and symlink checks, nonallowed-path byte
comparison, clean suite, and targeted-mutant proof on the integrated target. Then
run the combined scoped mutation suite. Only this post-integration evidence
counts at the workflow join.
