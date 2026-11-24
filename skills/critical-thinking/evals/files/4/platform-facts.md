# Platform facts for the REST to gRPC question

- 38 backend services, all REST with JSON over HTTP. 31 are internal only; 7 serve the public API.
- The public API is used by 112 partner integrations and by our own web and mobile apps. Partner contracts promise 12 months' notice before an endpoint is removed.
- Why the question came up:
  - The three services on the hot path (pricing, inventory, checkout) spend 22% of their CPU on JSON encoding and decoding.
  - Hand-written API clients drift from the servers. Fixing that costs about 6 engineer-days a quarter.
- Team: 9 backend engineers. Nobody on the team has run gRPC in production.

## Estimates from the platform team

- Move everything to gRPC and remove REST: 14 engineer-months, plus a client rewrite by every partner. Once the partners have moved and the REST endpoints are deleted, going back would be a second migration of the same size.
- gRPC between the internal services, REST kept at the public edge behind a gateway: 5 engineer-months. A service can be moved back on its own, about 1 engineer-week each.
- gRPC for the three hot-path services only: 6 engineer-weeks. Moving them back is about 1 engineer-week each.
- Stay on REST and generate the clients from the OpenAPI files: 3 engineer-weeks. This ends the client drift and leaves the CPU cost as it is.
