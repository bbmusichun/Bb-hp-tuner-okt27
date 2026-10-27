import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitchYin } from './yinPitch';

function sine(frequencyHz: number, sampleRate: number, length: number): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = 0.6 * Math.sin(2 * Math.PI * frequencyHz * i / sampleRate);
  return samples;
}

test('YIN estimates a clean 220 Hz sine within one cent', () => {
  const sampleRate = 48000;
  const result = estimatePitchYin(sine(220, sampleRate, 8192), sampleRate, { downsampleFactor: 4 });
  assert.ok(result.frequencyHz !== null);
  const cents = 1200 * Math.log2(result.frequencyHz! / 220);
  assert.ok(Math.abs(cents) < 1, `expected <1 cent error, got ${cents}`);
  assert.ok(result.clarity > 0.9);
});

test('YIN estimates a low 82.4 Hz sine', () => {
  const sampleRate = 48000;
  const result = estimatePitchYin(sine(82.407, sampleRate, 8192), sampleRate, { minHz: 60, maxHz: 1000, downsampleFactor: 4 });
  assert.ok(result.frequencyHz !== null);
  assert.ok(Math.abs(1200 * Math.log2(result.frequencyHz! / 82.407)) < 2);
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
  // YIN can lock to the dominant 2x periodicity when the fundamental is much weaker;
  // octave disambiguation must be handled by the combined harmonic/target tracker.
  const centsFromFundamental = Math.abs(1200 * Math.log2(result.frequencyHz! / 220));
  const centsFromOctave = Math.abs(1200 * Math.log2(result.frequencyHz! / 440));
  assert.ok(Math.min(centsFromFundamental, centsFromOctave) < 8,
    `expected a periodicity near 220 or 440 Hz, got ${result.frequencyHz}`);
});
