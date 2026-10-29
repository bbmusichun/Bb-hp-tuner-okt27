import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDetectionArmed, nextAutoDetectionMode, normalizeAutoDetectionMode } from './detectionModes';

test('supports continuous, single-shot and off modes, with backward-compatible legacy bool', () => {
  assert.equal(normalizeAutoDetectionMode('continuous'), 'continuous');
  assert.equal(normalizeAutoDetectionMode('single-shot'), 'single-shot');
  assert.equal(normalizeAutoDetectionMode('off'), 'off');
  assert.equal(normalizeAutoDetectionMode(undefined, false), 'off');
  assert.equal(normalizeAutoDetectionMode(undefined, true), 'continuous');
  assert.equal(normalizeAutoDetectionMode('invalid'), 'continuous');
});

test('single-shot detection disarms after one accepted target while continuous stays armed', () => {
  assert.equal(isDetectionArmed('continuous', false), true);
  assert.equal(isDetectionArmed('continuous', true), true);
  assert.equal(isDetectionArmed('single-shot', false), true);
  assert.equal(isDetectionArmed('single-shot', true), false);
  assert.equal(isDetectionArmed('off', false), false);
});

test('mode cycling advances continuous -> single-shot -> off -> continuous', () => {
  assert.equal(nextAutoDetectionMode('continuous'), 'single-shot');
  assert.equal(nextAutoDetectionMode('single-shot'), 'off');
  assert.equal(nextAutoDetectionMode('off'), 'continuous');
});
