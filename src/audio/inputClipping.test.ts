import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNearDigitalClipPeak } from './inputClipping';

test('flags peaks at or above the near-full-scale threshold', () => {
  assert.equal(isNearDigitalClipPeak(0.999), true);
  assert.equal(isNearDigitalClipPeak(1), true);
  assert.equal(isNearDigitalClipPeak(0.9989), false);
});

test('rejects invalid samples and threshold settings', () => {
  assert.equal(isNearDigitalClipPeak(Number.NaN), false);
  assert.equal(isNearDigitalClipPeak(Number.POSITIVE_INFINITY), false);
  assert.equal(isNearDigitalClipPeak(1, 0), false);
  assert.equal(isNearDigitalClipPeak(1, 1.1), false);
});
