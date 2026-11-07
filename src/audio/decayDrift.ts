export interface DecayFrequencySample {
  frequencyHz: number;
  timestampMs: number;
}

export interface DecayDriftSnapshot {
  /** End-to-end change from the oldest to newest retained sample, in cents. */
  driftCents: number;
  /** Peak-to-peak frequency range within the retained time window, in cents. */
  rangeCents: number;
  /** Least-squares linear drift rate over the retained window, in cents per second. */
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

/**
 * Describes observed frequency movement during a resonance's sustain/decay.
 * This is a time-series diagnostic, not measurement uncertainty or a calibration
 * accuracy estimate. The caller must reset it at a new strike or invalid reading.
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

    const cents = this.samples.map((item) => 1200 * Math.log2(item.frequencyHz / first.frequencyHz));
    const meanTime = this.samples.reduce((sum, item) => sum + (item.timestampMs - first.timestampMs) / 1000, 0) / this.samples.length;
    const meanCents = cents.reduce((sum, value) => sum + value, 0) / cents.length;
    let covariance = 0;
    let timeVariance = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const time = (this.samples[i].timestampMs - first.timestampMs) / 1000;
      covariance += (time - meanTime) * (cents[i] - meanCents);
      timeVariance += (time - meanTime) ** 2;
    }
    const slopeCentsPerSecond = timeVariance > 0 ? covariance / timeVariance : 0;
    return {
      driftCents: cents[cents.length - 1],
      rangeCents: Math.max(...cents) - Math.min(...cents),
      slopeCentsPerSecond,
      sampleCount: this.samples.length,
      durationMs,
    };
  }
}
