import { expect, it } from 'vitest';
import { calculate } from '../src/calculator.js';

it('returns a public error instead of Infinity when dividing by zero', () => {
  expect(calculate('divide', 8, 0)).toEqual({
    ok: false,
    error: 'Cannot divide by zero',
  });
});
