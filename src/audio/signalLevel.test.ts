import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isUsableSignalLevel, MIN_USABLE_SIGNAL_DB } from './signalLevel';

describe('quiet handpan decay signal gate', () => {
  it('keeps the real D3 sample tail measurable at about -70.7 dBFS RMS', () => {
    assert.equal(isUsableSignalLevel(-70.7), true);
  });

  it('rejects the sample noise-level tail around -81.4 dBFS RMS', () => {
    assert.equal(isUsableSignalLevel(-81.4), false);
  });

  it('uses a strict configurable threshold and rejects invalid values', () => {
    assert.equal(MIN_USABLE_SIGNAL_DB, -72);
    assert.equal(isUsableSignalLevel(-72), false);
    assert.equal(isUsableSignalLevel(-71.9), true);
    assert.equal(isUsableSignalLevel(Number.NaN), false);
    assert.equal(isUsableSignalLevel(-60, Number.NaN), false);
  });
});
