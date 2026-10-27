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

/**
 * Magnitude response of the 0.42/0.5/0.08 Blackman window used by both the Web Audio
 * analyser and the offline analyser, as a function of the distance from a tone in bins.
 * The sinc form is exact to well below 1e-6 for the window lengths used here.
 */
function blackmanMainLobe(nu: number): number {
  const sinc = (x: number): number => (Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  return Math.abs(
    0.42 * sinc(nu) +
    0.25 * (sinc(nu - 1) + sinc(nu + 1)) +
    0.04 * (sinc(nu - 2) + sinc(nu + 2)),
  );
}

const OFFSET_LUT_STEPS = 1000;

/**
 * Log level ratio of the two bins flanking a peak, per fractional peak offset.
 * Descending: as the true tone moves up from the peak bin, the left bin grows and the
 * right bin shrinks. Precomputed once; the window shape never changes.
 */
const OFFSET_LUT: number[] = Array.from({ length: OFFSET_LUT_STEPS + 1 }, (_, index) => {
  const delta = -0.5 + index / OFFSET_LUT_STEPS;
  return Math.log(blackmanMainLobe(delta + 1)) - Math.log(blackmanMainLobe(delta - 1));
});

/**
 * Fractional peak offset from the levels of the two flanking bins.
 *
 * This inverts the window's own main-lobe shape instead of fitting a parabola through
 * three points, which removes the parabola's systematic bias and uses both neighbours
 * symmetrically, so noise in one bin does not pull the estimate. Returns null when the
 * levels cannot be trusted, so the caller keeps the parabolic estimate.
 */
function estimateFractionalOffset(leftDb: number, rightDb: number): number | null {
  if (!Number.isFinite(leftDb) || !Number.isFinite(rightDb)) return null;
  const ratio = (leftDb - rightDb) * (Math.LN10 / 20);
  if (!Number.isFinite(ratio)) return null;

  if (ratio >= OFFSET_LUT[0]) return -0.5;
  const lastRatio = OFFSET_LUT[OFFSET_LUT_STEPS];
  if (ratio <= lastRatio) return 0.5;

  let low = 0;
  let high = OFFSET_LUT_STEPS;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (OFFSET_LUT[middle] > ratio) low = middle;
    else high = middle;
  }
  const span = OFFSET_LUT[low] - OFFSET_LUT[high];
  const position = span > 0 ? (OFFSET_LUT[low] - ratio) / span : 0;
  return -0.5 + (low + Math.max(0, Math.min(1, position))) / OFFSET_LUT_STEPS;
}

/** Sub-cent Blackman main-lobe interpolation around an analyser's local maximum. */
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

  // Parabolic estimate in log-magnitude space, used when the window model cannot be applied.
  const denominator = alpha - 2 * beta + gamma;
  let delta = 0;

  if (Math.abs(denominator) > 1e-6) {
    delta = 0.5 * ((alpha - gamma) / denominator);
  }

  const refinedDelta = estimateFractionalOffset(alpha, gamma);
  if (refinedDelta !== null) delta = refinedDelta;

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
