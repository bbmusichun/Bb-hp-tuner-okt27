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
  if (
    !Number.isFinite(targetFreq) || targetFreq <= 0 ||
    !Number.isFinite(windowCents) || windowCents < 0 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Number.isFinite(minimumPeakDb) ||
    spectrum.length < 3
  ) {
    return null;
  }

  const minFreq = targetFreq * Math.pow(2, -windowCents / 1200);
  const maxFreq = targetFreq * Math.pow(2, windowCents / 1200);
  const binWidth = sampleRate / (spectrum.length * 2);
  const minBin = Math.max(1, Math.floor(minFreq / binWidth));
  const maxBin = Math.min(spectrum.length - 2, Math.ceil(maxFreq / binWidth));

  if (minBin >= maxBin) return null;

  let maxVal = -Infinity;
  let bestBin = -1;

  for (let i = minBin; i <= maxBin; i++) {
    if (
      Number.isFinite(spectrum[i]) &&
      spectrum[i] > maxVal &&
      spectrum[i] > spectrum[i - 1] &&
      spectrum[i] > spectrum[i + 1]
    ) {
      maxVal = spectrum[i];
      bestBin = i;
    }
  }

  if (bestBin === -1 || maxVal < minimumPeakDb) return null;
  return interpolateSpectralPeak(bestBin, spectrum, sampleRate);
}
