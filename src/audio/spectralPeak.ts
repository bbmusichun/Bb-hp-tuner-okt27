/**
 * Pure spectrum helpers shared by the live audio engine and offline reference tests.
 *
 * The analyser supplies dB magnitudes for the positive-frequency half of an FFT.
 * Interpolation is performed in dB space, matching the production implementation.
 */
export interface InterpolatedSpectralPeak {
  frequencyHz: number;
  magnitudeDb: number;
}

export interface ReliablePeakOptions {
  minDb?: number;
  minProminenceDb?: number;
  exclusionBins?: number;
}

export interface ReliableSpectralPeak extends InterpolatedSpectralPeak {
  bin: number;
}

export function interpolateParabolicPeak(
  bin: number,
  spectrumDb: Float32Array,
  sampleRate: number,
): InterpolatedSpectralPeak {
  const binWidth = sampleRate / (spectrumDb.length * 2);

  if (!Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isInteger(bin) || bin < 0 || bin >= spectrumDb.length) {
    return { frequencyHz: Number.NaN, magnitudeDb: Number.NaN };
  }

  if (bin <= 0 || bin >= spectrumDb.length - 1) {
    return { frequencyHz: bin * binWidth, magnitudeDb: spectrumDb[bin] ?? -100 };
  }

  const alpha = spectrumDb[bin - 1];
  const beta = spectrumDb[bin];
  const gamma = spectrumDb[bin + 1];
  const denominator = alpha - 2 * beta + gamma;

  let offset = 0;
  if (Math.abs(denominator) > 1e-6) {
    offset = 0.5 * ((alpha - gamma) / denominator);
  }
  offset = Math.max(-0.5, Math.min(0.5, offset));

  return {
    frequencyHz: (bin + offset) * binWidth,
    magnitudeDb: beta - 0.25 * (alpha - gamma) * offset,
  };
}

/**
 * Check peak prominence against the local spectral floor. The two bins nearest
 * the peak are excluded because they belong to the FFT window's main lobe and
 * can be only a few dB below a perfectly valid tone.
 */
export function hasSpectralPeakProminence(
  spectrumDb: Float32Array,
  peakBin: number,
  minBin: number,
  maxBin: number,
  minProminenceDb = 6,
  exclusionBins = 2,
): boolean {
  if (!Number.isInteger(peakBin) || peakBin < 0 || peakBin >= spectrumDb.length ||
      !Number.isFinite(spectrumDb[peakBin]) ||
      !Number.isFinite(minProminenceDb) || minProminenceDb < 0 ||
      !Number.isInteger(exclusionBins) || exclusionBins < 0) return false;

  const sideBins: number[] = [];
  const start = Math.max(0, Math.floor(minBin));
  const end = Math.min(spectrumDb.length - 1, Math.ceil(maxBin));
  for (let i = start; i <= end; i++) {
    if (Math.abs(i - peakBin) <= exclusionBins) continue;
    if (Number.isFinite(spectrumDb[i])) sideBins.push(spectrumDb[i]);
  }
  if (sideBins.length === 0) return false;

  sideBins.sort((a, b) => a - b);
  const middle = Math.floor(sideBins.length / 2);
  const localFloorDb = sideBins.length % 2
    ? sideBins[middle]
    : (sideBins[middle - 1] + sideBins[middle]) / 2;

  return spectrumDb[peakBin] - localFloorDb >= minProminenceDb;
}

/**
 * Find a local maximum in a target-cent window and reject peaks that do not
 * stand sufficiently above the local spectral floor.
 */
export function findReliablePeakInSpectrum(
  spectrumDb: Float32Array,
  sampleRate: number,
  targetHz: number,
  windowCents: number,
  options: ReliablePeakOptions = {},
): ReliableSpectralPeak | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(targetHz) || targetHz <= 0 ||
      !Number.isFinite(windowCents) || windowCents < 0 ||
      spectrumDb.length < 3) return null;

  const minDb = options.minDb ?? -82;
  const minProminenceDb = options.minProminenceDb ?? 6;
  const exclusionBins = options.exclusionBins ?? 2;
  if (!Number.isFinite(minDb) || !Number.isFinite(minProminenceDb) || minProminenceDb < 0) return null;

  const minFreq = targetHz * Math.pow(2, -windowCents / 1200);
  const maxFreq = targetHz * Math.pow(2, windowCents / 1200);
  const binWidth = sampleRate / (spectrumDb.length * 2);
  const minBin = Math.max(1, Math.floor(minFreq / binWidth));
  const maxBin = Math.min(spectrumDb.length - 2, Math.ceil(maxFreq / binWidth));
  if (minBin >= maxBin) return null;

  let bestBin = -1;
  let maxValue = -Infinity;
  for (let i = minBin; i <= maxBin; i++) {
    if (spectrumDb[i] > maxValue &&
        spectrumDb[i] > spectrumDb[i - 1] &&
        spectrumDb[i] > spectrumDb[i + 1]) {
      maxValue = spectrumDb[i];
      bestBin = i;
    }
  }

  if (bestBin < 0 || maxValue < minDb ||
      !hasSpectralPeakProminence(
        spectrumDb, bestBin, minBin, maxBin, minProminenceDb, exclusionBins,
      )) return null;

  const interpolated = interpolateParabolicPeak(bestBin, spectrumDb, sampleRate);
  if (!Number.isFinite(interpolated.frequencyHz) || interpolated.frequencyHz <= 0) return null;
  return { ...interpolated, bin: bestBin };
}
