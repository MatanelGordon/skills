import { describe, expect, it } from 'vitest';
import { calculate, withinDisplayLimit } from '../src/calculator.js';

describe('calculator CLI behavior', () => {
  it('performs the four arithmetic operations', () => {
    expect(calculate('add', 8, 2)).toEqual({ ok: true, value: 10 });
    expect(calculate('subtract', 8, 2)).toEqual({ ok: true, value: 6 });
    expect(calculate('multiply', 8, 2)).toEqual({ ok: true, value: 16 });
    expect(calculate('divide', 8, 2)).toEqual({ ok: true, value: 4 });
  });

  it('rejects unknown operations', () => {
    expect(calculate('power', 8, 2)).toEqual({ ok: false, error: 'Unknown operation: power' });
  });

  it('accepts short display values and rejects values beyond the limit', () => {
    expect(withinDisplayLimit('123', 12)).toBe(true);
    expect(withinDisplayLimit('1234567890123', 12)).toBe(false);
  });
});
