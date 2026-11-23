# Assignment for the auth worktree (branch `auth-tokens`)

Replace session cookies with short-lived access tokens.

## Done means

1. `POST /login` returns an access token that expires after 15 minutes.
2. A request with an expired token gets `401` with the body `{"error":"token_expired"}`.
3. `POST /refresh` rotates the refresh token: the old one stops working once it has been used.
4. No secret or token value is written to the application log.
