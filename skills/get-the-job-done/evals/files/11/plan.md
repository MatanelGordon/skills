# Plan: multi-tenant orders

Status: approved 2026-11-16. Nothing has been built yet.

## Goal

Every row in `orders` belongs to a tenant, and no request can read or write another tenant's rows.

## Critical-path tests

Run from the repo root:

- `pytest tests/tenancy/test_isolation.py`
- `pytest tests/tenancy/test_migration.py -k backfill`
- `./scripts/smoke.sh --tenants 2`

## Edge cases

| # | Case | Status |
|---|------|--------|
| 1 | A request with no tenant header is rejected with 400 | covered by `tests/tenancy/test_headers.py::test_missing_header_400` |
| 2 | Tenant A cannot read tenant B's order by id (404, not 403) | covered by `tests/tenancy/test_isolation.py::test_cross_tenant_read_404` |
| 3 | Backfill assigns legacy rows to the `default` tenant | covered by `tests/tenancy/test_migration.py::test_backfill_default_tenant` |
| 4 | A tenant is deleted while one of its requests is in flight | unknown |
| 5 | Two tenants create an order with the same external reference at the same moment | unknown |

## Coverage

Line coverage of `src/tenancy/` is at least 80%. `pytest --cov=src/tenancy --cov-report=json` writes `coverage.json`; the figure is `.totals.percent_covered`.

## Out of scope

Per-tenant rate limits.
