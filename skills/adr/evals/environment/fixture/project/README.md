# orders-api

Order intake for the storefront. Accepts orders, stores them in Postgres and
tells the rest of the shop about them over the message queue.

## Run

    npm install
    DATABASE_URL=postgres://localhost/orders AMQP_URL=amqp://localhost npm start

## Layout

- `src/server.js` wires the HTTP app
- `src/orders/` holds the order routes, service and repository
- `src/db.js` and `src/queue.js` wrap Postgres and the queue

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| POST | `/orders` | Accepts an order and returns it with status `accepted` |
| GET | `/orders/:id` | Returns one order |
