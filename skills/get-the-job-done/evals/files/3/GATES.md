# Gates: tenant migration

- [x] Migration 0042 applies cleanly to an empty database
      CHECK: ./scripts/migrate.sh --fresh --to 0042
      EVIDENCE: 2026-11-10, exit 0, 42 migrations applied
- [x] Migration 0042 has a down script
      CHECK: test -s migrations/0042_add_tenant_id.down.sql
      EVIDENCE: 2026-11-10, exit 0
- [x] No code under src/ still reads orders.customer_ref
      CHECK: ! grep -rn "customer_ref" src/
      EVIDENCE: 2026-11-10, exit 0, no matches
- [ ] Backfill of the 2M-row snapshot finishes in under 10 minutes
      CHECK: ./scripts/time-backfill.sh snapshots/2m.sql --max-seconds 600
