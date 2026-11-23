# Migration: orders database from MySQL 5.7 to Postgres 16

- 14 tables. About 40M rows in `orders` and 6M in `customers`; the rest are small.
- Three services read these tables: `checkout`, `billing` and `reports`.
- Money columns are `DECIMAL(10,2)` in MySQL; the target is `NUMERIC(12,2)`.
- Two legacy tables (`refunds`, `adjustments`) store dates as local-time strings.
- Cutover window: Sunday 02:00 to 04:00 UTC. Rollback must stay possible until 04:00.
- Tools on hand: `pgloader`; `scripts/rowcount.sh <table>` prints the MySQL and Postgres row counts and exits non-zero if they differ; `scripts/checksum.sh <table>` does the same for a content checksum.
