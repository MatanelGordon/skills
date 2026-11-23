// Shipping cost rules for the checkout.
export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;
export const FLAT_RATE_CENTS = 499;

/** Shipping cost in cents for an order subtotal in cents. */
export function shippingCost(subtotalCents) {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new RangeError('subtotalCents must be a non-negative integer');
  }
  if (subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) {
    return 0;
  }
  return FLAT_RATE_CENTS;
}
