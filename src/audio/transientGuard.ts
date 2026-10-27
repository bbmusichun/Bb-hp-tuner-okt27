/**
 * Transient guard for rolling analyser windows.
 * A frame is not free of the strike until a full FFT window has passed after onset.
 */
export function requiredTransientHoldoffMs(fftSize: number, sampleRate: number, guardMs = 50): number {
  if (!Number.isFinite(fftSize) || fftSize <= 0 ||
      !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(guardMs) || guardMs < 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (fftSize / sampleRate) * 1000 + guardMs;
}

export function isTransientHoldoffActive(
  lastTransientAtMs: number,
  nowMs: number,
  fftSize: number,
  sampleRate: number,
  guardMs = 50,
): boolean {
  if (!Number.isFinite(lastTransientAtMs) || lastTransientAtMs <= 0 ||
      !Number.isFinite(nowMs) || nowMs < lastTransientAtMs) return false;
  return nowMs - lastTransientAtMs < requiredTransientHoldoffMs(fftSize, sampleRate, guardMs);
}
