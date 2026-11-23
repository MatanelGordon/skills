# p2-webhooks
STARTED: 13:20
STATUS: RUNNING
STEP: writing the signature verification tests
CHANGED: src/webhooks/verify.ts, src/webhooks/handler.ts
TESTS: npm test -- test/webhooks.test.ts -> fail
NOTES:
- handler is complete; verify.ts still rejects valid signatures with a trailing newline
