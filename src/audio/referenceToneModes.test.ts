import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidReferenceToneModesByRole, normalizeReferenceToneMode, normalizeReferenceToneModesByRole, shouldTriggerStrikeReferenceTone } from './referenceToneModes';

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

test('normalizes independent modes for fundamental, third partial and octave', () => {
  const normalizeModes = normalizeReferenceToneModesByRole;
  assert.deepEqual(normalizeModes({
    fundamental: 'continuous',
    fifth: 'strike',
    octave: 'off',
  }), {
    fundamental: 'continuous',
    fifth: 'strike',
    octave: 'off',
  });
});

test('maps legacy global mode to all bands and fills only missing preference entries', () => {
  const normalizeModes = normalizeReferenceToneModesByRole;
  assert.deepEqual(normalizeModes(undefined, 'strike'), {
    fundamental: 'strike',
    fifth: 'strike',
    octave: 'strike',
  });
  assert.deepEqual(normalizeModes({
    fundamental: 'off',
    fifth: 'invalid',
  }, 'strike'), {
    fundamental: 'off',
    fifth: 'strike',
    octave: 'strike',
  });
});

test('strictly validates complete per-band configuration maps', () => {
  const isValidModes = isValidReferenceToneModesByRole;
  assert.equal(isValidModes({
    fundamental: 'continuous',
    fifth: 'strike',
    octave: 'off',
  }), true);
  assert.equal(isValidModes({
    fundamental: 'continuous',
    fifth: 'strike',
  }), false);
  assert.equal(isValidModes({
    fundamental: 'continuous',
    fifth: 'beep',
    octave: 'off',
  }), false);
});
