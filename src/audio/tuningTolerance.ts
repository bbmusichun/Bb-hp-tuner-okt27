/**
 * Tuning tolerance and visual acceptance policy.
 *
 * Tolerance changes only the UI "in tune" indication. It never alters measured
 * frequencies or cent offsets.
 */
export type TuningToleranceMode = 'auto' | 'any' | 'off';

export function normalizeTuningToleranceMode(value: unknown): TuningToleranceMode {
  return value === 'any' || value === 'off' || value === 'auto' ? value : 'auto';
}

/**
 * Auto uses a calibrated adaptive threshold or a caller-specified fixed
 * threshold. "Any" always accepts a valid measurement; "off" never paints it
 * green. Null/invalid values are never treated as measurements.
 */
export function tuningToleranceCents(targetHz: number, overrideCents?: number | null): number {
  if (typeof overrideCents === 'number' && Number.isFinite(overrideCents) && overrideCents >= 0.5 && overrideCents <= 20) {
    return overrideCents;
  }
  if (!Number.isFinite(targetHz) || targetHz <= 0) return 1.5;
  const referenceHz = 146.832384; // D3 at A4 = 440 Hz
  const octaveSteps = Math.log2(targetHz / referenceHz);
  return Math.max(1.5, Math.min(4, 1.5 + 0.75 * octaveSteps));
}

export function isWithinTuningTolerance(
  cents: number | null,
  targetHz: number | null,
  overrideCents?: number | null,
  mode: TuningToleranceMode = 'auto',
): boolean {
  if (cents === null || !Number.isFinite(cents) ||
      targetHz === null || !Number.isFinite(targetHz) || targetHz <= 0) return false;
  if (mode === 'off') return false;
  if (mode === 'any') return true;
  return Math.abs(cents) <= tuningToleranceCents(targetHz, overrideCents);
}
