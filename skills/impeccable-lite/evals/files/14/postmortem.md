### Checkout outage, 12 November 2026

# Summary
Card payments failed for 46 minutes on Thursday morning. 212 orders were affected. No payment was taken twice.

#### Timeline
09:02 the payment-error alert fired. 09:10 the on-call engineer confirmed the card processor was rejecting our requests. 09:31 we found the API certificate had expired at 09:00. 09:48 a new certificate was deployed and payments recovered.

## Root cause
The certificate renewal reminder went to a mailbox nobody reads.

##### Actions
- Move renewal reminders to the on-call channel (owner: platform team, due 20 November).
- Add an expiry check to the deploy pipeline (owner: payments team, due 4 December).
