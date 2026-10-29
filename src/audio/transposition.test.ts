import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transposeFrequencyBySemitones } from './transposition';

test('transposes by one or more semitones using the equal-tempered ratio', () => {
  assert.ok(Math.abs(transposeFrequencyBySemitones(440, 12) - 880) < 1e-8);
  assert.ok(Math.abs(transposeFrequencyBySemitones(440, -12) - 220) < 1e-8);
  assert.ok(Math.abs(transposeFrequencyBySemitones(440, 1) - 440 * Math.pow(2, 1 / 12)) < 1e-8);
});

test('zero semitones preserves target frequency', () => {
  assert.equal(transposeFrequencyBySemitones(146.832384, 0), 146.832384);
});

test('rejects invalid frequencies and out-of-range transpose values', () => {
  for (const frequency of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.ok(Number.isNaN(transposeFrequencyBySemitones(frequency, 0)));
  }
  for (const shift of [-13, 13, 0.5, Number.NaN]) {
    assert.ok(Number.isNaN(transposeFrequencyBySemitones(440, shift)));
  }
});
