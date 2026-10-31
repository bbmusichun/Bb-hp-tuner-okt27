/**
 * Pure spectrum-peak helpers shared by the live audio engine and deterministic tests.
 *
 * The analyser supplies logarithmic magnitudes in dB. Keep peak interpolation and
 * target-window selection outside the browser-only engine so known sine references
 * can verify the exact code path used by live tuning.
 */

export interface SpectralPeakMeasurement {
  freq: number;
  magDb: number;
  bin: number;
}

/** Parabolic interpolation around an analyser's local maximum, in log-magnitude space. */
export function interpolateSpectralPeak(
  bin: number,
  spectrum: Float32Array,
  sampleRate: number,
): SpectralPeakMeasurement {
  const binCount = spectrum.length;
  const binWidth = sampleRate / (binCount * 2);

  if (bin <= 0 || bin >= binCount - 1) {
    return { freq: bin * binWidth, magDb: spectrum[bin] ?? -100, bin };
  }

  const alpha = spectrum[bin - 1];
  const beta = spectrum[bin];
  const gamma = spectrum[bin + 1];
  const denominator = alpha - 2 * beta + gamma;
  let delta = 0;

  if (Math.abs(denominator) > 1e-6) {
    delta = 0.5 * ((alpha - gamma) / denominator);
  }

  delta = Math.max(-0.5, Math.min(0.5, delta));
  const freq = (bin + delta) * binWidth;
  const magDb = beta - 0.25 * (alpha - gamma) * delta;

  return { freq, magDb, bin };
}

/**
 * Inspect all local maxima in a target window. A second similarly strong peak
 * can indicate a split mode, beating, or a neighbouring resonance; in that case
 * the tuner must not present the strongest peak as an unambiguously valid pitch.
 */
export interface SpectralPeakWindowAnalysis {
  peak: SpectralPeakMeasurement | null;
  competingPeak: SpectralPeakMeasurement | null;
  ambiguous: boolean;
  noiseFloorDb: number;
  prominenceDb: number;
}

/** Median finite spectrum level in dB. */
function median(values: number[]): number {
  if (!values.length) return -100;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

export function analyzeSpectralPeakInWindow(
  targetFreq: number,
  windowCents: number,
  spectrum: Float32Array,
  sampleRate: number,
  minimumPeakDb = -82,
  ambiguityThresholdDb = 4,
  minimumSeparationBins = 2,
  prominenceWindowCents = windowCents,
): SpectralPeakWindowAnalysis {
  const empty: SpectralPeakWindowAnalysis = {
    peak: null,
    competingPeak: null,
    ambiguous: false,
    noiseFloorDb: -100,
    prominenceDb: 0,
  };
  if (
    !Number.isFinite(targetFreq) || targetFreq <= 0 ||
    !Number.isFinite(windowCents) || windowCents < 0 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Number.isFinite(minimumPeakDb) ||
    !Number.isFinite(ambiguityThresholdDb) || ambiguityThresholdDb < 0 ||
    !Number.isFinite(minimumSeparationBins) || minimumSeparationBins < 1 ||
    !Number.isFinite(prominenceWindowCents) || prominenceWindowCents < 0 ||
    spectrum.length < 3
  ) return empty;

  const minFreq = targetFreq * Math.pow(2, -windowCents / 1200);
  const maxFreq = targetFreq * Math.pow(2, windowCents / 1200);
  const binWidth = sampleRate / (spectrum.length * 2);
  const minBin = Math.max(1, Math.floor(minFreq / binWidth));
  const maxBin = Math.min(spectrum.length - 2, Math.ceil(maxFreq / binWidth));
  if (minBin >= maxBin) return empty;

  const candidates: SpectralPeakMeasurement[] = [];
  for (let i = minBin; i <= maxBin; i++) {
    const value = spectrum[i];
    if (
      Number.isFinite(value) &&
      value >= minimumPeakDb &&
      Number.isFinite(spectrum[i - 1]) &&
      Number.isFinite(spectrum[i + 1]) &&
      value > spectrum[i - 1] &&
      value > spectrum[i + 1]
    ) {
      candidates.push(interpolateSpectralPeak(i, spectrum, sampleRate));
    }
  }

  if (!candidates.length) return empty;
  candidates.sort((a, b) => b.magDb - a.magDb);
  const peak = candidates[0];
  const competingPeak = candidates.find((candidate) =>
    Math.abs(candidate.bin - peak.bin) >= minimumSeparationBins
  ) ?? null;
  const ambiguous = competingPeak !== null &&
    peak.magDb - competingPeak.magDb <= ambiguityThresholdDb;

  // Estimate the local spectral floor without allowing the main peak's central
  // bins to inflate the baseline. The median is robust to a few nearby partials.
  const floorWindowCents = Math.max(windowCents, prominenceWindowCents);
  const floorMinFreq = targetFreq * Math.pow(2, -floorWindowCents / 1200);
  const floorMaxFreq = targetFreq * Math.pow(2, floorWindowCents / 1200);
  const floorMinBin = Math.max(1, Math.floor(floorMinFreq / binWidth));
  const floorMaxBin = Math.min(spectrum.length - 2, Math.ceil(floorMaxFreq / binWidth));
  const noiseBins: number[] = [];
  for (let i = floorMinBin; i <= floorMaxBin; i++) {
    if (Math.abs(i - peak.bin) <= 2) continue;
    if (Number.isFinite(spectrum[i])) noiseBins.push(spectrum[i]);
  }
  // A very narrow target window may contain no bins outside the excluded peak core.
  // In that case, do not invent a -100 dB floor: treat prominence as unknown/zero
  // so the conservative tracking gate rejects the measurement.
  const noiseFloorDb = noiseBins.length > 0 ? median(noiseBins) : peak.magDb;
  const prominenceDb = Math.max(0, peak.magDb - noiseFloorDb);

  return { peak, competingPeak, ambiguous, noiseFloorDb, prominenceDb };
}

/**
 * Find the strongest local spectral peak in a cents window around the target.
 * Returns null rather than fabricating a measurement when the spectrum is unusable.
 */
export function findSpectralPeakInWindow(
  targetFreq: number,
  windowCents: number,
  spectrum: Float32Array,
  sampleRate: number,
  minimumPeakDb = -82,
): SpectralPeakMeasurement | null {
  return analyzeSpectralPeakInWindow(
    targetFreq, windowCents, spectrum, sampleRate, minimumPeakDb,
  ).peak;
}
