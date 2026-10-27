import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTransientHoldoffActive, requiredTransientHoldoffMs } from './transientGuard';

describe('rolling FFT transient guard', () => {
  it('waits for a complete FFT window plus a 50 ms safety guard', () => {
    const duration = requiredTransientHoldoffMs(32768, 48000, 50);
    assert.ok(Math.abs(duration - 732.6666667) < 0.001);
    assert.equal(isTransientHoldoffActive(1000, 1050, 32768, 48000), true);
    assert.equal(isTransientHoldoffActive(1000, 1732, 32768, 48000), true);
    assert.equal(isTransientHoldoffActive(1000, 1733, 32768, 48000), false);
  });

  it('adapts to the actual sample rate and FFT size', () => {
    assert.equal(requiredTransientHoldoffMs(16384, 48000, 50), 391.3333333333333);
    assert.equal(requiredTransientHoldoffMs(32768, 44100, 50), 793.0385487528345);
  });

  it('rejects invalid window configuration safely', () => {
    assert.equal(requiredTransientHoldoffMs(0, 48000), Number.POSITIVE_INFINITY);
    assert.equal(requiredTransientHoldoffMs(32768, 0), Number.POSITIVE_INFINITY);
    assert.equal(isTransientHoldoffActive(0, 1000, 32768, 48000), false);
    assert.equal(isTransientHoldoffActive(2000, 1000, 32768, 48000), false);
  });
});
