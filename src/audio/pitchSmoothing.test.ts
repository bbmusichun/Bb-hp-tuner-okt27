import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothPitchSample } from './pitchSmoothing';

test('median estimator rejects a single spectral-bin outlier', () => {
  let history = [] as ReturnType<typeof smoothPitchSample>['history'];
  const readings = [220.00, 220.08, 221.10, 219.98, 220.03];
  let output = 0;
  readings.forEach((hz, i) => {
    const result = smoothPitchSample(history, hz, i * 33);
    history = result.history;
    output = result.frequencyHz;
  });
  assert.ok(Math.abs(output - 220.03) < 0.1, `expected stable median near 220.03 Hz, got ${output}`);
});

test('one isolated resonance jump does not move the live readout', () => {
  let result = smoothPitchSample([], 220, 0);
  result = smoothPitchSample(result.history, 220.01, 33);
  const outlier = smoothPitchSample(result.history, 224, 66);
  assert.ok(Math.abs(outlier.frequencyHz - 220.005) < 0.02);
  assert.equal(outlier.history.filter((sample) => sample.candidate).length, 1);
  const recovered = smoothPitchSample(outlier.history, 220.02, 99);
  assert.ok(Math.abs(recovered.frequencyHz - 220.01) < 0.02);
  assert.equal(recovered.history.some((sample) => sample.candidate), false);
});

test('a real pitch change is accepted only after three agreeing frames', () => {
  let result = smoothPitchSample([], 220, 0);
  result = smoothPitchSample(result.history, 220.01, 33);
  const first = smoothPitchSample(result.history, 224, 66);
  assert.ok(Math.abs(first.frequencyHz - 220.005) < 0.02);
  const second = smoothPitchSample(first.history, 224.01, 99);
  assert.ok(Math.abs(second.frequencyHz - 220.005) < 0.02);
  const confirmed = smoothPitchSample(second.history, 224.02, 132);
  assert.ok(Math.abs(confirmed.frequencyHz - 224.01) < 0.02);
  assert.equal(confirmed.history.some((sample) => sample.candidate), false);
});

test('new pitch outside jump threshold starts a new history after confirmation', () => {
  let result = smoothPitchSample([], 220, 0);
  result = smoothPitchSample(result.history, 246.94, 33);
  assert.equal(result.history.length, 2);
  result = smoothPitchSample(result.history, 246.95, 66);
  result = smoothPitchSample(result.history, 246.96, 99);
  assert.ok(Math.abs(result.frequencyHz - 246.95) < 0.02);
});

test('role-specific tighter threshold holds a small but unstable jump', () => {
  let result = smoothPitchSample([], 220, 0);
  result = smoothPitchSample(result.history, 220.01, 33);
  const candidate = smoothPitchSample(result.history, 220.9, 66, {
    jumpThresholdCents: 5,
    candidateMatchCents: 3,
    candidateConfirmations: 3,
  });
  assert.ok(Math.abs(candidate.frequencyHz - 220.005) < 0.02);
  assert.equal(candidate.history.filter((sample) => sample.candidate).length, 1);
});

test('stale history expires after the configured time window', () => {
  const first = smoothPitchSample([], 220, 0);
  const second = smoothPitchSample(first.history, 220.1, 1500);
  assert.equal(second.history.length, 1);
  assert.equal(second.frequencyHz, 220.1);
});

test('invalid frequency does not produce a fake pitch estimate', () => {
  const result = smoothPitchSample([], Number.NaN, 10);
  assert.ok(Number.isNaN(result.frequencyHz));
  assert.equal(result.history.length, 0);
});
