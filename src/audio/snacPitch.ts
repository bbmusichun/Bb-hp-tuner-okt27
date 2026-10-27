/**
 * SNAC (Specially Normalized Autocorrelation) pitch estimator.
 *
 * Experimental benchmark implementation only: it is not wired into the live tuner.
 * The handpan's three resonances can be inharmonic, so this estimator is compared
 * against YIN and spectral peaks rather than assumed to be universally superior.
 */
export interface SnacEstimate {
  frequencyHz: number | null;
  clarity: number;
}

export function estimatePitchSnac(
  input: Float32Array,
  sampleRate: number,
  options: { minHz?: number; maxHz?: number; minClarity?: number } = {},
): SnacEstimate {
  const minHz = options.minHz ?? 70;
  const maxHz = options.maxHz ?? 1000;
  const minClarity = options.minClarity ?? 0.35;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || input.length < 256 ||
      !Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz <= 0 || maxHz <= minHz) {
    return { frequencyHz: null, clarity: 0 };
  }

  let energy = 0;
  for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
  if (energy / input.length < 1e-8) return { frequencyHz: null, clarity: 0 };

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(input.length / 2));
  if (maxLag <= minLag + 2) return { frequencyHz: null, clarity: 0 };

  // SNAC: normalized correlation in [-1, 1], with overlap energy normalization.
  const snac = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let cross = 0;
    let energyA = 0;
    let energyB = 0;
    const limit = input.length - lag;
    for (let i = 0; i < limit; i++) {
      const a = input[i];
      const b = input[i + lag];
      cross += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const denom = Math.sqrt(energyA * energyB);
    snac[lag] = denom > 1e-12 ? cross / denom : 0;
  }

  // Select the strongest local positive peak in the permitted lag range.
  // This deliberately remains a simple baseline; harmonic-rich signals may have
  // octave ambiguity, which the benchmark tests should expose.
  let bestLag = -1;
  let bestValue = -Infinity;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (snac[lag] >= snac[lag - 1] && snac[lag] > snac[lag + 1] && snac[lag] > bestValue) {
      bestValue = snac[lag];
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestValue < minClarity) return { frequencyHz: null, clarity: Math.max(0, bestValue) };

  const left = snac[bestLag - 1];
  const center = snac[bestLag];
  const right = snac[bestLag + 1];
  const denominator = left - 2 * center + right;
  const offset = Math.abs(denominator) > 1e-12 ? 0.5 * (left - right) / denominator : 0;
  const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, offset));
  const frequencyHz = sampleRate / refinedLag;
  if (!Number.isFinite(frequencyHz) || frequencyHz < minHz || frequencyHz > maxHz) {
    return { frequencyHz: null, clarity: bestValue };
  }
  return { frequencyHz, clarity: Math.max(0, Math.min(1, bestValue)) };
}
