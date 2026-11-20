# Edge-case lenses

Apply only lenses relevant to the final diff. The goal is a compact set of
meaningful behavioral tests, not a combinatorial checklist.

| Lens | Questions | Strong evidence |
|---|---|---|
| Branches | Which new conditions, fallbacks, or short circuits can choose the wrong path? | One case on each semantically distinct side |
| Boundaries | What happens at exactly zero, one, maximum, empty, full, first, last, before, and after? | On-boundary plus nearest meaningful neighbor |
| Invariants | Which relationship must remain true across operations or states? | State transition that would violate it under a small fault |
| Partial failure | What if the second of several effects fails? | Observable rollback, retry, or durable partial-state contract |
| Retry/idempotency | Can the same message or request happen twice? | Duplicate produces the documented single or repeated effect |
| Concurrency/order | Can events interleave, arrive late, or reorder? | Deterministic schedule that distinguishes valid outcomes |
| Serialization | What information can be lost, rounded, defaulted, or renamed? | Round-trip at a semantic boundary |
| Persistence | What survives restart, transaction boundaries, or stale reads? | Re-open or re-read through the real persistence seam |
| Integration seam | Which assumption crosses process, protocol, filesystem, clock, or network boundaries? | Contract test using the narrowest real boundary |
| Resource limits | What happens at bounded capacity, timeout, cancellation, or cleanup? | Limit reached and resource released or error surfaced |

## Selection rule

Rank candidates by:

1. user or data impact if wrong;
2. likelihood introduced by the actual implementation shape;
3. absence of existing behavioral proof;
4. determinism and maintenance cost.

Add the smallest case that distinguishes correct from plausibly faulty behavior.
If two cases catch the same defect and assert the same contract, keep one.
