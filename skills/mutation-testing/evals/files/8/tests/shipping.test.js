import { describe, expect, it } from 'vitest';
import { shippingCost } from '../src/shipping.js';

describe('shippingCost', () => {
  it('charges the flat rate below the threshold', () => {
    expect(shippingCost(1000)).toBe(499);
  });

  it('ships free above the threshold', () => {
    expect(shippingCost(8000)).toBe(0);
  });

  it('rejects a negative subtotal', () => {
    expect(() => shippingCost(-1)).toThrow(RangeError);
  });
});
