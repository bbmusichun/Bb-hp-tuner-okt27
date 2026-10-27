/**
 * Envelope analysis helpers for validating beat phenomena in struck-instrument audio.
 *
 * These helpers deliberately do not drive the stroboscope yet. A two-tone beat
 * can be estimated from the low-frequency modulation of a short-time RMS envelope,
 * but live integration needs real handpan recordings and latency/noise calibration.
 */
export interface BeatEnvelopeOptions {
  sampleRate: number;
  windowMs?: number;
  hopMs?: number;
  minBeatHz?: number;
  maxBeatHz?: number;
}

export interface BeatEnvelopeResult {
  beatFrequencyHz: number | null;
  confidence: number;
  envelope: Float64Array;
  envelopeSampleRate: number;
}

/** Compute short-time RMS envelope, with a fixed window and hop. */
export function computeRmsEnvelope(
  samples: Float32Array,
  sampleRate: number,
  windowMs = 20,
  hopMs = 5,
): { envelope: Float64Array; envelopeSampleRate: number } {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(windowMs) || windowMs <= 0 ||
      !Number.isFinite(hopMs) || hopMs <= 0) {
    throw new RangeError('Invalid envelope configuration');
  }
  const windowSize = Math.max(1, Math.round(sampleRate * windowMs / 1000));
  const hopSize = Math.max(1, Math.round(sampleRate * hopMs / 1000));
  if (samples.length < windowSize) {
    return { envelope: new Float64Array(0), envelopeSampleRate: sampleRate / hopSize };
  }

  const count = Math.floor((samples.length - windowSize) / hopSize) + 1;
  const envelope = new Float64Array(count);
  for (let frame = 0; frame < count; frame++) {
    const start = frame * hopSize;
    let sumSquares = 0;
    for (let i = 0; i < windowSize; i++) {
      const sample = samples[start + i];
      sumSquares += sample * sample;
    }
    envelope[frame] = Math.sqrt(sumSquares / windowSize);
  }
  return { envelope, envelopeSampleRate: sampleRate / hopSize };
}

function removeMeanAndTrend(values: Float64Array): Float64Array {
  const result = new Float64Array(values.length);
  if (values.length === 0) return result;
  let mean = 0;
  for (const value of values) mean += value;
  mean /= values.length;

  // Remove a linear trend caused by natural decay, which otherwise biases slow-beat estimates.
  const center = (values.length - 1) / 2;
  let slopeNumerator = 0;
  let slopeDenominator = 0;
  for (let i = 0; i < values.length; i++) {
    const x = i - center;
    slopeNumerator += x * (values[i] - mean);
    slopeDenominator += x * x;
  }
  const slope = slopeDenominator > 0 ? slopeNumerator / slopeDenominator : 0;
  for (let i = 0; i < values.length; i++) {
    result[i] = values[i] - mean - slope * (i - center);
  }
  return result;
}

/**
 * Estimate the dominant envelope modulation frequency using a normalized
 * autocorrelation search. At least three cycles are required for a result.
 */
export function estimateBeatFrequencyFromEnvelope(
  envelope: Float64Array,
  envelopeSampleRate: number,
  options: Pick<BeatEnvelopeOptions, 'minBeatHz' | 'maxBeatHz'> = {},
): { beatFrequencyHz: number | null; confidence: number } {
  const minBeatHz = options.minBeatHz ?? 0.05;
  const maxBeatHz = options.maxBeatHz ?? 8;
  if (!Number.isFinite(envelopeSampleRate) || envelopeSampleRate <= 0 ||
      !Number.isFinite(minBeatHz) || minBeatHz <= 0 ||
      !Number.isFinite(maxBeatHz) || maxBeatHz <= minBeatHz ||
      envelope.length < 8) {
    return { beatFrequencyHz: null, confidence: 0 };
  }

  const signal = removeMeanAndTrend(envelope);
  let totalEnergy = 0;
  for (const value of signal) totalEnergy += value * value;
  if (totalEnergy <= 1e-12) return { beatFrequencyHz: null, confidence: 0 };

  const minLag = Math.max(1, Math.floor(envelopeSampleRate / maxBeatHz));
  const maxLag = Math.min(
    Math.floor(envelopeSampleRate / minBeatHz),
    Math.floor(signal.length / 3),
  );
  if (maxLag <= minLag) return { beatFrequencyHz: null, confidence: 0 };

  let bestLag = -1;
  let bestCorrelation = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let numerator = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < signal.length - lag; i++) {
      numerator += signal[i] * signal[i + lag];
      energyA += signal[i] * signal[i];
      energyB += signal[i + lag] * signal[i + lag];
    }
    const denominator = Math.sqrt(energyA * energyB);
    const correlation = denominator > 0 ? numerator / denominator : 0;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorrelation < 0.15) {
    return { beatFrequencyHz: null, confidence: Math.max(0, bestCorrelation) };
  }

  // Parabolic interpolation of the correlation peak gives sub-sample lag precision.
  let lagOffset = 0;
  const correlationAt = (lag: number): number => {
    let numerator = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < signal.length - lag; i++) {
      numerator += signal[i] * signal[i + lag];
      energyA += signal[i] * signal[i];
      energyB += signal[i + lag] * signal[i + lag];
    }
    const denominator = Math.sqrt(energyA * energyB);
    return denominator > 0 ? numerator / denominator : 0;
  };
  if (bestLag > minLag && bestLag < maxLag) {
    const left = correlationAt(bestLag - 1);
    const middle = correlationAt(bestLag);
    const right = correlationAt(bestLag + 1);
    const denominator = left - 2 * middle + right;
    if (Math.abs(denominator) > 1e-9) {
      lagOffset = Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator));
    }
  }

  const periodSamples = bestLag + lagOffset;
  return {
    beatFrequencyHz: periodSamples > 0 ? envelopeSampleRate / periodSamples : null,
    confidence: Math.max(0, Math.min(1, bestCorrelation)),
  };
}

export function analyzeBeatEnvelope(
  samples: Float32Array,
  options: BeatEnvelopeOptions,
): BeatEnvelopeResult {
  const { envelope, envelopeSampleRate } = computeRmsEnvelope(
    samples,
    options.sampleRate,
    options.windowMs ?? 20,
    options.hopMs ?? 5,
  );
  const estimate = estimateBeatFrequencyFromEnvelope(envelope, envelopeSampleRate, options);
  return { ...estimate, envelope, envelopeSampleRate };
}
