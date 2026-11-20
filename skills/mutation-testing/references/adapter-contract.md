# Mutation adapter contract

Read one language adapter after selecting an explicit project root. Multiple
ecosystems are separate scopes; do not infer a monorepo-wide command.

## Inputs

- frozen commit and merge base, or a user-named standalone scope;
- changed production paths/lines and clean test command;
- runtime, runner, and pinned engine version;
- isolated resource configuration; and
- wall-clock and mutant budgets with an owner-approved stop time.

## Required evidence

1. Confirm the runtime, runner, executable, and pinned engine version.
2. Run the unmutated baseline and stop if red.
3. Record native diff/file/function/range scope; disclose broader fallback scope.
4. Prefer engine-native workers before extra agent lanes.
5. Retain and hash the raw machine artifact before triage.
6. Keep the raw label and engine meaning separate from workflow decisions.
7. After remediation, run clean code and the exact mutant when supported;
   otherwise use the narrowest reproducible selector and match location/type.
8. Rerun the accepted combined scope after any imported tests.

## Engine truth and workflow decisions

| Native meaning | Typical raw evidence | Workflow decision |
|---|---|---|
| detected | killed/caught; timeout where the engine counts it detected | verified; timeouts are visible and spot-checked |
| undetected | survived/lived/no coverage/no tests | actionable survivor unless evidenced equivalent |
| excluded | compile error/unviable/runtime-invalid mutant | resolved and counted; no remediation required |
| out of scope | ignored/diff-skipped/explicit filter | resolved and counted outside selected scope |
| pending | pending/not checked/interrupted/unrun | incomplete |

A red baseline, harness-wide failure, missing report, or exhausted budget also
makes the run incomplete. A timeout is not a kill label; it retains its native
label even where the engine counts it as detected. A human equivalent decision
requires a rationale and independent reviewer and never rewrites raw evidence.

Use the classifier for audited status mappings:

```bash
node <mutation-testing-skill-dir>/scripts/mutation-protocol.mjs classify \
  --engine cargo-mutants --status Unviable --mutant 12 --location src/lib.rs:8
```

## Concurrency

One coordinator owns scope and the final report. Native workers are the default.
Additional lanes are optional and require disjoint source scopes, test/fixture
ownership, isolated resources, and a predicted saving larger than duplicated
setup. Merge raw reports before assigning remediation.

