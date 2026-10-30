import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSpectrumCursorReadout,
  getSpectrumFrequencyRange,
  getSpectrumZoomRange,
} from './spectrumInteraction';

const D3 = 146.832384;

test('keeps all resonances visible in the full spectrum overview', () => {
  const range = getSpectrumFrequencyRange(D3);
  assert.ok(range.lowHz < D3);
  assert.ok(range.highHz > D3 * 3);
  assert.ok(Math.abs(range.lowHz - D3 * Math.pow(2, -1 / 12)) < 1e-9);
});

test('zooms around the exact target for each measured resonance', () => {
  const targets = { fundamentalHz: 147, octaveHz: 294.4, fifthHz: 442.7 };
  const fundamental = getSpectrumZoomRange(D3, targets, 'fundamental');
  const octave = getSpectrumZoomRange(D3, targets, 'octave');
  const fifth = getSpectrumZoomRange(D3, targets, 'fifth');

  assert.ok(fundamental.lowHz < targets.fundamentalHz && fundamental.highHz > targets.fundamentalHz);
  assert.ok(octave.lowHz < targets.octaveHz && octave.highHz > targets.octaveHz);
  assert.ok(fifth.lowHz < targets.fifthHz && fifth.highHz > targets.fifthHz);
  assert.ok(Math.abs(octave.lowHz / targets.octaveHz - Math.pow(2, -300 / 1200)) < 1e-12);
});

test('falls back to harmonic targets when a supplied zoom target is invalid', () => {
  const range = getSpectrumZoomRange(D3, {
    fundamentalHz: Number.NaN,
    octaveHz: -1,
    fifthHz: 0,
  }, 'fifth');
  const expectedTarget = D3 * 3;
  assert.ok(Math.abs(range.lowHz / expectedTarget - Math.pow(2, -300 / 1200)) < 1e-12);
});

test('maps a pointer to frequency, dBFS and ratio relative to the fundamental', () => {
  const readout = getSpectrumCursorReadout(
    399,
    174,
    { left: 54, top: 84, width: 690, height: 180 },
    { lowHz: 100, highHz: 300 },
    100,
  );
  assert.ok(readout);
  assert.equal(readout.frequencyHz, 200);
  assert.equal(readout.dbfs, -60);
  assert.equal(readout.ratioToFundamental, 2);
  assert.equal(readout.centsFromFundamental, 1200);
});

test('does not return a cursor readout outside the plot or for invalid bounds', () => {
  const plot = { left: 54, top: 84, width: 690, height: 180 };
  const range = { lowHz: 100, highHz: 300 };
  assert.equal(getSpectrumCursorReadout(53, 174, plot, range, 100), null);
  assert.equal(getSpectrumCursorReadout(399, 265, plot, range, 100), null);
  assert.equal(getSpectrumCursorReadout(399, 174, { ...plot, width: 0 }, range, 100), null);
});
