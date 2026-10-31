import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMicrophoneAudioConstraints, RAW_MICROPHONE_CONSTRAINTS } from './microphoneConstraints';

describe('raw microphone capture constraints', () => {
  it('requests all browser-managed processing to be disabled', () => {
    assert.deepEqual(RAW_MICROPHONE_CONSTRAINTS, {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it('uses the same raw-input policy for the default microphone', () => {
    assert.deepEqual(createMicrophoneAudioConstraints(), {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it('keeps the raw-input policy when an exact microphone is selected', () => {
    assert.deepEqual(createMicrophoneAudioConstraints('device-123'), {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      deviceId: { exact: 'device-123' },
    });
  });
});
