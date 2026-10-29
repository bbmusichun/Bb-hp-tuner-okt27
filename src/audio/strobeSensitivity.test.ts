import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STROBE_SENSITIVITY,
  MAX_STROBE_SENSITIVITY,
  MIN_STROBE_SENSITIVITY,
  isValidStrobeSensitivity,
  normalizeStrobeSensitivity,
} from './strobeSensitivity';

test('strobe sensitivity defaults safely and clamps values to quarter steps', () => {
  assert.equal(normalizeStrobeSensitivity(undefined), DEFAULT_STROBE_SENSITIVITY);
  assert.equal(normalizeStrobeSensitivity(Number.NaN), DEFAULT_STROBE_SENSITIVITY);
  assert.equal(normalizeStrobeSensitivity(1.12), 1);
  assert.equal(normalizeStrobeSensitivity(1.14), 1.25);
  assert.equal(normalizeStrobeSensitivity(0.25), MIN_STROBE_SENSITIVITY);
  assert.equal(normalizeStrobeSensitivity(2.5), MAX_STROBE_SENSITIVITY);
});

test('strobe sensitivity validates supported bounds', () => {
  assert.equal(isValidStrobeSensitivity(1), true);
  assert.equal(isValidStrobeSensitivity(0.25), true);
  assert.equal(isValidStrobeSensitivity(2.5), true);
  assert.equal(isValidStrobeSensitivity(0.1), false);
  assert.equal(isValidStrobeSensitivity(3), false);
  assert.equal(isValidStrobeSensitivity('1'), false);
});
