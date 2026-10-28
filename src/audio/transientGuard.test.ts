import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectTransientOnset, isTransientHoldoffActive, requiredTransientHoldoffMs, StablePitchTracker } from './transientGuard';

describe('short-time transient onset detection', () => {
  it('detects a fresh strike even while a previous note is ringing', () => {
    assert.equal(detectTransientOnset(0.008, 0.021), true);
    assert.equal(detectTransientOnset(0.0002, 0.004), true);
  });

  it('does not trigger repeatedly on a steady sustain or low-level noise', () => {
    assert.equal(detectTransientOnset(0.01, 0.011), false);
    assert.equal(detectTransientOnset(0.0002, 0.0008), false);
  });

  it('rejects invalid detector parameters', () => {
    assert.equal(detectTransientOnset(Number.NaN, 0.01), false);
    assert.equal(detectTransientOnset(0.01, 0.02, 0.001, 1), false);
  });
});

describe('rolling FFT transient guard', () => {
  it('waits for a complete FFT window plus a 50 ms safety guard', () => {
    const duration = requiredTransientHoldoffMs(32768, 48000, 50);
    assert.ok(Math.abs(duration - 732.6666667) < 0.001);
    assert.equal(isTransientHoldoffActive(1000, 1050, 32768, 48000), true);
    assert.equal(isTransientHoldoffActive(1000, 1732, 32768, 48000), true);
    assert.equal(isTransientHoldoffActive(1000, 1733, 32768, 48000), false);
  });

  it('adapts to the actual sample rate and FFT size', () => {
    assert.equal(requiredTransientHoldoffMs(16384, 48000, 50), 391.3333333333333);
    assert.equal(requiredTransientHoldoffMs(32768, 44100, 50), 793.0385487528345);
  });

  it('rejects invalid window configuration safely', () => {
    assert.equal(requiredTransientHoldoffMs(0, 48000), Number.POSITIVE_INFINITY);
    assert.equal(requiredTransientHoldoffMs(32768, 0), Number.POSITIVE_INFINITY);
    assert.equal(isTransientHoldoffActive(0, 1000, 32768, 48000), false);
    assert.equal(isTransientHoldoffActive(2000, 1000, 32768, 48000), false);
  });
});


describe('stable pitch tracker', () => {
  it('accepts only after consecutive readings agree', () => {
    const tracker = new StablePitchTracker({ requiredReadings: 3, maxDeviationCents: 4 });
    assert.equal(tracker.observe({ frequencyHz: 146.8, timestampMs: 10 }).stable, false);
    assert.equal(tracker.observe({ frequencyHz: 146.82, timestampMs: 20 }).stable, false);
    const result = tracker.observe({ frequencyHz: 146.81, timestampMs: 30 });
    assert.equal(result.stable, true);
    assert.ok(result.frequencyHz !== null && Math.abs(result.frequencyHz - 146.81) < 0.02);
  });

  it('resets on a large pitch jump and never accepts invalid readings', () => {
    const tracker = new StablePitchTracker({ requiredReadings: 3, maxDeviationCents: 5 });
    [220, 220.1, 220.05].forEach((frequencyHz, i) =>
      tracker.observe({ frequencyHz, timestampMs: i + 1 })
    );
    const jump = tracker.observe({ frequencyHz: 247, timestampMs: 4 });
    assert.equal(jump.stable, false);
    assert.equal(jump.count, 1);
    const invalid = tracker.observe({ frequencyHz: Number.NaN, timestampMs: 5 });
    assert.equal(invalid.stable, false);
    assert.equal(invalid.frequencyHz, null);
    assert.equal(invalid.count, 0);
  });

  it('rejects readings below configured confidence', () => {
    const tracker = new StablePitchTracker({ requiredReadings: 2, minConfidence: 0.5 });
    const result = tracker.observe({ frequencyHz: 220, confidence: 0.2, timestampMs: 1 });
    assert.equal(result.stable, false);
    assert.equal(result.count, 0);
  });
});
