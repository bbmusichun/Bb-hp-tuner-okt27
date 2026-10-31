import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTuningToleranceSetting,
  isValidTuningToleranceSetting,
  isWithinTuningTolerance,
  normalizeTuningToleranceSetting,
  tuningToleranceCents,
} from './tuningTolerance';

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
    assert.equal(tuningToleranceCents(20000), 3);
  });

  it('rejects missing, non-finite and invalid targets in every mode', () => {
    for (const setting of [null, 2, 'always', 'never'] as const) {
      assert.equal(isWithinTuningTolerance(null, 146.83, setting), false);
      assert.equal(isWithinTuningTolerance(Number.NaN, 146.83, setting), false);
      assert.equal(isWithinTuningTolerance(0, 0, setting), false);
      assert.equal(isWithinTuningTolerance(0, null, setting), false);
    }
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

  it('accepts any finite measured deviation in always mode without altering it', () => {
    assert.equal(isWithinTuningTolerance(450, 146.832384, 'always'), true);
    assert.equal(isWithinTuningTolerance(-125, 440, 'always'), true);
  });

  it('never accepts a measured deviation in never-green mode', () => {
    assert.equal(isWithinTuningTolerance(0, 146.832384, 'never'), false);
    assert.equal(isWithinTuningTolerance(0.1, 146.832384, 'never'), false);
    assert.equal(isWithinTuningTolerance(-35, 440, 'never'), false);
  });

  it('validates and normalizes persisted tolerance modes without changing old backups', () => {
    assert.equal(isValidTuningToleranceSetting(null), true);
    assert.equal(isValidTuningToleranceSetting(2), true);
    assert.equal(isValidTuningToleranceSetting('always'), true);
    assert.equal(isValidTuningToleranceSetting('never'), true);
    assert.equal(isValidTuningToleranceSetting('sometimes'), false);
    assert.equal(isValidTuningToleranceSetting(0), false);
    assert.equal(normalizeTuningToleranceSetting('always'), 'always');
    assert.equal(normalizeTuningToleranceSetting('never'), 'never');
    assert.equal(normalizeTuningToleranceSetting(5), 5);
    assert.equal(normalizeTuningToleranceSetting('invalid'), null);
    assert.equal(normalizeTuningToleranceSetting(undefined), null);
  });

  it('formats each tolerance mode clearly for the UI and measurement log', () => {
    assert.equal(formatTuningToleranceSetting(null, 146.832384), '±1.5 cent');
    assert.equal(formatTuningToleranceSetting(3, 146.832384), '±3.0 cent');
    assert.equal(formatTuningToleranceSetting('always', 146.832384), 'Minden eltérés elfogadása');
    assert.equal(formatTuningToleranceSetting('never', 146.832384), 'Soha ne legyen zöld');
  });
});
