/**
 * Lightweight YIN pitch estimator for cross-checking the spectral peak tracker.
 * Input is a recent time-domain window. The returned pitch is an independent
 * periodicity estimate, not a replacement for instrument-specific partial tracking.
 */
export interface YinEstimate {
  frequencyHz: number | null;
  clarity: number;
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
      !Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz <= 0 || maxHz <= minHz) {
    return { frequencyHz: null, clarity: 0 };
  }

  const length = Math.floor(input.length / factor);
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i++) signal[i] = input[i * factor] ?? 0;

  let energy = 0;
  for (let i = 0; i < length; i++) energy += signal[i] * signal[i];
  if (energy / length < 1e-8) return { frequencyHz: null, clarity: 0 };

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
