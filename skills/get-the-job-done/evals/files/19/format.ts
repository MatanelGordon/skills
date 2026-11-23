export function formatPrice(cents: number, currency = 'EUR'): string {
  const tmp = cents % 100;
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction} ${currency}`;
}
