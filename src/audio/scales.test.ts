import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCents, freqToNoteAndCents, midiToFreq } from './scales';

describe('tuner pitch math', () => {
  it('maps A4 MIDI 69 to the selected reference frequency', () => {
    assert.equal(midiToFreq(69, 440), 440);
    assert.equal(midiToFreq(69, 432), 432);
  });

  it('converts MIDI pitches to standard equal-tempered frequencies', () => {
    assert.ok(Math.abs(midiToFreq(60, 440) - 261.625565) < 0.001);
    assert.ok(Math.abs(midiToFreq(50, 440) - 146.832384) < 0.001);
  });

  it('maps 1x, 2x and 3x resonance ratios to their expected notes', () => {
    const d3 = midiToFreq(50, 440);
    assert.equal(freqToNoteAndCents(d3, 440).note, 'D3');
    assert.equal(freqToNoteAndCents(d3 * 2, 440).note, 'D4');
    assert.equal(freqToNoteAndCents(d3 * 3, 440).note, 'A4');
  });

  it('reports zero cents for an exact reference and signed offsets around it', () => {
    assert.ok(Math.abs(calculateCents(440, 440)) < 1e-10);
    assert.ok(Math.abs(calculateCents(440 * Math.pow(2, 10 / 1200), 440) - 10) < 1e-8);
    assert.ok(Math.abs(calculateCents(440 * Math.pow(2, -10 / 1200), 440) + 10) < 1e-8);
  });

  it('rejects invalid frequency inputs instead of returning a false zero-cent result', () => {
    assert.ok(Number.isNaN(calculateCents(0, 440)));
    assert.ok(Number.isNaN(calculateCents(Number.NaN, 440)));
    assert.equal(freqToNoteAndCents(0, 440).note, '--');
    assert.equal(freqToNoteAndCents(440, 0).note, '--');
    assert.ok(Number.isNaN(midiToFreq(69, 0)));
  });

  it('keeps concert pitch calibration consistent across note conversions', () => {
    const pitch = freqToNoteAndCents(midiToFreq(69, 442), 442);
    assert.equal(pitch.note, 'A4');
    assert.ok(Math.abs(pitch.cents) < 1e-10);
  });
});
