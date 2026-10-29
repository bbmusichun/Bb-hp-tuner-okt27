import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMeasurementReadout, normalizeTuningReadoutMode } from './readoutModes';

const common = {
  measuredHz: 880,
  targetHz: 880,
  deviationCents: 0,
  status: 'valid' as const,
  baseMeasuredHz: 440,
  baseTargetHz: 440,
  a4Ref: 440,
};

test('normalizes only supported readout modes', () => {
  assert.equal(normalizeTuningReadoutMode('cents'), 'cents');
  assert.equal(normalizeTuningReadoutMode('note'), 'note');
  assert.equal(normalizeTuningReadoutMode('ratio'), 'ratio');
  assert.equal(normalizeTuningReadoutMode('invalid'), 'hz');
  assert.equal(normalizeTuningReadoutMode(null), 'hz');
});

test('Hz mode reports the measured value and target frequency', () => {
  assert.deepEqual(formatMeasurementReadout({ ...common, mode: 'hz' }), {
    primary: '880.00 Hz',
    target: 'Cél: 880.00 Hz',
    valid: true,
  });
});

test('cents mode reports signed deviation while preserving target Hz', () => {
  const result = formatMeasurementReadout({ ...common, mode: 'cents', deviationCents: 2.4 });
  assert.equal(result.primary, '+2.4 cent');
  assert.equal(result.target, 'Cél: 880.00 Hz');
  assert.equal(result.valid, true);
});

test('note mode derives pitch name using the selected A4 reference', () => {
  const result = formatMeasurementReadout({ ...common, mode: 'note' });
  assert.equal(result.primary, 'A5');
  assert.equal(result.target, 'Cél: A5 · 880.00 Hz');
});

test('ratio mode reports measured ratio and expected target ratio to the fundamental', () => {
  const result = formatMeasurementReadout({ ...common, mode: 'ratio' });
  assert.equal(result.primary, '2.0000:1');
  assert.equal(result.target, 'Cél: 2.0000:1');
  assert.equal(result.valid, true);
});

test('missing or uncertain measurements never fabricate values in any mode', () => {
  for (const mode of ['hz', 'cents', 'note', 'ratio'] as const) {
    const result = formatMeasurementReadout({
      ...common,
      mode,
      measuredHz: null,
      deviationCents: null,
      status: 'no-signal',
    });
    assert.equal(result.valid, false);
    assert.equal(result.primary, mode === 'hz' ? '— Hz' : mode === 'cents' ? '— cent' : mode === 'note' ? '—' : '—:1');
  }
});
