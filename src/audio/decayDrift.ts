export interface DecayFrequencySample {
  frequencyHz: number;
  timestampMs: number;
}

export interface DecayDriftSnapshot {
  /** End-to-end change from the oldest to newest retained sample, in cents. */
  driftCents: number;
  /** Robust peak-to-peak frequency range after suppressing isolated one-frame spikes. */
  rangeCents: number;
  /** Least-squares drift rate over the robust frequency trajectory, in cents per second. */
  slopeCentsPerSecond: number;
  sampleCount: number;
  durationMs: number;
}

export interface DecayDriftOptions {
  windowMs?: number;
  maxSamples?: number;
  minSamples?: number;
  minDurationMs?: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Describes observed frequency movement during a resonance's sustain/decay.
 * A three-point median rejects isolated single-frame FFT peak jumps before
 * calculating the drift. This is a signal-quality safeguard, not calibration
 * or measurement uncertainty. The caller resets it at a new strike/invalid frame.
 */
export class DecayDriftTracker {
  private readonly windowMs: number;
  private readonly maxSamples: number;
  private readonly minSamples: number;
  private readonly minDurationMs: number;
  private samples: DecayFrequencySample[] = [];

  constructor(options: DecayDriftOptions = {}) {
    this.windowMs = Math.max(100, options.windowMs ?? 2500);
    this.maxSamples = Math.max(4, Math.floor(options.maxSamples ?? 64));
    this.minSamples = Math.max(3, Math.min(this.maxSamples, Math.floor(options.minSamples ?? 4)));
    this.minDurationMs = Math.max(0, options.minDurationMs ?? 250);
  }

  reset(): void {
    this.samples = [];
  }

  observe(sample: DecayFrequencySample): DecayDriftSnapshot | null {
    if (!Number.isFinite(sample.frequencyHz) || sample.frequencyHz <= 0 ||
        !Number.isFinite(sample.timestampMs)) {
      this.reset();
      return null;
    }

    const previous = this.samples[this.samples.length - 1];
    if (previous && sample.timestampMs <= previous.timestampMs) {
      this.reset();
    }

    this.samples.push(sample);
    const cutoff = sample.timestampMs - this.windowMs;
    while (this.samples.length && this.samples[0].timestampMs < cutoff) this.samples.shift();
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const durationMs = last.timestampMs - first.timestampMs;
    if (this.samples.length < this.minSamples || durationMs < this.minDurationMs) return null;

    // Work in cents relative to the oldest retained frequency. A local median
    // removes an isolated one-frame FFT-bin hop without flattening a sustained trend.
    const rawCents = this.samples.map((item) => 1200 * Math.log2(item.frequencyHz / first.frequencyHz));
    const robustCents = rawCents.map((value, index) => {
      if (index === 0 || index === rawCents.length - 1) return value;
      return median([rawCents[index - 1], value, rawCents[index + 1]]);
    });

    const meanTime = this.samples.reduce(
      (sum, item) => sum + (item.timestampMs - first.timestampMs) / 1000, 0,
    ) / this.samples.length;
    const meanCents = robustCents.reduce((sum, value) => sum + value, 0) / robustCents.length;
    let covariance = 0;
    let timeVariance = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const time = (this.samples[i].timestampMs - first.timestampMs) / 1000;
      covariance += (time - meanTime) * (robustCents[i] - meanCents);
      timeVariance += (time - meanTime) ** 2;
    }

    return {
      driftCents: robustCents[robustCents.length - 1],
      rangeCents: Math.max(...robustCents) - Math.min(...robustCents),
      slopeCentsPerSecond: timeVariance > 0 ? covariance / timeVariance : 0,
      sampleCount: this.samples.length,
      durationMs,
    };
  }
}
