import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSpectrumDisplayRange, getSpectrumFrequencyRange } from './BBSpectrum';

test('D3 overview range includes fundamental, octave and third partial with one-semitone margins', () => {
  const base = 146.83;
  const { lowHz, highHz } = getSpectrumFrequencyRange(base);
  assert.ok(lowHz < base);
  assert.ok(lowHz > base * Math.pow(2, -2 / 12));
  assert.ok(highHz > base * 3);
  assert.ok(highHz < base * 3 * Math.pow(2, 2 / 12));
  assert.ok(base * 2 > lowHz && base * 2 < highHz);
  assert.ok(base * 3 > lowHz && base * 3 < highHz);
});

test('spectrum range safely falls back for invalid target frequencies', () => {
  const expected = getSpectrumFrequencyRange(146.83);
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(getSpectrumFrequencyRange(invalid), expected);
  }
});

test('target zoom centers the display on a strobe band', () => {
  const target = 440;
  const { lowHz, highHz } = getSpectrumDisplayRange(146.83, target);
  assert.ok(lowHz < target && highHz > target);
  assert.ok(Math.abs(1200 * Math.log2(target / lowHz) - 260) < 0.01);
  assert.ok(Math.abs(1200 * Math.log2(highHz / target) - 260) < 0.01);
});

test('invalid zoom values retain the full 1x-to-3x overview', () => {
  const expected = getSpectrumFrequencyRange(146.83);
  for (const invalid of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(getSpectrumDisplayRange(146.83, invalid), expected);
  }
});
