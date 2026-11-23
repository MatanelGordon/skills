# catalog-sync

Keeps the storefront catalog in step with the supplier's stock system. A small
HTTP service answers catalog lookups; an importer pulls prices and stock levels
from the supplier database and writes them to Postgres.

## Run

    npm install
    DATABASE_URL=postgres://localhost/catalog npm start

## Import

    SUPPLIER_DSN=SupplierStock npm run import

## Tests

    npm test                  # unit tests, no services needed
    npm run test:integration  # importer against a real supplier database

## Layout

- `src/server.js` serves `/items/:sku`
- `src/importer/` reads the supplier database and upserts the catalog
- `test/` holds the unit tests and the importer integration test
