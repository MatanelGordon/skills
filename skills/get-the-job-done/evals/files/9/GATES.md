# Gates: import pipeline

- [x] Malformed CSV is rejected with a row number, not a stack trace
      CHECK: npm test -- test/import/malformed.spec.ts
      EVIDENCE: 2026-11-16, exit 0
- [ ] Re-importing the same file is idempotent
      CHECK: npm test -- test/import/idempotent.spec.ts
- [ ] p95 import of the 50k fixture stays under 4s
      CHECK: ./scripts/bench-import.sh fixtures/orders-50k.csv --runs 20 --p95-max-ms 4000
- [x] No debug logging reaches the bundle
      CHECK: ! grep -rn "console.debug" src/
      EVIDENCE: 2026-11-16, exit 0, no matches
