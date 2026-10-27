import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { finalizePeakReading } from './resonanceMetrics';

describe('finalized resonance metrics', () => {
  it('calculates cents from the same stabilized frequency that is displayed', () => {
    const rawPeak = { freq: 146.8, magDb: -40, bin: 50 };
    const referenceHz = 146.832384;
    const result = finalizePeakReading(rawPeak, referenceHz, referenceHz);

    assert.equal(result.peak?.freq, referenceHz);
    assert.ok(result.deviationCents !== null);
    assert.ok(Math.abs(result.deviationCents) < 1e-10);
    assert.equal(rawPeak.freq, 146.8, 'input peak remains unmodified');
  });

  it('keeps the measured peak when the tracker has no stable frequency', () => {
    const peak = { freq: 146.8, magDb: -40, bin: 50 };
    const result = finalizePeakReading(peak, null, 146.832384);

    assert.equal(result.peak?.freq, peak.freq);
    assert.ok(result.deviationCents !== null);
    assert.ok(Math.abs(result.deviationCents - 1200 * Math.log2(peak.freq / 146.832384)) < 1e-12);
  });

  it('does not manufacture cent readings for missing or invalid frequencies', () => {
    assert.deepEqual(finalizePeakReading(null, 146.8, 146.832384), {
      peak: null,
      deviationCents: null,
    });
    assert.equal(finalizePeakReading({ freq: 146.8, magDb: -40, bin: 50 }, null, 0).deviationCents, null);
  });
});
