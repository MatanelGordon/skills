# Gates: CSV order import

- [x] A malformed row is rejected with its row number, not a stack trace
      CHECK: pytest tests/test_import.py::test_malformed_row_reports_row_number
      EVIDENCE: 2026-11-17 10:42, exit 0
- [x] No debug print is left in the importer
      CHECK: ! grep -rn "print(" src/importer/
      EVIDENCE: 2026-11-17 10:50, exit 0, no matches
- [x] docs/import.md documents the command and its exit codes
      CHECK: test -s docs/import.md && grep -q "Exit codes" docs/import.md
      EVIDENCE: 2026-11-17 11:15, exit 0
- [ ] Importing the same file twice creates no duplicate rows
      CHECK: ./scripts/import.sh fixtures/orders.csv && ./scripts/import.sh fixtures/orders.csv && [ "$(sqlite3 data/app.db 'select count(*) from orders')" -eq 100 ]
- [ ] The 50,000-row fixture imports in under 4 seconds
      CHECK: ./scripts/time-import.sh fixtures/orders-50k.csv --max-seconds 4
