export interface FrequencyPeak {
  freq: number;
  magDb: number;
  bin: number;
}

export interface FinalizedPeakReading {
  peak: FrequencyPeak | null;
  deviationCents: number | null;
}

/**
 * Finalize one reading after stability tracking.
 *
 * The displayed frequency and its cent deviation must be derived from the same
 * final frequency. In particular, a stable tracker may replace the raw peak.
 */
export function finalizePeakReading(
  peak: FrequencyPeak | null,
  stableFrequencyHz: number | null,
  targetHz: number,
): FinalizedPeakReading {
  let finalPeak = peak;

  if (
    finalPeak &&
    stableFrequencyHz !== null &&
    Number.isFinite(stableFrequencyHz) &&
    stableFrequencyHz > 0
  ) {
    finalPeak = { ...finalPeak, freq: stableFrequencyHz };
  }

  const deviationCents =
    finalPeak &&
    Number.isFinite(finalPeak.freq) &&
    finalPeak.freq > 0 &&
    Number.isFinite(targetHz) &&
    targetHz > 0
      ? 1200 * Math.log2(finalPeak.freq / targetHz)
      : null;

  return { peak: finalPeak, deviationCents };
}
