/**
 * Product tuning tolerance policy.
 *
 * The default acceptance band is ±3 cents, based on the practical handpan
 * tuning criterion supplied for this project. The measured deviation itself
 * is always retained and displayed; the tolerance only determines the status.
 * This is an acceptance threshold, not a claim about measurement uncertainty.
 */

export type TuningToleranceSetting = number | null | 'always' | 'never';

export function isValidTuningToleranceSetting(value: unknown): value is TuningToleranceSetting {
  return value === null ||
    value === 'always' ||
    value === 'never' ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 20);
}

export function normalizeTuningToleranceSetting(value: unknown): TuningToleranceSetting {
  return isValidTuningToleranceSetting(value) ? value : null;
}

export function formatTuningToleranceSetting(
  value: TuningToleranceSetting,
  targetHz: number,
): string {
  if (value === 'always') return 'Minden eltérés elfogadása';
  if (value === 'never') return 'Soha ne legyen zöld';
  const threshold = typeof value === 'number' ? value : tuningToleranceCents(targetHz);
  return `±${threshold.toFixed(1)} cent`;
}

/** Default to the same ±3-cent acceptance band across the handpan register. */
export function tuningToleranceCents(targetHz: number, overrideCents?: number | null): number {
  if (typeof overrideCents === 'number' && Number.isFinite(overrideCents) && overrideCents >= 0.5 && overrideCents <= 20) {
    return overrideCents;
  }
  // A bad target must not widen acceptance; callers separately validate targets.
  if (!Number.isFinite(targetHz) || targetHz <= 0) return 3;
  return 3;
}

/**
 * Apply the chosen display/acceptance policy to a real measurement.
 * Special modes never manufacture a measurement: missing/non-finite cents or
 * an invalid target remain invalid and therefore cannot be accepted.
 */
export function isWithinTuningTolerance(
  cents: number | null,
  targetHz: number | null,
  setting?: TuningToleranceSetting,
): boolean {
  if (cents === null ||
      !Number.isFinite(cents) ||
      targetHz === null ||
      !Number.isFinite(targetHz) ||
      targetHz <= 0) return false;

  if (setting === 'always') return true;
  if (setting === 'never') return false;
  return Math.abs(cents) <= tuningToleranceCents(targetHz, setting);
}
