import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STROBE_BANDS, getStrobeBandTargetHz, normalizeStrobeBands, parseStrobeTargetExpression } from './strobeBands';

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
    assert.deepEqual(normalizeStrobeBands([]), []);
    assert.equal(normalizeStrobeBands([{ id: 'custom', name: 'Custom 500', source: 'custom', targetHz: 500, centsOffset: 0, enabled: true }])[0].source, 'custom');
    assert.equal(normalizeStrobeBands([{ id: 'x', name: '', source: 'fundamental', targetHz: 440, centsOffset: 0, enabled: true }]).length, 3);
  });

  it('applies cent offsets using logarithmic pitch ratios', () => {
    const band = { ...DEFAULT_STROBE_BANDS[0], targetHz: 440, centsOffset: 100 };
    assert.ok(Math.abs(getStrobeBandTargetHz(band) - 466.1637615) < 0.001);
    assert.ok(Math.abs(getStrobeBandTargetHz({ ...band, centsOffset: -100 }) - 415.3046976) < 0.001);
  });
});


describe('custom strobe target expressions', () => {
  it('parses Hz, ratios, multipliers, and cents relative to A4', () => {
    assert.equal(parseStrobeTargetExpression('440'), 440);
    assert.equal(parseStrobeTargetExpression('3/2'), 660);
    assert.equal(parseStrobeTargetExpression('x1.5'), 660);
    assert.ok(Math.abs((parseStrobeTargetExpression('702c') ?? 0) - 659.255) < 0.2);
    assert.ok(Math.abs((parseStrobeTargetExpression('-100¢') ?? 0) - 415.3047) < 0.001);
  });
  it('rejects invalid and out-of-range expressions', () => {
    assert.equal(parseStrobeTargetExpression(''), null);
    assert.equal(parseStrobeTargetExpression('0/2'), null);
    assert.equal(parseStrobeTargetExpression('999999'), null);
    assert.equal(parseStrobeTargetExpression('2000c'), null);
    assert.equal(parseStrobeTargetExpression('440', 0), null);
  });
});
