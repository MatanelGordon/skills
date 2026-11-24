# Notes: our API today

- Express 4 and TypeScript, in one repository with the React web app.
- 14 REST endpoints under `/api/v1`:
  - `orders`: 6 endpoints
  - `customers`: 5 endpoints
  - `reports`: 3 endpoints, slow, they return CSV
- Who calls it:
  - our web app (same repository, TypeScript)
  - the iOS app (Swift, a release every three weeks)
  - two partners who integrate with API keys; their contract promises 90 days' notice
    before a breaking change
- An OpenAPI file is generated from the routes and published to the partners.
- Tests: 212 integration tests hit the REST routes through supertest. They pass on `main`.
- Why tRPC came up: we keep fixing bugs where the web app and the API disagree about
  the type of a field.
