/**
 * Transient guard for rolling analyser windows.
 * Onset detection uses short-time RMS; spectral measurement waits until a full FFT
 * window plus a safety guard has passed so the strike transient is no longer in-frame.
 */
/**
 * Detect a fresh strike from a short-time RMS envelope, not the full rolling FFT
 * window. The full-window RMS smears the attack over hundreds of milliseconds and
 * can miss repeated strikes while the previous note is still ringing.
 */
export function detectTransientOnset(
  previousShortRms: number,
  currentShortRms: number,
  minRms = 0.0015,
  riseRatio = 1.6,
): boolean {
  if (!Number.isFinite(previousShortRms) || previousShortRms < 0 ||
      !Number.isFinite(currentShortRms) || currentShortRms < 0 ||
      !Number.isFinite(minRms) || minRms < 0 ||
      !Number.isFinite(riseRatio) || riseRatio <= 1) return false;
  return currentShortRms >= minRms &&
    (previousShortRms < minRms * 0.5 ||
      currentShortRms >= previousShortRms * riseRatio ||
      currentShortRms - previousShortRms >= minRms * 2);
}

export function requiredTransientHoldoffMs(fftSize: number, sampleRate: number, guardMs = 50): number {
  if (!Number.isFinite(fftSize) || fftSize <= 0 ||
      !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(guardMs) || guardMs < 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (fftSize / sampleRate) * 1000 + guardMs;
}

export function isTransientHoldoffActive(
  lastTransientAtMs: number,
  nowMs: number,
  fftSize: number,
  sampleRate: number,
  guardMs = 50,
): boolean {
  if (!Number.isFinite(lastTransientAtMs) || lastTransientAtMs <= 0 ||
      !Number.isFinite(nowMs) || nowMs < lastTransientAtMs) return false;
  return nowMs - lastTransientAtMs < requiredTransientHoldoffMs(fftSize, sampleRate, guardMs);
}

 
export interface StablePitchReading {
  frequencyHz: number;
  confidence?: number;
  timestampMs: number;
}

export interface StablePitchOptions {
  /** Number of consecutive compatible readings required before accepting pitch. */
  requiredReadings?: number;
  /** Maximum peak-to-peak spread of the rolling readings, in cents. */
  maxDeviationCents?: number;
  /** Ignore readings below this optional confidence threshold. */
  minConfidence?: number;
}

/**
 * Confirms a pitch only after consecutive readings agree in cents.
 * Stability uses the full peak-to-peak range, not distance from the median,
 * so a gradual drift cannot hide on opposite sides of the median.
 */
export class StablePitchTracker {
  private readings: StablePitchReading[] = [];
  private readonly requiredReadings: number;
  private readonly maxDeviationCents: number;
  private readonly minConfidence: number;

  constructor(options: StablePitchOptions = {}) {
    this.requiredReadings = Math.max(2, Math.floor(options.requiredReadings ?? 4));
    this.maxDeviationCents = Math.max(0.1, options.maxDeviationCents ?? 5);
    this.minConfidence = options.minConfidence ?? 0;
  }

  reset(): void {
    this.readings = [];
  }

  observe(reading: StablePitchReading): { stable: boolean; frequencyHz: number | null; count: number; spreadCents: number | null } {
    const valid = Number.isFinite(reading.frequencyHz) && reading.frequencyHz > 0 &&
      Number.isFinite(reading.timestampMs) &&
      (reading.confidence === undefined ||
        (Number.isFinite(reading.confidence) && reading.confidence >= this.minConfidence));
    if (!valid) {
      this.reset();
      return { stable: false, frequencyHz: null, count: 0, spreadCents: null };
    }

    const previous = this.readings[this.readings.length - 1];
    if (previous && reading.timestampMs < previous.timestampMs) {
      this.reset();
    }

    const center = this.median(this.readings.map((item) => item.frequencyHz));
    const deviation = Number.isFinite(center)
      ? Math.abs(1200 * Math.log2(reading.frequencyHz / center))
      : 0;

    // A sudden pitch jump starts a fresh run rather than contaminating history.
    if (this.readings.length && deviation > this.maxDeviationCents) this.readings = [];
    this.readings.push(reading);
    if (this.readings.length > this.requiredReadings) this.readings.shift();

    const frequencies = this.readings.map((item) => item.frequencyHz);
    const frequencyHz = this.median(frequencies);
    const spreadCents = frequencies.length > 1
      ? 1200 * Math.log2(Math.max(...frequencies) / Math.min(...frequencies))
      : 0;
    const stable = this.readings.length >= this.requiredReadings &&
      Number.isFinite(spreadCents) &&
      spreadCents <= this.maxDeviationCents;
    return { stable, frequencyHz: stable ? frequencyHz : null, count: this.readings.length, spreadCents: frequencies.length > 1 ? spreadCents : null };
  }

  private median(values: number[]): number {
    if (!values.length) return Number.NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }
}
