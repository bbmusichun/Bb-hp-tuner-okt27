/**
 * Product tuning tolerance policy.
 *
 * This is an explicit UI threshold for the tuner; it is not a claim about
 * psychoacoustic just-noticeable differences. It should be calibrated with
 * instrument recordings and listening tests before being marketed as a
 * perceptual model.
 */

/**
 * null = adaptive Auto, number = fixed cent threshold,
 * always = every valid reading is accepted, never = no reading is green.
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

export function tuningToleranceCents(targetHz: number, overrideCents?: number | null): number {
  if (typeof overrideCents === 'number' && Number.isFinite(overrideCents) && overrideCents >= 0.5 && overrideCents <= 20) {
    return overrideCents;
  }
  if (!Number.isFinite(targetHz) || targetHz <= 0) return 1.5;
  const referenceHz = 146.832384; // D3 at A4 = 440 Hz
  const octaveSteps = Math.log2(targetHz / referenceHz);
  return Math.max(1.5, Math.min(4, 1.5 + 0.75 * octaveSteps));
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
