import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameMeasurementTarget } from './measurementCache';

test('held reading is reusable for the same target', () => {
  assert.equal(isSameMeasurementTarget(220, 220), true);
  assert.equal(isSameMeasurementTarget(220, 220 * Math.pow(2, 0.2 / 1200)), true);
});

test('held reading is not reusable after an AUTO note change', () => {
  assert.equal(isSameMeasurementTarget(220, 246.9416506), false);
  assert.equal(isSameMeasurementTarget(146.832384, 164.813778), false);
});

test('invalid target frequencies never match', () => {
  assert.equal(isSameMeasurementTarget(0, 220), false);
  assert.equal(isSameMeasurementTarget(220, Number.NaN), false);
});
