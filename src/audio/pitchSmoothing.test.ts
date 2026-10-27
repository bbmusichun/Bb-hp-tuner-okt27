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

test('new pitch outside jump threshold starts a new history', () => {
  const first = smoothPitchSample([], 220, 0);
  const second = smoothPitchSample(first.history, 246.94, 33);
  assert.equal(second.history.length, 1);
  assert.equal(second.frequencyHz, 246.94);
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
