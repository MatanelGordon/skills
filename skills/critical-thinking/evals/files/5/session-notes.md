# Session notes: PAY-212, retries for payment gateway calls

## Done

- Replaced the hand-written retry loop in `src/gateway/client.ts` with the shared `withRetry` helper: 3 attempts, with the wait between them taken from the new `retry_ms` setting (default 200).
- Tests: 96 passed, 0 failed. Pull request #731 is open and CI is green.

## Open points noted along the way

1. Setting name: `retry_ms` or `retryMs`? The other 14 keys in `config/default.yaml` are snake_case.
2. The scratch branch `tmp/pay-212-scratch` is still on the remote. Every commit on it is also in #731.
3. Changelog section for the entry: "Changed" or "Fixed"? PAY-212 is filed as a bug.
4. Retries on `POST /charges`. `withRetry` now retries every gateway call, `POST /charges` included. The gateway only recognises a repeated charge when the request carries an `Idempotency-Key` header, and we do not send one. About 0.4% of charge calls time out today.
   - Send an `Idempotency-Key` on charge calls: about 3 hours of work plus a regression pass on refunds, about 2 hours. Timed-out charges then go through on the retry.
   - Switch retries off for `POST /charges` only: about 20 minutes. The 0.4% keep failing the way they do today.
5. CI sandbox key. The gateway sandbox key that CI uses expires on 30 November.
   - Renew the shared key by hand in the gateway dashboard: about 10 minutes. It expires again after 90 days.
   - Have CI fetch a short-lived key for each run from the gateway's token endpoint: about 1 day of work. Nothing expires any more, but CI cannot run while the token endpoint is down (2 outages last year, about 1 hour each).
