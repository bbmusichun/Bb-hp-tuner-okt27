import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReliableResonanceConfidence, resonanceConfidenceFromDb } from './peakConfidence';

test('weak peaks remain measurable but are not treated as reliable', () => {
  const weakPeak = resonanceConfidenceFromDb(-80);
  assert.ok(weakPeak > 0);
  assert.equal(isReliableResonanceConfidence(weakPeak), false);
});

test('stronger peaks can qualify as reliable', () => {
  assert.equal(isReliableResonanceConfidence(resonanceConfidenceFromDb(-70)), true);
});

test('invalid amplitude cannot create confidence', () => {
  assert.equal(resonanceConfidenceFromDb(Number.NaN), 0);
  assert.equal(isReliableResonanceConfidence(Number.NaN), false);
});
