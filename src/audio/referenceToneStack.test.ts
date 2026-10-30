import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getReferenceToneStackGain,
  MAX_REFERENCE_TONE_VOICES,
  normalizeReferenceToneFrequencies,
} from './referenceToneStack';

test('normalizes a stacked reference chord by dropping invalid and duplicate frequencies', () => {
  assert.deepEqual(
    normalizeReferenceToneFrequencies([440, 440, 0, Number.NaN, 293.664, -10, 20000, 880]),
    [440, 293.664, 880],
  );
});

test('limits the polyphonic reference stack to the supported number of voices', () => {
  const input = Array.from({ length: MAX_REFERENCE_TONE_VOICES + 3 }, (_, index) => 100 + index);
  assert.equal(normalizeReferenceToneFrequencies(input).length, MAX_REFERENCE_TONE_VOICES);
});

test('scales output gain down as voices are added and never exceeds the single-voice gain', () => {
  assert.equal(getReferenceToneStackGain(0), 0);
  assert.equal(getReferenceToneStackGain(1), 0.3);
  assert.ok(getReferenceToneStackGain(4) < getReferenceToneStackGain(1));
  assert.ok(getReferenceToneStackGain(MAX_REFERENCE_TONE_VOICES) > 0);
  assert.equal(getReferenceToneStackGain(MAX_REFERENCE_TONE_VOICES + 1), 0);
});
