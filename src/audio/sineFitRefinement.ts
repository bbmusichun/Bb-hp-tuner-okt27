/** Narrow-band Blackman-windowed sinusoidal least-squares refinement of an FFT candidate. */
const windowCache = new Map<number, Float64Array>();
function getWindow(length: number): Float64Array {
  const cached = windowCache.get(length);
  if (cached) return cached;
  const window = new Float64Array(length);
  for (let i = 0; i < length; i++) window[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (length - 1));
  windowCache.set(length, window);
  return window;
}
function projectedPower(samples: Float32Array, sampleRate: number, frequency: number, window: Float64Array): number {
  const step = 2 * Math.PI * frequency / sampleRate;
  const cs = Math.cos(step), sn = Math.sin(step);
  let c = 1, s = 0, re = 0, im = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] * window[i];
    re += v * c; im -= v * s;
    const nc = c * cs - s * sn;
    s = s * cs + c * sn; c = nc;
  }
  return re * re + im * im;
}
/**
 * Refine a credible spectral peak inside a narrow local range. This estimates
 * sub-bin frequency from the original time samples, not interpolated FFT bins.
 */
export function refineFrequencyBySineFit(samples: Float32Array, sampleRate: number, centerHz: number, searchCents = 8): number | null {
  if (samples.length < 1024 || !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(centerHz) || centerHz <= 0 || !Number.isFinite(searchCents) ||
      searchCents <= 0 || searchCents > 30) return null;
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  if (!Number.isFinite(energy) || energy / samples.length < 1e-10) return null;
  const window = getWindow(samples.length);
  let low = centerHz * 2 ** (-searchCents / 1200);
  let high = centerHz * 2 ** (searchCents / 1200);
  const ratio = (Math.sqrt(5) - 1) / 2;
  let x1 = high - ratio * (high - low), x2 = low + ratio * (high - low);
  let p1 = projectedPower(samples, sampleRate, x1, window);
  let p2 = projectedPower(samples, sampleRate, x2, window);
  for (let i = 0; i < 18; i++) {
    if (p1 < p2) {
      low = x1; x1 = x2; p1 = p2;
      x2 = low + ratio * (high - low); p2 = projectedPower(samples, sampleRate, x2, window);
    } else {
      high = x2; x2 = x1; p2 = p1;
      x1 = high - ratio * (high - low); p1 = projectedPower(samples, sampleRate, x1, window);
    }
  }
  const result = (low + high) / 2;
  return Number.isFinite(result) && result > 0 ? result : null;
}
