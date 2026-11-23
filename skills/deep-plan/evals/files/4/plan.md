# Plan: checkout-refactor

**Status:** draft
**Created:** 2026-11-22   **Base branch:** main

## Goal
Checkout totals are computed in three places today (cart page, payment step, order
email) and they disagree on rounding. When this is done there is one totals module that
all three use, and an order shows the same total on every screen and in the email.

## Out of scope
- New payment providers.
- Any change to tax rules.
- Redesign of the checkout pages.

## File map
| Path | Change | Phase | Owner |
|---|---|---|---|
| `src/checkout/totals.js` | new: the one place totals and rounding are computed | 1 | p1-foundation |
| `src/checkout/types.js` | new: `LineItem` and `Totals` shapes | 1 | p1-foundation |
| `test/helpers/cart-fixtures.js` | new: shared carts for tests | 1 | p1-foundation |
| `src/checkout/cart/**` | use `totals.js`, delete local maths | 2 | p2-cart |
| `src/checkout/payment/**` | use `totals.js`, delete local maths | 2 | p2-payment |
| `src/email/order-confirmation.js` | use `totals.js` | 2 | p2-email |

## Phases
### Phase 1 - foundation (1 agent)
`p1-foundation` builds `totals.js` with its tests, the shared types and the test carts.
Ends with `npm test` green.

### Phase 2 - implementation (3 agents, in parallel)
- `p2-cart` - cart page uses the totals module - owns `src/checkout/cart/**`
- `p2-payment` - payment step uses the totals module - owns `src/checkout/payment/**`
- `p2-email` - order email uses the totals module - owns `src/email/order-confirmation.js`

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
| two coupons on one cart | cardinality | out of scope - one coupon per order today |
| currency other than EUR | malformed | out of scope - EUR only today |

### Coverage
Every branch of `src/checkout/totals.js`, by unit tests. The pages and the email keep
their existing integration tests; no new target there.

## Definition of done
`npm test` passes, and one order shows the same total on the cart page, the payment
step and the email.

## Risks and unknowns
- The order email is rendered by a job that cannot run locally -> `p2-email` checks it
  with the template preview script.
