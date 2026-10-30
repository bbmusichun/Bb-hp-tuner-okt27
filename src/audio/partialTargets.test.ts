import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calibratePartialTargetOffset,
  clampPartialTargetOffset,
  normalizePartialTargetOffsets,
  partialTargetFrequency,
  partialTargetOffsetKey,
} from './partialTargets';

const D3 = 146.832384;

describe('custom handpan partial targets', () => {
  it('uses exact harmonic ratios when the custom offset is zero', () => {
    assert.equal(partialTargetFrequency(D3, 2, 0), D3 * 2);
    assert.equal(partialTargetFrequency(D3, 3, 0), D3 * 3);
  });

  it('applies octave and third-partial offsets independently in cents', () => {
    const octave = partialTargetFrequency(D3, 2, 12);
    const third = partialTargetFrequency(D3, 3, -7);
    assert.ok(Math.abs(1200 * Math.log2(octave / (D3 * 2)) - 12) < 1e-9);
    assert.ok(Math.abs(1200 * Math.log2(third / (D3 * 3)) + 7) < 1e-9);
  });

  it('clamps offsets to the supported range and ignores invalid values', () => {
    assert.equal(clampPartialTargetOffset(150), 50);
    assert.equal(clampPartialTargetOffset(-150), -50);
    assert.equal(clampPartialTargetOffset(Number.NaN), 0);
    assert.equal(partialTargetFrequency(D3, 2, 1000), partialTargetFrequency(D3, 2, 50));
    assert.ok(Number.isNaN(partialTargetFrequency(0, 2, 0)));
  });

  it('creates stable per-scale, per-note preference keys', () => {
    assert.equal(partialTargetOffsetKey('d-kurd-9', 'D3'), 'd-kurd-9:D3');
    assert.notEqual(partialTargetOffsetKey('d-kurd-9', 'D3'), partialTargetOffsetKey('e-pygmy-9', 'D3'));
  });

  it('sanitizes persisted values and omits zero-offset entries', () => {
    assert.deepEqual(normalizePartialTargetOffsets(null), {});
    assert.deepEqual(normalizePartialTargetOffsets({
      'd-kurd-9:D3': { fundamentalCents: 0, octaveCents: 12, thirdPartialCents: -4 },
      'd-kurd-9:A3': { octaveCents: 0, thirdPartialCents: 0 },
      'd-kurd-9:Bad': { octaveCents: Number.NaN, thirdPartialCents: 200 },
      '': { octaveCents: 3, thirdPartialCents: 0 },
    }), {
      'd-kurd-9:D3': { octaveCents: 12, thirdPartialCents: -4 },
      'd-kurd-9:Bad': { fundamentalCents: 0, octaveCents: 0, thirdPartialCents: 50 },
    });
  });
});


describe('core resonance calibration', () => {
  const defaults = { fundamentalCents: 0, octaveCents: 0, thirdPartialCents: 0 } as const;

  it('calibrates each core resonance independently to the measured frequency', () => {
    const root = calibratePartialTargetOffset(defaults, 'fundamentalCents', 147, 146.832384);
    assert.ok(root);
    assert.ok(Math.abs(partialTargetFrequency(146.832384, 1, root.fundamentalCents) - 147) < 1e-8);
    const octave = calibratePartialTargetOffset(defaults, 'octaveCents', 294.5, 293.664768);
    assert.ok(octave);
    assert.ok(Math.abs(partialTargetFrequency(146.832384, 2, octave.octaveCents) - 294.5) < 1e-8);
    const third = calibratePartialTargetOffset(defaults, 'thirdPartialCents', 441.5, 440.497152);
    assert.ok(third);
    assert.ok(Math.abs(partialTargetFrequency(146.832384, 3, third.thirdPartialCents) - 441.5) < 1e-8);
  });

  it('adds calibration to the current offset and preserves the other resonance offsets', () => {
    const current = { fundamentalCents: 2, octaveCents: -3, thirdPartialCents: 5 };
    const calibrated = calibratePartialTargetOffset(current, 'octaveCents', 294, 293.5);
    assert.ok(calibrated);
    assert.equal(calibrated.fundamentalCents, 2);
    assert.equal(calibrated.thirdPartialCents, 5);
    assert.ok(calibrated.octaveCents > -3);
  });

  it('rejects invalid measurements and corrections beyond the ±50 cent profile range', () => {
    assert.equal(calibratePartialTargetOffset(defaults, 'fundamentalCents', null, 146), null);
    assert.equal(calibratePartialTargetOffset(defaults, 'octaveCents', Number.NaN, 293), null);
    assert.equal(calibratePartialTargetOffset(defaults, 'thirdPartialCents', 1000, 440), null);
    assert.equal(calibratePartialTargetOffset({ ...defaults, octaveCents: 49 }, 'octaveCents', 300, 293), null);
  });
});
