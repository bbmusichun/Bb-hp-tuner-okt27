import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DecayDriftTracker } from './decayDrift';

const hzAtCents = (base: number, cents: number) => base * 2 ** (cents / 1200);

describe('decay drift tracker', () => {
  it('reports observed drift and regression slope for a monotonic decay-window shift', () => {
    const tracker = new DecayDriftTracker({ minDurationMs: 200 });
    const results = [0, 1, 2, 3, 4].map((cents, index) =>
      tracker.observe({ frequencyHz: hzAtCents(146.832, cents), timestampMs: index * 100 })
    );
    const result = results[4];
    assert.ok(result);
    assert.ok(Math.abs(result.driftCents - 4) < 1e-8);
    assert.ok(Math.abs(result.rangeCents - 4) < 1e-8);
    assert.ok(Math.abs(result.slopeCentsPerSecond - 10) < 1e-8);
    assert.equal(result.sampleCount, 5);
    assert.equal(result.durationMs, 400);
  });

  it('does not report a profile before enough time and samples are available', () => {
    const tracker = new DecayDriftTracker({ minSamples: 4, minDurationMs: 300 });
    assert.equal(tracker.observe({ frequencyHz: 220, timestampMs: 0 }), null);
    assert.equal(tracker.observe({ frequencyHz: 220, timestampMs: 100 }), null);
    assert.equal(tracker.observe({ frequencyHz: 220, timestampMs: 200 }), null);
  });

  it('keeps only the configured recent time window', () => {
    const tracker = new DecayDriftTracker({ windowMs: 300, minDurationMs: 100 });
    [0, 100, 200, 300, 400].forEach((time, index) => {
      tracker.observe({ frequencyHz: hzAtCents(220, index), timestampMs: time });
    });
    const result = tracker.observe({ frequencyHz: hzAtCents(220, 5), timestampMs: 500 });
    assert.ok(result);
    assert.equal(result.sampleCount, 4);
    assert.equal(result.durationMs, 300);
    assert.ok(Math.abs(result.driftCents - 3) < 1e-8);
  });

  it('resets on invalid samples and non-monotonic timestamps', () => {
    const tracker = new DecayDriftTracker({ minDurationMs: 100 });
    tracker.observe({ frequencyHz: 220, timestampMs: 0 });
    tracker.observe({ frequencyHz: 220, timestampMs: 100 });
    assert.equal(tracker.observe({ frequencyHz: Number.NaN, timestampMs: 200 }), null);
    assert.equal(tracker.observe({ frequencyHz: 220, timestampMs: 300 }), null);
    assert.equal(tracker.observe({ frequencyHz: 220, timestampMs: 250 }), null);
  });
});
