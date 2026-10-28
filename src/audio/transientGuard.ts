/**
 * Transient guard for rolling analyser windows.
 * A frame is not free of the strike until a full FFT window has passed after onset.
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
  riseRatio = 2.2,
): boolean {
  if (!Number.isFinite(previousShortRms) || previousShortRms < 0 ||
      !Number.isFinite(currentShortRms) || currentShortRms < 0 ||
      !Number.isFinite(minRms) || minRms < 0 ||
      !Number.isFinite(riseRatio) || riseRatio <= 1) return false;
  return currentShortRms >= minRms &&
    (previousShortRms < minRms * 0.5 || currentShortRms >= previousShortRms * riseRatio);
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
  /** Maximum allowed spread from the rolling median, in cents. */
  maxDeviationCents?: number;
  /** Ignore readings below this optional confidence threshold. */
  minConfidence?: number;
}

/**
 * Confirms a pitch only after consecutive readings agree in cents.
 * This is intentionally separate from display smoothing: invalid or unstable
 * readings never become an accepted tuning value.
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

  observe(reading: StablePitchReading): { stable: boolean; frequencyHz: number | null; count: number } {
    const valid = Number.isFinite(reading.frequencyHz) && reading.frequencyHz > 0 &&
      Number.isFinite(reading.timestampMs) &&
      (reading.confidence === undefined ||
        (Number.isFinite(reading.confidence) && reading.confidence >= this.minConfidence));
    if (!valid) {
      this.reset();
      return { stable: false, frequencyHz: null, count: 0 };
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

    const frequencyHz = this.median(this.readings.map((item) => item.frequencyHz));
    const stable = this.readings.length >= this.requiredReadings &&
      this.readings.every((item) =>
        Math.abs(1200 * Math.log2(item.frequencyHz / frequencyHz)) <= this.maxDeviationCents
      );
    return { stable, frequencyHz: stable ? frequencyHz : null, count: this.readings.length };
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
