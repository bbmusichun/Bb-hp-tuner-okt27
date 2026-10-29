import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateNoiseFloorDb, findLocalSpectralPeaks, inspectTargetPeak } from './peakDiagnostics';

function makeSpectrum(): Float32Array {
  const spectrum = new Float32Array(8192).fill(-95);
  return spectrum;
}

test('noise floor uses the median so a handful of strong partials do not dominate it', () => {
  const spectrum = makeSpectrum();
  spectrum[150] = -25;
  spectrum[151] = -50;
  spectrum[400] = -31;
  assert.equal(estimateNoiseFloorDb(spectrum, 48000, 100, 1000), -95);
});

test('local spectral peaks return distinct local maxima strongest first', () => {
  const spectrum = makeSpectrum();
  spectrum[150] = -30;
  spectrum[151] = -55;
  spectrum[155] = -35;
  spectrum[154] = -60;
  const peaks = findLocalSpectralPeaks(spectrum, 48000, 400, 480, -82, 5, 2);
  assert.equal(peaks.length, 2);
  assert.ok(peaks[0].magDb > peaks[1].magDb);
  assert.notEqual(peaks[0].bin, peaks[1].bin);
});

test('inspection flags a pair of separated, similarly strong peaks near a target', () => {
  const spectrum = makeSpectrum();
  spectrum[150] = -30;
  spectrum[151] = -55;
  spectrum[155] = -35;
  spectrum[154] = -60;
  const result = inspectTargetPeak(spectrum, 48000, 440, 150, -82);
  assert.ok(result.primary);
  assert.ok(result.secondary);
  assert.ok(result.separationCents !== null && result.separationCents > 1);
  assert.equal(result.possibleDoublePeak, true);
});

test('inspection does not call an isolated main peak a double peak', () => {
  const spectrum = makeSpectrum();
  spectrum[150] = -30;
  spectrum[149] = -55;
  spectrum[151] = -55;
  const result = inspectTargetPeak(spectrum, 48000, 440, 150, -82);
  assert.ok(result.primary);
  assert.equal(result.secondary, null);
  assert.equal(result.possibleDoublePeak, false);
});

test('invalid target frequencies safely return an empty diagnostic', () => {
  const spectrum = makeSpectrum();
  const result = inspectTargetPeak(spectrum, 48000, Number.NaN);
  assert.equal(result.primary, null);
  assert.equal(result.secondary, null);
  assert.equal(result.possibleDoublePeak, false);
});
