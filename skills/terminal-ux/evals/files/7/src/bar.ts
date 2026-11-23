const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'] as const;

/** A bar that is always exactly `width` cells wide, filled in proportion to value / max. */
export const hbar = (value: number, max: number, width: number): string => {
  const ratio = max === 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const full = Math.floor(ratio * width);
  const partial = EIGHTHS[Math.round((ratio * width - full) * 8)]!;
  return ('█'.repeat(full) + partial).padEnd(width, ' ');
};

/** Whole-number percentage of value / max, clamped to 0..100. */
export const percent = (value: number, max: number): number =>
  max === 0 ? 0 : Math.round(Math.max(0, Math.min(1, value / max)) * 100);
