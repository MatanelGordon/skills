# CSV import: brief

`./scripts/import.sh <file.csv>` loads orders into the `orders` table of the local SQLite database `data/app.db`.

## What it has to do

1. A malformed row is rejected with a message that names the row number. It must not print a stack trace.
2. No debug logging (`console.debug`) is left anywhere under `src/`.
3. Importing the same file a second time adds no rows. `fixtures/orders.csv` holds 100 orders and the table starts empty.
4. Error messages read as friendly to someone who is not technical.

## Useful to know

- Tests live in `test/import/` and one file is run with `npm test -- <path>`.
- Row count: `sqlite3 data/app.db 'select count(*) from orders'`.
- Every user-facing error string is in `src/messages/errors.json`.
- There is no script that checks for duplicates yet.
