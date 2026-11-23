import { describe, expect, it } from 'vitest';
import { shippingCost } from '../src/shipping.js';

describe('shippingCost', () => {
  it('charges the flat rate just below the threshold', () => {
    expect(shippingCost(4999)).toBe(499);
  });

  it('ships free at exactly the threshold', () => {
    expect(shippingCost(5000)).toBe(0);
  });

  it('ships free above the threshold', () => {
    expect(shippingCost(8000)).toBe(0);
  });

  it('rejects a negative subtotal', () => {
    expect(() => shippingCost(-1)).toThrow(RangeError);
  });
});
