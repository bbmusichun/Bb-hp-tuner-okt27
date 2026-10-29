import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReferenceToneMode, shouldTriggerStrikeReferenceTone } from './referenceToneModes';

test('validates persistent reference tone modes with a backward-compatible default', () => {
  assert.equal(normalizeReferenceToneMode('continuous'), 'continuous');
  assert.equal(normalizeReferenceToneMode('strike'), 'strike');
  assert.equal(normalizeReferenceToneMode('off'), 'off');
  assert.equal(normalizeReferenceToneMode('unknown'), 'continuous');
  assert.equal(normalizeReferenceToneMode(null), 'continuous');
});

test('strike mode triggers only once on the rising edge of a transient during microphone measurement', () => {
  assert.equal(shouldTriggerStrikeReferenceTone('strike', true, true, false), true);
  assert.equal(shouldTriggerStrikeReferenceTone('strike', true, true, true), false);
  assert.equal(shouldTriggerStrikeReferenceTone('strike', true, false, false), false);
  assert.equal(shouldTriggerStrikeReferenceTone('strike', false, true, false), false);
  assert.equal(shouldTriggerStrikeReferenceTone('continuous', true, true, false), false);
  assert.equal(shouldTriggerStrikeReferenceTone('off', true, true, false), false);
});
