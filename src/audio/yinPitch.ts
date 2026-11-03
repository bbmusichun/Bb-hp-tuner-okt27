/**
 * Lightweight YIN pitch estimator for cross-checking the spectral peak tracker.
 * Input is a recent time-domain window. The returned pitch is an independent
 * periodicity estimate, not a replacement for instrument-specific partial tracking.
 */

export interface YinEstimate {
  frequencyHz: number | null;
  clarity: number;
}

const ANTI_ALIAS_TAPS = 63;
const antiAliasCoefficientCache = new Map<number, Float64Array>();

/**
 * Windowed-sinc low-pass before decimation. Plain sample skipping aliases strong
 * upper partials and attack noise into the pitch-analysis band. A Blackman-windowed
 * FIR keeps the passband flat enough for pitch work while suppressing those aliases.
 */
function getAntiAliasCoefficients(factor: number): Float64Array {
  const cached = antiAliasCoefficientCache.get(factor);
  if (cached) return cached;

  const half = (ANTI_ALIAS_TAPS - 1) / 2;
  // Stay below the post-decimation Nyquist frequency with a modest transition band.
  const cutoff = 0.45 / factor;
  const coefficients = new Float64Array(ANTI_ALIAS_TAPS);
  let coefficientSum = 0;

  for (let tap = 0; tap < ANTI_ALIAS_TAPS; tap++) {
    const offset = tap - half;
    const ideal = offset === 0
      ? 2 * cutoff
      : Math.sin(2 * Math.PI * cutoff * offset) / (Math.PI * offset);
    const window = 0.42
      - 0.5 * Math.cos((2 * Math.PI * tap) / (ANTI_ALIAS_TAPS - 1))
      + 0.08 * Math.cos((4 * Math.PI * tap) / (ANTI_ALIAS_TAPS - 1));
    coefficients[tap] = ideal * window;
    coefficientSum += coefficients[tap];
  }

  // Normalize DC gain to one. Coefficients are immutable after being cached.
  for (let tap = 0; tap < ANTI_ALIAS_TAPS; tap++) coefficients[tap] /= coefficientSum;
  antiAliasCoefficientCache.set(factor, coefficients);
  return coefficients;
}

function decimateWithAntiAlias(input: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return input;

  const coefficients = getAntiAliasCoefficients(factor);
  const half = (ANTI_ALIAS_TAPS - 1) / 2;
  const outputLength = Math.floor(input.length / factor);
  const output = new Float32Array(outputLength);
  for (let outIndex = 0; outIndex < outputLength; outIndex++) {
    const center = outIndex * factor;
    let value = 0;
    for (let tap = 0; tap < ANTI_ALIAS_TAPS; tap++) {
      const sourceIndex = Math.max(0, Math.min(input.length - 1, center + tap - half));
      value += input[sourceIndex] * coefficients[tap];
    }
    output[outIndex] = value;
  }
  return output;
}

export function estimatePitchYin(
  input: Float32Array,
  sampleRate: number,
  options: { minHz?: number; maxHz?: number; threshold?: number; downsampleFactor?: number } = {},
): YinEstimate {
  const minHz = options.minHz ?? 70;
  const maxHz = options.maxHz ?? 1000;
  const threshold = options.threshold ?? 0.15;
  const factor = Math.max(1, Math.floor(options.downsampleFactor ?? 4));

  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || input.length < 256 ||
      !Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz <= 0 || maxHz <= minHz ||
      !Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    return { frequencyHz: null, clarity: 0 };
  }

  // Anti-alias filtering is essential here: a handpan's bright upper partials can
  // otherwise fold into false low-frequency periodicity after sample skipping.
  const signal = decimateWithAntiAlias(input, factor);
  const length = signal.length;

  let energy = 0;
  for (let i = 0; i < length; i++) energy += signal[i] * signal[i];
  if (length === 0 || energy / length < 1e-8) return { frequencyHz: null, clarity: 0 };

  const effectiveRate = sampleRate / factor;
  const minLag = Math.max(2, Math.floor(effectiveRate / maxHz));
  const maxLag = Math.min(Math.floor(effectiveRate / minHz), Math.floor(length / 2));
  if (maxLag <= minLag + 2) return { frequencyHz: null, clarity: 0 };

  const difference = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = length - lag;
    for (let i = 0; i < limit; i++) {
      const delta = signal[i] - signal[i + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  const normalized = new Float64Array(maxLag + 1);
  normalized[0] = 1;
  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    runningSum += difference[lag];
    normalized[lag] = runningSum > 0 ? difference[lag] * lag / runningSum : 1;
  }

  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (normalized[lag] < threshold) {
      while (lag + 1 <= maxLag && normalized[lag + 1] < normalized[lag]) lag++;
      bestLag = lag;
      break;
    }
  }
  if (bestLag < 0) {
    let bestValue = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (normalized[lag] < bestValue) {
        bestValue = normalized[lag];
        bestLag = lag;
      }
    }
    if (bestValue > 0.35) return { frequencyHz: null, clarity: Math.max(0, 1 - bestValue) };
  }

  // Parabolic interpolation around the selected minimum.
  const left = normalized[Math.max(1, bestLag - 1)];
  const center = normalized[bestLag];
  const right = normalized[Math.min(maxLag, bestLag + 1)];
  const denominator = left - 2 * center + right;
  const offset = Math.abs(denominator) > 1e-12 ? 0.5 * (left - right) / denominator : 0;
  const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, offset));
  const frequencyHz = effectiveRate / refinedLag;
  if (!Number.isFinite(frequencyHz) || frequencyHz < minHz || frequencyHz > maxHz) {
    return { frequencyHz: null, clarity: Math.max(0, 1 - center) };
  }
  return { frequencyHz, clarity: Math.max(0, Math.min(1, 1 - center)) };
}
