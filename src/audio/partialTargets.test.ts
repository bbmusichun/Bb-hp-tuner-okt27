import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
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
      'd-kurd-9:D3': { octaveCents: 12, thirdPartialCents: -4 },
      'd-kurd-9:A3': { octaveCents: 0, thirdPartialCents: 0 },
      'd-kurd-9:Bad': { octaveCents: Number.NaN, thirdPartialCents: 200 },
      '': { octaveCents: 3, thirdPartialCents: 0 },
    }), {
      'd-kurd-9:D3': { octaveCents: 12, thirdPartialCents: -4 },
      'd-kurd-9:Bad': { octaveCents: 0, thirdPartialCents: 50 },
    });
  });
});
