# shipping-desk

Books shipments with the carrier (Norvia) and keeps the labels they return.

## Run

    npm install
    DATABASE_URL=postgres://localhost/shipping NORVIA_TOKEN=... npm start

## Jobs

    npm run purge-labels   # nightly: removes labels of shipments closed 90+ days ago

## Layout

- `src/server.js` exposes `POST /shipments`
- `src/carriers/` talks to the carrier's API
- `src/labels/` stores labels and purges old ones
- `src/webhooks/` forwards shipment events to the storefront
- `src/lib/` holds helpers shared by the rest
