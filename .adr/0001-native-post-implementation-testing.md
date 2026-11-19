# Keep post-implementation testing native and agent-neutral

**Status:** accepted

We extend `development-workflow` with original `test-hardening` and
`mutation-testing` skills instead of installing PSTACK leaves or adopting its
router. The existing workflow remains the single authority across Codex,
Claude Code, Copilot, and Tabnine; native mutation engines supply deterministic
language behavior, while PSTACK is versioned design evidence only.

## Considered options

- Original local skills with selected principles folded into local contracts.
- Original skills plus installed external PSTACK leaves.
- PSTACK's router and playbooks as the new workflow foundation.

The Council selected the first option unanimously. External leaves split
operational truth and lifecycle ownership; the PSTACK router also conflicts
with the repository's TDD, planning, and dispatch policies.

## Constraints this creates

- `development-workflow` remains the sole top-level router.
- Borrowed ideas record the exact upstream revision, the local invariant they
  influenced, and an upstream re-review trigger.
- No PSTACK code or skill is vendored or required at runtime.
- Mutation branches are never merged. Only guarded, reviewed, test-only commits
  may be replayed or cherry-picked, and conflicts are aborted rather than
  hand-resolved.
- Raw mutation-engine results are immutable evidence; human triage is recorded
  separately.

## Revisit when

A cross-agent conformance run shows selected external leaves are
router-independent, behaviorally identical across every supported agent, and
safer or cheaper to maintain than the local contracts.
