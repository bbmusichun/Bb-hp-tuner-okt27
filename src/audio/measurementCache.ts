/**
 * A cached resonance may only be displayed as a held reading when it belongs to
 * the same target note. This prevents AUTO note changes from reusing stale cents.
 */
export function isSameMeasurementTarget(
  cachedTargetHz: number,
  targetHz: number,
  toleranceCents = 0.5,
): boolean {
  if (!Number.isFinite(cachedTargetHz) || cachedTargetHz <= 0 ||
      !Number.isFinite(targetHz) || targetHz <= 0 ||
      !Number.isFinite(toleranceCents) || toleranceCents < 0) return false;
  return Math.abs(1200 * Math.log2(cachedTargetHz / targetHz)) <= toleranceCents;
}
