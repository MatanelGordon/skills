export function calculate(operation, left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    throw new TypeError('Operands must be finite numbers');
  }
  if (operation === 'divide' && right === 0) {
    return { ok: false, error: 'Cannot divide by zero' };
  }

  const operations = {
    add: () => left + right,
    subtract: () => left - right,
    multiply: () => left * right,
    divide: () => left / right,
  };
  const selected = operations[operation];
  if (!selected) return { ok: false, error: `Unknown operation: ${operation}` };
  return { ok: true, value: selected() };
}

export function withinDisplayLimit(text, maximum = 12) {
  return text.length <= maximum;
}
