import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { modeWheelRotationSteps, rotateEnabledMode } from './scaleMode';

describe('rotatable scale mode mask', () => {
  it('rotates enabled degrees while preserving their count and note ids', () => {
    const ids = ['d', 'e', 'f', 'g', 'a'];
    assert.deepEqual(rotateEnabledMode(ids, ['d', 'f', 'a'], 1), ['e', 'g', 'd']);
    assert.equal(rotateEnabledMode(ids, ['d', 'f', 'a'], 1).length, 3);
  });

  it('supports negative rotation and wraps around the scale', () => {
    const ids = ['a', 'b', 'c', 'd'];
    assert.deepEqual(rotateEnabledMode(ids, ['a', 'c'], -1), ['b', 'd']);
    assert.deepEqual(rotateEnabledMode(ids, ['a', 'c'], 4), ['a', 'c']);
    assert.deepEqual(rotateEnabledMode(ids, ['a', 'c'], -4), ['a', 'c']);
  });

  it('returns an empty mask for no notes and handles no enabled notes', () => {
    assert.deepEqual(rotateEnabledMode([], ['a'], 1), []);
    assert.deepEqual(rotateEnabledMode(['a', 'b'], [], 1), []);
  });

  it('converts clockwise/counterclockwise drags to signed scale steps', () => {
    const stepAngle = 2 * Math.PI / 8;
    assert.equal(modeWheelRotationSteps(0, -stepAngle, 8), 1);
    assert.equal(modeWheelRotationSteps(0, stepAngle, 8), -1);
    assert.equal(modeWheelRotationSteps(0, 0.01, 8), 0);
    assert.equal(modeWheelRotationSteps(0, Math.PI * 1.5, 8), 2);
  });

  it('rejects invalid pointer geometry', () => {
    assert.equal(modeWheelRotationSteps(Number.NaN, 1, 8), 0);
    assert.equal(modeWheelRotationSteps(0, 1, 0), 0);
    assert.equal(modeWheelRotationSteps(0, 1, 1.5), 0);
  });
});
