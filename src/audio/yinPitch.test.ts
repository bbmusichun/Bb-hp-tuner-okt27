import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitchYin } from './yinPitch';

function sine(frequencyHz: number, sampleRate: number, length: number): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = 0.6 * Math.sin(2 * Math.PI * frequencyHz * i / sampleRate);
  return samples;
}

function centsError(measuredHz: number, referenceHz: number): number {
  return 1200 * Math.log2(measuredHz / referenceHz);
}

test('YIN estimates a clean 220 Hz sine within one cent', () => {
  const sampleRate = 48000;
  const result = estimatePitchYin(sine(220, sampleRate, 8192), sampleRate, { downsampleFactor: 4 });
  assert.ok(result.frequencyHz !== null);
  assert.ok(Math.abs(centsError(result.frequencyHz!, 220)) < 1);
  assert.ok(result.clarity > 0.9);
});

test('YIN estimates a low 82.4 Hz sine', () => {
  const sampleRate = 48000;
  const result = estimatePitchYin(sine(82.407, sampleRate, 8192), sampleRate, { minHz: 60, maxHz: 1000, downsampleFactor: 4 });
  assert.ok(result.frequencyHz !== null);
  assert.ok(Math.abs(centsError(result.frequencyHz!, 82.407)) < 2);
});

test('YIN rejects silence and invalid sample rates', () => {
  assert.equal(estimatePitchYin(new Float32Array(1024), 48000).frequencyHz, null);
  assert.equal(estimatePitchYin(sine(220, 48000, 1024), 0).frequencyHz, null);
});

test('YIN returns a periodicity estimate for a second-harmonic-dominant signal', () => {
  const sampleRate = 48000;
  const samples = new Float32Array(8192);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    samples[i] = 0.2 * Math.sin(2 * Math.PI * 220 * t) + 0.8 * Math.sin(2 * Math.PI * 440 * t);
  }
  const result = estimatePitchYin(samples, sampleRate, { downsampleFactor: 4 });
  assert.ok(result.frequencyHz !== null);
  const centsFromFundamental = Math.abs(centsError(result.frequencyHz!, 220));
  const centsFromOctave = Math.abs(centsError(result.frequencyHz!, 440));
  assert.ok(Math.min(centsFromFundamental, centsFromOctave) < 8,
    `expected a periodicity near 220 or 440 Hz, got ${result.frequencyHz}`);
});

test('YIN suppresses high-frequency energy that would alias into the pitch band', () => {
  const sampleRate = 48000;
  const samples = new Float32Array(8192);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    // 11 kHz folds to 1 kHz when naively decimated by four.
    samples[i] = 0.2 * Math.sin(2 * Math.PI * 220 * t) + 0.8 * Math.sin(2 * Math.PI * 11000 * t);
  }
  const result = estimatePitchYin(samples, sampleRate, { minHz: 60, maxHz: 1200, downsampleFactor: 4 });
  assert.ok(result.frequencyHz !== null);
  assert.ok(Math.abs(centsError(result.frequencyHz!, 220)) < 3,
    `expected the 220 Hz fundamental after anti-alias filtering, got ${result.frequencyHz}`);
});

test('YIN rejects invalid thresholds', () => {
  assert.equal(estimatePitchYin(sine(220, 48000, 8192), 48000, { threshold: 0 }).frequencyHz, null);
  assert.equal(estimatePitchYin(sine(220, 48000, 8192), 48000, { threshold: 1 }).frequencyHz, null);
});
