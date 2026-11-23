# Session notes: moving orders from `orders_v1` to `orders_v2`

Branch `feat/orders-v2`. Planned to ship with Thursday's regular deploy.

## Done

- Created `orders_v2` with the new `currency` and `tax_cents` columns.
- Copied 4,812,330 rows from `orders_v1` to `orders_v2`. The copy took 41 minutes, off-peak.
- Row counts match (4,812,330 in both). Checksums over `id` and `total_cents` match.
- The app reads and writes `orders_v2` only. Nothing queries `orders_v1` any more: checked with a search of the code and 24 hours of query logs.
- Tests: 214 passed, 0 failed. The CI run went from 6m10s to 6m40s because of the new copy test.
- The nightly finance export now reads `orders_v2`. Last night's totals equal the totals from the night before the switch.
- The runbook called the rollback flag `ORDERS_USE_V1`. Corrected to its actual name, `ORDERS_READ_V1`.

## Still to do before Thursday

- Add `orders_v2` to the nightly backup verification job: one line in `ops/backup-verify.yaml`.

## Not settled: what happens to `orders_v1`

`orders_v1` is still in the production database and takes 18 GB. Nobody has asked for it to be kept or removed.

- The database disk is 500 GB and 81% full. The disk alert fires at 85%. The database grows about 5 GB a week.
- Leave it in place until `orders_v2` has run for 2 weeks: no work now. Going back to v1 stays quick: set `ORDERS_READ_V1` and replay the orders written since the switch with `scripts/replay_orders.py`, about 20 minutes in total.
- Drop it now: one statement, about 1 minute. Frees the 18 GB (disk down to 77%). After that the only way back to v1 is the nightly backup: about 3 hours to restore, with orders read-only during the restore.
- Dump it to object storage, then drop it: the dump takes about 40 minutes and storing it costs about $0.40 a month. Frees the same 18 GB. Going back means restoring the dump, about 1 hour.
