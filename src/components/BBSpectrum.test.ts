import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSpectrumFrequencyRange } from './BBSpectrum';

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
