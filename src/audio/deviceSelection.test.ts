import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAudioDeviceLabel, shouldRetryDefaultAudioInput } from './deviceSelection';

test('uses browser labels when available and useful fallback labels before permission', () => {
  assert.equal(formatAudioDeviceLabel('USB microphone', 'audioinput', 0), 'USB microphone');
  assert.equal(formatAudioDeviceLabel('', 'audioinput', 1), 'Mikrofon 2');
  assert.equal(formatAudioDeviceLabel('   ', 'audiooutput', 0), 'Hangkimenet 1');
});

test('retries the default microphone only for a stale or unsupported exact device constraint', () => {
  assert.equal(shouldRetryDefaultAudioInput('OverconstrainedError', 'device-1'), true);
  assert.equal(shouldRetryDefaultAudioInput('NotFoundError', 'device-1'), true);
  assert.equal(shouldRetryDefaultAudioInput('NotAllowedError', 'device-1'), false);
  assert.equal(shouldRetryDefaultAudioInput('NotReadableError', 'device-1'), false);
  assert.equal(shouldRetryDefaultAudioInput('OverconstrainedError', ''), false);
  assert.equal(shouldRetryDefaultAudioInput('OverconstrainedError', null), false);
});
