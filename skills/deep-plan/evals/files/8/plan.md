# Plan: checkout-refactor

**Status:** executing
**Created:** 2026-11-18   **Base branch:** main

## Goal
Checkout totals are computed in three places today (cart page, payment step, order
email) and they disagree on rounding. When this is done there is one totals module that
all three use, and an order shows the same total on every screen and in the email.

## Out of scope
- New payment providers.
- Any change to tax rules.

## File map
| Path | Change | Phase | Owner |
|---|---|---|---|
| `src/checkout/types.js` | new: `LineItem` and `Totals` shapes | 1 | p1-foundation |
| `test/helpers/cart-fixtures.js` | new: shared carts for tests | 1 | p1-foundation |
| `src/checkout/totals.js` | new: subtotal, coupon and rounding | 2 | p2-cart |
| `src/checkout/cart/**` | use `totals.js`, delete local maths | 2 | p2-cart |
| `src/checkout/payment/**` | use `totals.js`, delete local maths | 2 | p2-payment |
| `src/email/order-confirmation.js` | use `totals.js` | 2 | p2-email |

## Shared surface (phase 1 owns all of it)
`src/checkout/types.js` and `test/helpers/cart-fixtures.js`.

## Phases
### Phase 1 - foundation (1 agent) - finished 2026-11-20
`p1-foundation` adds the shared types and the test carts.

### Phase 2 - implementation (3 agents, in parallel) - started 2026-11-21
- `p2-cart` - totals module and cart page - owns `src/checkout/totals.js`, `src/checkout/cart/**`
- `p2-payment` - payment step and card surcharge - owns `src/checkout/payment/**`
- `p2-email` - order email - owns `src/email/order-confirmation.js`

### Phase 3 - review (1 agent)
- `p3-cr` - code review

## Test strategy
### Critical-path tests
```bash
npm test
```

### Edge cases
| Case | Axis | Status |
|---|---|---|
| empty cart | cardinality | covered - `totals of an empty cart are zero` |
| half-cent amounts | boundaries | covered - `rounds half up once, at the end` |
| currency other than EUR | malformed | out of scope - EUR only today |

### Coverage
Every branch of `src/checkout/totals.js`, by unit tests. The pages and the email keep
their existing integration tests; no new target there.

## Risks and unknowns
- The order email is rendered by a job that cannot run locally -> `p2-email` checks it
  with the template preview script.
