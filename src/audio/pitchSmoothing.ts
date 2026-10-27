/**
 * Temporal pitch estimator for struck instruments.
 *
 * A single FFT frame can jump between nearby spectral bins or briefly lock onto
 * a neighboring resonance. Use a short median window to reject isolated outliers
 * without the lag of a long moving average. A genuine pitch change starts a new window.
 */
export interface PitchSample {
  frequencyHz: number;
  timestampMs: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function smoothPitchSample(
  history: PitchSample[],
  frequencyHz: number,
  timestampMs: number,
  options: { windowSize?: number; resetAfterMs?: number; jumpThresholdCents?: number } = {},
): { frequencyHz: number; history: PitchSample[] } {
  const windowSize = options.windowSize ?? 5;
  const resetAfterMs = options.resetAfterMs ?? 1200;
  const jumpThresholdCents = options.jumpThresholdCents ?? 12;

  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || !Number.isFinite(timestampMs)) {
    return { frequencyHz, history: [] };
  }

  let next = history.filter((sample) =>
    Number.isFinite(sample.frequencyHz) &&
    sample.frequencyHz > 0 &&
    timestampMs >= sample.timestampMs &&
    timestampMs - sample.timestampMs <= resetAfterMs
  );

  const previousMedian = median(next.map((sample) => sample.frequencyHz));
  const jumpCents = Number.isFinite(previousMedian)
    ? Math.abs(1200 * Math.log2(frequencyHz / previousMedian))
    : Number.POSITIVE_INFINITY;

  // Don't let a prior note or a different spectral peak pull a new measurement.
  if (next.length === 0 || jumpCents > jumpThresholdCents) next = [];

  next.push({ frequencyHz, timestampMs });
  if (next.length > windowSize) next = next.slice(-windowSize);

  return {
    frequencyHz: median(next.map((sample) => sample.frequencyHz)),
    history: next,
  };
}
