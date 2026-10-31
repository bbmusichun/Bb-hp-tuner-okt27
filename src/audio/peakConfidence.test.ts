import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReliableResonanceConfidence, isTrackableResonancePeak, resonanceConfidenceFromDb } from './peakConfidence';

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

test('ambiguous peaks are quarantined even when their amplitude is strong', () => {
  const confidence = resonanceConfidenceFromDb(-45);
  assert.equal(isTrackableResonancePeak(true, confidence), false);
});

test('only sufficiently strong unambiguous peaks enter temporal tracking', () => {
  assert.equal(isTrackableResonancePeak(false, resonanceConfidenceFromDb(-70)), true);
  assert.equal(isTrackableResonancePeak(false, resonanceConfidenceFromDb(-80)), false);
  assert.equal(isTrackableResonancePeak(false, Number.NaN), false);
});
