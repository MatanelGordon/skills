# Stock is reserved by message, never by asking Inventory during a request

Status: accepted

Orders does not contact the Inventory service while it handles a request.
`POST /orders` accepts the order and publishes `stock.reserve`; if Inventory
later answers `stock.rejected`, the order is cancelled and the customer is told.
Inventory's availability target is 99.5%, and on 2025-03-14 a lookup made
during checkout kept every order waiting for 40 minutes while Inventory
restarted. We chose late rejection over tying checkout to Inventory's uptime.

## Constraints this creates

- No HTTP or RPC call from Orders to Inventory on the request path.
- An accepted order can still be cancelled for lack of stock, and the API says so.
