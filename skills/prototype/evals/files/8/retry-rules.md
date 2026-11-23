# Refund webhook retry rules (proposal)

1. A `refund.requested` webhook from the shop creates a refund job for the
   order, in state `pending`.
2. The worker takes a pending job and calls the payment provider's
   `POST /refunds` with the order id and the amount.
3. If the provider answers 200, the job becomes `done`.
4. If the call times out (10 s) or the provider answers 5xx, the job is tried
   again: after 1 minute, then 5 minutes, then 30 minutes. After the third
   retry fails the job becomes `failed`.
5. Each attempt sends a new request id.
6. The shop sends the same webhook again, up to 5 times, when we take longer
   than 10 s to acknowledge it. A repeated webhook creates a job only if the
   order has no job in state `done`.

Known provider behaviour: a call that timed out on our side may still have been
carried out on theirs.
