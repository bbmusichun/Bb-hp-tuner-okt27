import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinTuningTolerance, tuningToleranceCents } from './tuningTolerance';

describe('frequency-dependent tuning tolerance', () => {
  it('uses a strict threshold at low fundamentals and expands smoothly upward', () => {
    const fundamental = tuningToleranceCents(146.832384);
    const octave = tuningToleranceCents(293.664768);
    const thirdPartial = tuningToleranceCents(440.497152);
    assert.equal(fundamental, 1.5);
    assert.ok(octave > fundamental && thirdPartial > octave);
    assert.ok(thirdPartial < 3);
  });

  it('bounds the threshold for unusually low or high target frequencies', () => {
    assert.equal(tuningToleranceCents(20), 1.5);
    assert.equal(tuningToleranceCents(20000), 4);
  });

  it('rejects missing, non-finite and invalid targets', () => {
    assert.equal(isWithinTuningTolerance(null, 146.83), false);
    assert.equal(isWithinTuningTolerance(Number.NaN, 146.83), false);
    assert.equal(isWithinTuningTolerance(0, 0), false);
  });

  it('uses an explicit fixed tolerance when configured, otherwise keeps adaptive thresholds', () => {
    assert.equal(tuningToleranceCents(146.832384, 2), 2);
    assert.equal(isWithinTuningTolerance(1.99, 146.832384, 2), true);
    assert.equal(isWithinTuningTolerance(-2, 146.832384, 2), true);
    assert.equal(isWithinTuningTolerance(2.01, 146.832384, 2), false);
    assert.equal(tuningToleranceCents(146.832384, null), 1.5);
    assert.equal(tuningToleranceCents(146.832384, 0), 1.5);
    assert.equal(tuningToleranceCents(146.832384, 21), 1.5);
  });

  it('uses the same threshold for positive and negative detuning', () => {
    const tol = tuningToleranceCents(293.664768);
    assert.equal(isWithinTuningTolerance(tol, 293.664768), true);
    assert.equal(isWithinTuningTolerance(-tol, 293.664768), true);
    assert.equal(isWithinTuningTolerance(tol + 0.01, 293.664768), false);
  });
});
