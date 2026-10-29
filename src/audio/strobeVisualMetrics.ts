/**
 * Visual-only metrics for matching the reference application's documented strobe cues:
 * bar contrast represents detected signal strength and edge sharpness represents
 * short-term pitch stability. These are display mappings, not confidence or
 * metrological uncertainty estimates.
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Map a spectral peak level in dBFS to visual contrast. */
export function strobeContrastFromDb(levelDb: number | null): number {
  if (levelDb === null || !Number.isFinite(levelDb)) return 0;
  // The live peak finder rejects peaks below roughly -82 dBFS; use that as the
  // bottom of the visible range and reserve full contrast for strong peaks.
  return clamp01((levelDb + 82) / 52);
}

/** Map the recent cents spread to stripe edge sharpness (0 = soft, 1 = sharp). */
export function strobeSharpnessFromCents(samples: readonly number[]): number {
  const values = samples.filter(Number.isFinite);
  // Avoid implying stability from one or two readings.
  if (values.length < 3) return 0.35;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  // Treat sub-tenth-cent numerical jitter as stable rather than letting floating-point
  // rounding visibly soften an otherwise identical set of pitch readings.
  if (standardDeviation <= 0.1) return 1;
  // A spread of 12 cents or more is rendered with the softest edges.
  return clamp01(1 - standardDeviation / 12);
}
/** Only a live, valid analysis frame may drive the strobe or its green/tolerance state. */
export function isStrobeMeasurementLive(
  inputActive: boolean,
  hasSignal: boolean,
  transientHoldoff: boolean,
  measurementStatus: string,
): boolean {
  return inputActive && hasSignal && !transientHoldoff && measurementStatus === 'valid';
}
