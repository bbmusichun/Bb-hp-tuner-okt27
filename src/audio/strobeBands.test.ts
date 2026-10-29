import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STROBE_BANDS, getStrobeBandTargetHz, normalizeStrobeBands } from './strobeBands';

describe('Hangoal configurable strobe band model', () => {
  it('provides three compatible default resonance bands', () => {
    assert.equal(DEFAULT_STROBE_BANDS.length, 3);
    assert.equal(DEFAULT_STROBE_BANDS[0].source, 'fundamental');
    assert.equal(DEFAULT_STROBE_BANDS[1].source, 'fifth');
    assert.equal(DEFAULT_STROBE_BANDS[2].source, 'octave');
  });

  it('normalizes valid persisted bands and rejects malformed entries', () => {
    const result = normalizeStrobeBands([
      { id: 'custom-a', name: 'Custom A', source: 'fundamental', targetHz: 220, centsOffset: 12, enabled: true },
      { id: 'custom-a', name: 'Duplicate', source: 'fifth', targetHz: 440, centsOffset: 0, enabled: true },
      { id: 'bad', name: 'Bad Hz', source: 'octave', targetHz: -1, centsOffset: 0, enabled: true },
      { id: 'bad-source', name: 'Bad source', source: 'noise', targetHz: 440, centsOffset: 0, enabled: true },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'custom-a');
    assert.equal(result[0].targetHz, 220);
  });

  it('uses safe defaults when storage is missing or contains no valid entries', () => {
    assert.equal(normalizeStrobeBands(null).length, 3);
    assert.equal(normalizeStrobeBands([{ id: 'x', name: '', source: 'fundamental', targetHz: 440, centsOffset: 0, enabled: true }]).length, 3);
  });

  it('applies cent offsets using logarithmic pitch ratios', () => {
    const band = { ...DEFAULT_STROBE_BANDS[0], targetHz: 440, centsOffset: 100 };
    assert.ok(Math.abs(getStrobeBandTargetHz(band) - 466.1637615) < 0.001);
    assert.ok(Math.abs(getStrobeBandTargetHz({ ...band, centsOffset: -100 }) - 415.3046976) < 0.001);
  });
});
