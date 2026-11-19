import { expect, it } from 'vitest';
import { withinDisplayLimit } from '../src/calculator.js';

it('includes a value exactly equal to the display limit', () => {
  expect(withinDisplayLimit('123456789012', 12)).toBe(true);
});
