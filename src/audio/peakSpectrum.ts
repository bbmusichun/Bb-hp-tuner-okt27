/**
 * Linotune-style peak spectrum analysis.
 *
 * Unlike the interpolated pitch tracker, this view reports the actual FFT-bin
 * location of every significant local maximum. This is intentional: the peak
 * spectrum should expose double peaks and other partials without implying
 * sub-bin accuracy that this display does not calculate.
 */
export interface SignificantSpectralPeak {
  bin: number;
  frequencyHz: number;
  amplitudeDb: number;
  relativeDb: number;
  multipleOfBase: number;
}

export interface PeakSpectrumOptions {
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  /** Absolute gate, suppressing the analyser's noise floor. */
  minimumAmplitudeDb?: number;
  /** Maximum distance below the loudest peak still considered significant. */
  dynamicRangeDb?: number;
  /** Minimum bin spacing between separate local maxima. */
  minPeakDistanceBins?: number;
  maxPeaks?: number;
}

export function findSignificantSpectralPeaks(
  spectrum: Float32Array,
  sampleRate: number,
  baseFrequencyHz: number,
  options: PeakSpectrumOptions = {},
): SignificantSpectralPeak[] {
  if (
    spectrum.length < 3 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Number.isFinite(baseFrequencyHz) || baseFrequencyHz <= 0
  ) return [];

  const binWidth = sampleRate / (spectrum.length * 2);
  const minHz = Number.isFinite(options.minFrequencyHz) && (options.minFrequencyHz ?? 0) >= 0
    ? options.minFrequencyHz as number : 0;
  const maxHz = Number.isFinite(options.maxFrequencyHz) && (options.maxFrequencyHz ?? 0) > minHz
    ? options.maxFrequencyHz as number : sampleRate / 2;
  const firstBin = Math.max(1, Math.ceil(minHz / binWidth));
  const lastBin = Math.min(spectrum.length - 2, Math.floor(maxHz / binWidth));
  if (firstBin > lastBin) return [];

  const minimumAmplitudeDb = Number.isFinite(options.minimumAmplitudeDb)
    ? options.minimumAmplitudeDb as number : -88;
  const dynamicRangeDb = Number.isFinite(options.dynamicRangeDb) && (options.dynamicRangeDb ?? 0) > 0
    ? options.dynamicRangeDb as number : 48;
  const minPeakDistanceBins = Number.isInteger(options.minPeakDistanceBins) && (options.minPeakDistanceBins ?? 0) >= 1
    ? options.minPeakDistanceBins as number : 2;
  const maxPeaks = Number.isInteger(options.maxPeaks) && (options.maxPeaks ?? 0) >= 1
    ? Math.min(512, options.maxPeaks as number) : 64;

  let maximumDb = -Infinity;
  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    const value = spectrum[bin];
    if (Number.isFinite(value) && value > maximumDb) maximumDb = value;
  }
  if (!Number.isFinite(maximumDb) || maximumDb < minimumAmplitudeDb) return [];

  const thresholdDb = Math.max(minimumAmplitudeDb, maximumDb - dynamicRangeDb);
  const candidates: SignificantSpectralPeak[] = [];
  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    const value = spectrum[bin];
    const left = spectrum[bin - 1];
    const right = spectrum[bin + 1];
    if (
      !Number.isFinite(value) || !Number.isFinite(left) || !Number.isFinite(right) ||
      value < thresholdDb || value <= left || value < right
    ) continue;

    candidates.push({
      bin,
      frequencyHz: bin * binWidth,
      amplitudeDb: value,
      relativeDb: value - maximumDb,
      multipleOfBase: (bin * binWidth) / baseFrequencyHz,
    });
  }

  // Keep the strongest peak when a broad resonance creates adjacent local maxima,
  // but retain genuinely separate close peaks so double resonances remain visible.
  candidates.sort((a, b) => b.amplitudeDb - a.amplitudeDb || a.bin - b.bin);
  const selected: SignificantSpectralPeak[] = [];
  for (const peak of candidates) {
    if (selected.some((item) => Math.abs(item.bin - peak.bin) < minPeakDistanceBins)) continue;
    selected.push(peak);
    if (selected.length >= maxPeaks) break;
  }
  return selected.sort((a, b) => a.frequencyHz - b.frequencyHz);
}
