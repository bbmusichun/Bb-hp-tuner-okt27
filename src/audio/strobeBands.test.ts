import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STROBE_BANDS, calibrateStrobeBandToMeasuredFrequency, getStrobeBandTargetHz, normalizeStrobeBands, parseStrobeTargetExpression, parseStrobeTargetExpressionParts } from './strobeBands';

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
      { id: 'custom-ratio', name: 'Ratio target', source: 'custom', targetHz: 660, centsOffset: 0, enabled: true, targetMode: 'ratio', targetValue: 1.5 },
      { id: 'custom-a', name: 'Duplicate', source: 'fifth', targetHz: 440, centsOffset: 0, enabled: true },
      { id: 'bad', name: 'Bad Hz', source: 'octave', targetHz: -1, centsOffset: 0, enabled: true },
      { id: 'bad-source', name: 'Bad source', source: 'noise', targetHz: 440, centsOffset: 0, enabled: true },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'custom-a');
    assert.equal(result[0].targetHz, 220);
    assert.equal(result[0].targetMode, 'absolute');
    assert.equal(result[1].targetMode, 'ratio');
    assert.equal(result[1].targetValue, 1.5);
  });

  it('uses safe defaults when storage is missing or contains no valid entries', () => {
    assert.equal(normalizeStrobeBands(null).length, 3);
    assert.deepEqual(normalizeStrobeBands([]), []);
    assert.equal(normalizeStrobeBands([{ id: 'custom', name: 'Custom 500', source: 'custom', targetHz: 500, centsOffset: 0, enabled: true }])[0].source, 'custom');
    assert.equal(normalizeStrobeBands([{ id: 'x', name: '', source: 'fundamental', targetHz: 440, centsOffset: 0, enabled: true }]).length, 3);
  });

  it('keeps ratio and cents targets relative to the selected fundamental', () => {
    const ratioBand = {
      ...DEFAULT_STROBE_BANDS[0],
      targetHz: 300,
      targetMode: 'ratio' as const,
      targetValue: 1.5,
    };
    assert.ok(Math.abs(getStrobeBandTargetHz(ratioBand, 146.832384) - 220.248576) < 0.001);
    const fifthBand = { ...ratioBand, targetMode: 'cents' as const, targetValue: 700 };
    assert.ok(Math.abs(getStrobeBandTargetHz(fifthBand, 146.832384) - 220) < 0.01);
    assert.equal(parseStrobeTargetExpressionParts('3/2')?.mode, 'ratio');
    assert.equal(parseStrobeTargetExpressionParts('700c')?.mode, 'cents');
  });

  it('applies cent offsets using logarithmic pitch ratios', () => {
    const band = { ...DEFAULT_STROBE_BANDS[0], targetHz: 440, centsOffset: 100 };
    assert.ok(Math.abs(getStrobeBandTargetHz(band) - 466.1637615) < 0.001);
    assert.ok(Math.abs(getStrobeBandTargetHz({ ...band, centsOffset: -100 }) - 415.3046976) < 0.001);
  });
});


describe('custom strobe target expressions', () => {
  it('parses absolute Hz and ratio/cents expressions relative to the selected fundamental', () => {
    assert.equal(parseStrobeTargetExpression('440'), 440);
    assert.equal(parseStrobeTargetExpression('3/2'), 660);
    assert.equal(parseStrobeTargetExpression('x1.5'), 660);
    assert.ok(Math.abs((parseStrobeTargetExpression('700c') ?? 0) - 659.255) < 0.2);
    assert.ok(Math.abs((parseStrobeTargetExpression('-100¢') ?? 0) - 415.3047) < 0.001);
  });
  it('rejects invalid and out-of-range expressions', () => {
    assert.equal(parseStrobeTargetExpression(''), null);
    assert.equal(parseStrobeTargetExpression('0/2'), null);
    assert.equal(parseStrobeTargetExpression('999999'), null);
    assert.equal(parseStrobeTargetExpression('2000c'), null);
    assert.equal(parseStrobeTargetExpression('440', 0), null);
    assert.ok(Math.abs((parseStrobeTargetExpression('3/2', 146.832384) ?? 0) - 220.248576) < 0.001);
  });
});

describe('one-tap custom band calibration', () => {
  it('moves only the target offset so the measured frequency becomes the new target', () => {
    const band = { ...DEFAULT_STROBE_BANDS[0], source: 'custom' as const, targetHz: 440, centsOffset: 0 };
    const measuredHz = 442;
    const calibrated = calibrateStrobeBandToMeasuredFrequency(band, measuredHz, 146.8);
    assert.ok(calibrated);
    assert.ok(Math.abs(getStrobeBandTargetHz(calibrated!, 146.8) - measuredHz) < 0.001);
    assert.equal(band.centsOffset, 0);
    assert.notEqual(calibrated!.centsOffset, band.centsOffset);
  });

  it('keeps relative ratio targets coupled to the base after calibration', () => {
    const band = { ...DEFAULT_STROBE_BANDS[0], source: 'custom' as const, targetHz: 220, centsOffset: 0, targetMode: 'ratio' as const, targetValue: 1.5 };
    const baseHz = 146.832384;
    const measuredHz = 221.3;
    const calibrated = calibrateStrobeBandToMeasuredFrequency(band, measuredHz, baseHz);
    assert.ok(calibrated);
    assert.ok(Math.abs(getStrobeBandTargetHz(calibrated!, baseHz) - measuredHz) < 0.001);
    assert.ok(Math.abs(getStrobeBandTargetHz(calibrated!, baseHz * 2) - measuredHz * 2) < 0.01);
  });

  it('rejects invalid frequencies or target offsets outside the supported range', () => {
    const band = { ...DEFAULT_STROBE_BANDS[0], source: 'custom' as const, targetHz: 440, centsOffset: 1199 };
    assert.equal(calibrateStrobeBandToMeasuredFrequency(band, 20, 146.8), null);
    assert.equal(calibrateStrobeBandToMeasuredFrequency(band, Number.NaN, 146.8), null);
  });
});
