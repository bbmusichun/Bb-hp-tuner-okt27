import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordAnalysisFrame } from './analysisRate';

test('counts frames and reports a measured rate after the time window', () => {
  let window = { startedAtMs: 0, frameCount: 0 };
  for (let now = 0; now <= 900; now += 100) {
    const result = recordAnalysisFrame(window, now, 1000);
    window = result.window;
    assert.equal(result.fps, null);
  }
  const result = recordAnalysisFrame(window, 1000, 1000);
  assert.equal(result.fps, 11);
  assert.deepEqual(result.window, { startedAtMs: 1000, frameCount: 0 });
});

test('avoids invalid timestamps and bounds output to a plausible range', () => {
  const initial = { startedAtMs: 100, frameCount: 2 };
  assert.equal(recordAnalysisFrame(initial, 90).window, initial);
  assert.equal(recordAnalysisFrame(initial, Number.NaN).window, initial);
  assert.equal(recordAnalysisFrame({ startedAtMs: 0, frameCount: 1000 }, 1000).fps, 240);
  assert.equal(recordAnalysisFrame({ startedAtMs: 0, frameCount: 0 }, 1000, 20).fps, null);
});
