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

/**
 * Return the reduction in weighted squared error from the best-fit sinusoid.
 * The constant, sine and cosine terms are solved together as a 3-parameter
 * weighted least-squares model. This avoids assuming that the finite-window
 * sine/cosine columns are orthogonal and estimates DC as a nuisance parameter.
 * The Blackman window is squared to form the least-squares sample weights.
 */
function projectedPower(
  samples: Float32Array,
  sampleRate: number,
  frequency: number,
  window: Float64Array,
): number {
  const step = 2 * Math.PI * frequency / sampleRate;
  const cs = Math.cos(step), sn = Math.sin(step);
  let c = 1, s = 0;
  let sw = 0, swc = 0, sws = 0, swcc = 0, swss = 0, swcs = 0;
  let swx = 0, swxc = 0, swxs = 0, swxx = 0;
  for (let i = 0; i < samples.length; i++) {
    const w = window[i] * window[i];
    const x = samples[i];
    sw += w; swc += w * c; sws += w * s;
    swcc += w * c * c; swss += w * s * s; swcs += w * c * s;
    swx += w * x; swxc += w * x * c; swxs += w * x * s;
    swxx += w * x * x;
    const nc = c * cs - s * sn;
    s = s * cs + c * sn; c = nc;
  }

  if (!(sw > 0) || !Number.isFinite(swxx)) return 0;

  // Eliminate the constant column (DC) by weighted centering.
  const meanC = swc / sw, meanS = sws / sw, meanX = swx / sw;
  const cc = swcc - swc * meanC;
  const ss = swss - sws * meanS;
  const csCov = swcs - swc * meanS;
  const xc = swxc - swx * meanC;
  const xs = swxs - swx * meanS;
  const determinant = cc * ss - csCov * csCov;
  if (!(determinant > 1e-18) || !Number.isFinite(determinant)) return 0;

  // Improvement in weighted SSE for the optimal sine/cosine coefficients.
  const explained = (ss * xc * xc - 2 * csCov * xc * xs + cc * xs * xs) / determinant;
  return Number.isFinite(explained) ? Math.max(0, explained) : 0;
}

/**
 * Refine a credible spectral peak inside a narrow local range. This estimates
 * sub-bin frequency from the original time samples, not interpolated FFT bins.
 * A weighted least-squares fit jointly estimates DC and both sinusoidal
 * quadratures, avoiding the orthogonality assumption of a simple projection.
 */
export function refineFrequencyBySineFit(samples: Float32Array, sampleRate: number, centerHz: number, searchCents = 8): number | null {
  if (samples.length < 1024 || !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(centerHz) || centerHz <= 0 || !Number.isFinite(searchCents) ||
      searchCents <= 0 || searchCents > 30) return null;
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) return null;
    energy += samples[i] * samples[i];
  }
  if (!Number.isFinite(energy) || energy / samples.length < 1e-10) return null;
  const window = getWindow(samples.length);
  // Reject frames with too little AC content. A DC offset alone must never
  // produce a seemingly valid frequency by maximizing numerical noise.
  let weightedSum = 0, weightSum = 0;
  for (let i = 0; i < samples.length; i++) {
    const w = window[i] * window[i];
    weightedSum += w * samples[i];
    weightSum += w;
  }
  if (!(weightSum > 0)) return null;
  const weightedMean = weightedSum / weightSum;
  let centeredEnergy = 0;
  for (let i = 0; i < samples.length; i++) {
    const delta = samples[i] - weightedMean;
    centeredEnergy += window[i] * window[i] * delta * delta;
  }
  if (!Number.isFinite(centeredEnergy) || centeredEnergy <= 1e-12) return null;

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
  if (!Number.isFinite(result) || result <= 0) return null;

  // A local optimizer pinned to its search boundary has not found an interior
  // optimum. Do not report the clipped edge as a precise measurement; let the
  // upstream FFT/YIN estimate remain authoritative instead.
  const searchLow = centerHz * 2 ** (-searchCents / 1200);
  const searchHigh = centerHz * 2 ** (searchCents / 1200);
  const lowEdgeDistanceCents = Math.abs(1200 * Math.log2(result / searchLow));
  const highEdgeDistanceCents = Math.abs(1200 * Math.log2(searchHigh / result));
  if (lowEdgeDistanceCents <= 0.02 || highEdgeDistanceCents <= 0.02) return null;

  const explained = projectedPower(samples, sampleRate, result, window);
  // Require the candidate sinusoid to explain at least 1% of the frame's
  // weighted AC energy. This rejects noise/DC-only frames while retaining
  // legitimate handpan fundamentals even when upper partials are stronger.
  if (!Number.isFinite(explained) || explained / centeredEnergy < 0.01) return null;
  return result;
}
