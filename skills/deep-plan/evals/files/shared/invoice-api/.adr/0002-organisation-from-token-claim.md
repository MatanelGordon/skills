# ADR-0002: The organisation comes from the token, never from the request

Status: accepted, 2026-03-11

## Decision

The organisation a request acts for is the `org_id` claim of the verified access token.
The API does not accept it from a header (such as `X-Org-Id`), a path segment, a query
parameter or the request body.

## Why

In February a support tool sent another customer's id in a header and the API believed it.
Only the login service can set a claim.

## Consequences

- A user who belongs to two organisations needs one token per organisation.
- Service-to-service calls need a token as well.
- A token without `org_id` is rejected once organisations are enforced.
