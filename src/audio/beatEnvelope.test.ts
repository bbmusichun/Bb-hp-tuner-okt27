import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeatEnvelope, computeRmsEnvelope, estimateBeatFrequencyFromEnvelope } from './beatEnvelope';

const SAMPLE_RATE = 8_000;

function makeTwoToneBeat(
  frequencyA: number,
  frequencyB: number,
  durationSeconds: number,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * durationSeconds));
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    samples[i] =
      0.5 * Math.sin(2 * Math.PI * frequencyA * t) +
      0.5 * Math.sin(2 * Math.PI * frequencyB * t);
  }
  return samples;
}

test('RMS envelope has the expected sample rate and finite values', () => {
  const samples = makeTwoToneBeat(146.5, 147.0, 4);
  const result = computeRmsEnvelope(samples, SAMPLE_RATE, 20, 5);
  assert.equal(result.envelopeSampleRate, 200);
  assert.ok(result.envelope.length > 700);
  assert.ok([...result.envelope].every(Number.isFinite));
});

test('two nearby tones produce an envelope beat near their frequency difference', () => {
  // A 0.5 Hz difference is long enough to measure several cycles in an 8-second fixture.
  const samples = makeTwoToneBeat(146.5, 147.0, 8);
  const result = analyzeBeatEnvelope(samples, {
    sampleRate: SAMPLE_RATE,
    windowMs: 10,
    hopMs: 5,
    minBeatHz: 0.2,
    maxBeatHz: 2,
  });
  assert.ok(result.beatFrequencyHz !== null, 'beat frequency was not detected');
  assert.ok(Math.abs(result.beatFrequencyHz! - 0.5) < 0.08,
    `expected 0.5 Hz beat, got ${result.beatFrequencyHz}`);
  assert.ok(result.confidence > 0.5);
});

test('a short recording does not claim a reliable 0.03 Hz beat without enough cycles', () => {
  // 0.03 Hz means a ~33.3 second period. A 4-second clip cannot prove that period.
  const samples = makeTwoToneBeat(146.5, 146.53, 4);
  const result = analyzeBeatEnvelope(samples, {
    sampleRate: SAMPLE_RATE,
    windowMs: 20,
    hopMs: 5,
    minBeatHz: 0.03,
    maxBeatHz: 2,
  });
  assert.equal(result.beatFrequencyHz, null);
});

test('flat envelope and invalid parameters return no beat estimate', () => {
  const flat = new Float64Array(500);
  flat.fill(0.25);
  assert.deepEqual(
    estimateBeatFrequencyFromEnvelope(flat, 200),
    { beatFrequencyHz: null, confidence: 0 },
  );
  assert.equal(
    estimateBeatFrequencyFromEnvelope(new Float64Array(10), 0).beatFrequencyHz,
    null,
  );
});


test('beat estimate remains stable under moderate exponential decay', () => {
  const durationSeconds = 8;
  const samples = makeTwoToneBeat(146.5, 147.0, durationSeconds);
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] *= Math.exp(-0.1 * t);
  }
  const result = analyzeBeatEnvelope(samples, {
    sampleRate: SAMPLE_RATE,
    windowMs: 10,
    hopMs: 5,
    minBeatHz: 0.2,
    maxBeatHz: 2,
  });
  assert.ok(result.beatFrequencyHz !== null, 'decaying beat frequency was not detected');
  assert.ok(Math.abs(result.beatFrequencyHz! - 0.5) < 0.08,
    `expected decaying 0.5 Hz beat, got ${result.beatFrequencyHz}`);
});

test('a single steady tone does not create a false beat estimate', () => {
  const durationSeconds = 4;
  const samples = new Float32Array(Math.round(SAMPLE_RATE * durationSeconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.5 * Math.sin(2 * Math.PI * 146.5 * i / SAMPLE_RATE);
  }
  const result = analyzeBeatEnvelope(samples, {
    sampleRate: SAMPLE_RATE,
    windowMs: 10,
    hopMs: 5,
    minBeatHz: 0.2,
    maxBeatHz: 2,
  });
  assert.equal(result.beatFrequencyHz, null);
});
