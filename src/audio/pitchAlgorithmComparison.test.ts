import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitchYin } from './yinPitch';
import { estimatePitchSnac } from './snacPitch';

const SAMPLE_RATE = 48000;
const WINDOW = 16384;

function cents(measured: number, target: number): number {
  return 1200 * Math.log2(measured / target);
}

function tone(parts: Array<{ hz: number; amp: number }>, length = WINDOW, transient = false): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let value = 0;
    for (const part of parts) value += part.amp * Math.sin(2 * Math.PI * part.hz * t);
    if (transient && i < SAMPLE_RATE * 0.06) {
      value += 0.25 * (Math.random() * 2 - 1);
    }
    samples[i] = value;
  }
  return samples;
}

function report(name: string, samples: Float32Array, targetHz: number, minHz = 70, maxHz = 1000): void {
  const yin = estimatePitchYin(samples, SAMPLE_RATE, { minHz, maxHz, downsampleFactor: 2 });
  const snac = estimatePitchSnac(samples, SAMPLE_RATE, { minHz, maxHz });
  const format = (hz: number | null) => hz === null ? 'no estimate' : `${hz.toFixed(3)} Hz (${cents(hz, targetHz).toFixed(2)} cent)`;
  console.log(`[pitch-benchmark] ${name}: target=${targetHz} Hz; YIN=${format(yin.frequencyHz)} clarity=${yin.clarity.toFixed(3)}; SNAC=${format(snac.frequencyHz)} clarity=${snac.clarity.toFixed(3)}`);
}

test('benchmark: clean D3 sine compares YIN and SNAC without changing production selection', () => {
  const samples = tone([{ hz: 146.832, amp: 0.7 }]);
  const yin = estimatePitchYin(samples, SAMPLE_RATE, { minHz: 80, maxHz: 300, downsampleFactor: 2 });
  const snac = estimatePitchSnac(samples, SAMPLE_RATE, { minHz: 80, maxHz: 300 });
  report('clean D3 sine', samples, 146.832, 80, 300);
  assert.ok(yin.frequencyHz !== null && Math.abs(cents(yin.frequencyHz, 146.832)) < 3);
  assert.ok(snac.frequencyHz !== null && Math.abs(cents(snac.frequencyHz, 146.832)) < 3);
});

test('benchmark: handpan-like three-resonance signal exposes whole-waveform estimator behavior', () => {
  const fundamental = 146.832;
  const samples = tone([
    { hz: fundamental, amp: 0.25 },
    { hz: fundamental * 2.015, amp: 0.65 },
    { hz: fundamental * 3.002, amp: 0.8 },
  ]);
  report('D3 + slightly inharmonic 2x/3x resonances', samples, fundamental, 100, 220);
  const yin = estimatePitchYin(samples, SAMPLE_RATE, { minHz: 100, maxHz: 220, downsampleFactor: 2 });
  const snac = estimatePitchSnac(samples, SAMPLE_RATE, { minHz: 100, maxHz: 220 });
  // This is a diagnostic test: both methods must return a valid candidate, but neither
  // is presumed accurate for a multi-resonance handpan waveform.
  assert.ok(yin.frequencyHz === null || (yin.frequencyHz >= 100 && yin.frequencyHz <= 220));
  assert.ok(snac.frequencyHz === null || (snac.frequencyHz >= 100 && snac.frequencyHz <= 220));
});

test('benchmark: dominant second harmonic records possible octave ambiguity', () => {
  const samples = tone([{ hz: 146.832, amp: 0.15 }, { hz: 293.664, amp: 0.9 }]);
  report('weak fundamental / dominant octave', samples, 146.832, 100, 400);
  const yin = estimatePitchYin(samples, SAMPLE_RATE, { minHz: 100, maxHz: 400, downsampleFactor: 2 });
  const snac = estimatePitchSnac(samples, SAMPLE_RATE, { minHz: 100, maxHz: 400 });
  assert.ok(yin.frequencyHz !== null || snac.frequencyHz !== null);
});

test('benchmark: silence is rejected by both estimators', () => {
  const silence = new Float32Array(WINDOW);
  assert.equal(estimatePitchYin(silence, SAMPLE_RATE).frequencyHz, null);
  assert.equal(estimatePitchSnac(silence, SAMPLE_RATE).frequencyHz, null);
});
