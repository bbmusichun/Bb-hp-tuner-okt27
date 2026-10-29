/**
 * Product tuning tolerance policy.
 *
 * This is an explicit, smooth UI threshold for the tuner; it is not a claim about
 * psychoacoustic just-noticeable differences. It should be calibrated with instrument
 * recordings and listening tests before being marketed as a perceptual model.
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
): boolean {
  return cents !== null &&
    Number.isFinite(cents) &&
    targetHz !== null &&
    Number.isFinite(targetHz) &&
    targetHz > 0 &&
    Math.abs(cents) <= tuningToleranceCents(targetHz, overrideCents);
}
