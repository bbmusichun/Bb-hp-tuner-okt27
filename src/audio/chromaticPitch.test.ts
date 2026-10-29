import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChromaticTargetNote, CHROMATIC_MIN_MIDI, CHROMATIC_MAX_MIDI, midiFromFrequency } from './chromaticPitch';

test('builds a chromatic target with the expected fundamental and partials', () => {
  const target = buildChromaticTargetNote(69, 440, 'd-kurd-9', {});
  assert.ok(target);
  assert.equal(target.noteName, 'A4');
  assert.ok(Math.abs(target.frequency - 440) < 1e-8);
  assert.ok(Math.abs(target.octaveFreq - 880) < 1e-8);
  assert.ok(Math.abs(target.fifthFreq - 1320) < 1e-8);
});

test('applies saved per-note octave and third-partial calibration offsets', () => {
  const target = buildChromaticTargetNote(60, 440, 'd-kurd-9', {
    'd-kurd-9:C4': { octaveCents: -10, thirdPartialCents: 15 },
  });
  assert.ok(target);
  assert.ok(Math.abs(target.octaveFreq - target.frequency * 2 * Math.pow(2, -10 / 1200)) < 1e-8);
  assert.ok(Math.abs(target.fifthFreq - target.frequency * 3 * Math.pow(2, 15 / 1200)) < 1e-8);
});

test('rejects out-of-range and non-integer MIDI notes', () => {
  assert.equal(buildChromaticTargetNote(CHROMATIC_MIN_MIDI - 1, 440, 'scale', {}), null);
  assert.equal(buildChromaticTargetNote(CHROMATIC_MAX_MIDI + 1, 440, 'scale', {}), null);
  assert.equal(buildChromaticTargetNote(60.5, 440, 'scale', {}), null);
  assert.equal(buildChromaticTargetNote(60, Number.NaN, 'scale', {}), null);
});

test('maps target frequencies back to the selected A4 reference', () => {
  assert.equal(midiFromFrequency(440, 440), 69);
  assert.equal(midiFromFrequency(442, 442), 69);
});
