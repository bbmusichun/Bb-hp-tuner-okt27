/** True when the largest normalized float sample is at or above the near-full-scale threshold. */
export function isNearDigitalClipPeak(peakAbsolute: number, threshold = 0.999): boolean {
  if (!Number.isFinite(peakAbsolute) || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) return false;
  return peakAbsolute >= threshold;
}
