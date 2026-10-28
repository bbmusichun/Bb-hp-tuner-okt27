import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWavRecording, analyzeWavWindow, downmixChannels } from './wavAnalysis';

const RATE = 44100;
const FFT_SIZE = 16384;
const D3 = 146.832384;

function sine(frequency: number, length: number, sampleRate = RATE, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  return samples;
}

function cents(hz: number, target: number): number {
  return 1200 * Math.log2(hz / target);
}

describe('offline WAV resonance analysis', () => {
  it('measures a known D3 sine within one cent and detects its octave/third partial', () => {
    const samples = new Float32Array(FFT_SIZE);
    for (let i = 0; i < samples.length; i++) {
      const t = i / RATE;
      samples[i] = 0.5 * Math.sin(2 * Math.PI * D3 * t)
        + 0.25 * Math.sin(2 * Math.PI * D3 * 2 * t)
        + 0.15 * Math.sin(2 * Math.PI * D3 * 3 * t);
    }
    const result = analyzeWavWindow(samples, RATE);
    assert.ok(result);
    for (const resonance of result.resonances) {
      assert.ok(resonance.measuredHz !== null, 'expected all three synthetic partials to be found');
      assert.ok(Math.abs(cents(resonance.measuredHz!, resonance.targetHz)) < 1,
        'expected ' + resonance.targetHz + ' Hz, measured ' + resonance.measuredHz + ' Hz');
      assert.ok(resonance.prominenceDb !== null && resonance.prominenceDb > 3,
        'expected a visible local peak above its surrounding spectrum');
    }
  });

  it('returns no result for silence and too-short windows', () => {
    assert.equal(analyzeWavWindow(new Float32Array(FFT_SIZE), RATE), null);
    assert.equal(analyzeWavWindow(sine(D3, FFT_SIZE - 1), RATE), null);
  });

  it('does not report a below-floor sine as a valid resonance', () => {
    const quiet = sine(D3, FFT_SIZE, RATE, 1e-5);
    const result = analyzeWavWindow(quiet, RATE, { peakFloorDb: -82 });
    assert.ok(result);
    assert.ok(result.resonances.every(resonance =>
      resonance.measuredHz === null && resonance.cents === null && resonance.peakDb === null
    ));
  });

  it('identifies a synthetic tone field as rooted at the analysed fundamental', () => {
    const samples = new Float32Array(FFT_SIZE);
    for (let i = 0; i < samples.length; i++) {
      const t = i / RATE;
      samples[i] = 0.5 * Math.sin(2 * Math.PI * D3 * t)
        + 0.25 * Math.sin(2 * Math.PI * D3 * 2 * t)
        + 0.15 * Math.sin(2 * Math.PI * D3 * 3 * t);
    }
    const result = analyzeWavWindow(samples, RATE);
    assert.ok(result?.identifiability);
    assert.equal(result.identifiability.status, 'identified');
    assert.deepEqual(result.identifiability.reasons, []);
  });

  it('does not identify a bare sine as a handpan fundamental and flags the octave error', () => {
    const lone = analyzeWavWindow(sine(D3, FFT_SIZE), RATE);
    assert.ok(lone?.identifiability);
    assert.equal(lone.identifiability.status, 'unidentified');
    assert.ok(lone.identifiability.reasons.includes('missing-octave'));

    // Analysed one octave too high: the true D3 sits at candidate / 2 with more energy.
    const samples = new Float32Array(FFT_SIZE);
    for (let i = 0; i < samples.length; i++) {
      const t = i / RATE;
      samples[i] = 0.5 * Math.sin(2 * Math.PI * D3 * t)
        + 0.25 * Math.sin(2 * Math.PI * D3 * 2 * t)
        + 0.15 * Math.sin(2 * Math.PI * D3 * 3 * t);
    }
    const octaveLock = analyzeWavWindow(samples, RATE, { targetHz: D3 * 2 });
    assert.ok(octaveLock?.identifiability);
    assert.notEqual(octaveLock.identifiability.status, 'identified');
    assert.ok(octaveLock.identifiability.reasons.includes('strong-subharmonic'));
  });

  it('rejects invalid FFT sizes and sample rates', () => {
    assert.equal(analyzeWavWindow(sine(D3, FFT_SIZE), RATE, { fftSize: 1000 }), null);
    assert.equal(analyzeWavWindow(sine(D3, FFT_SIZE), 0), null);
  });

  it('returns chronological overlapping frames for a recording', () => {
    const frames = analyzeWavRecording(sine(D3, FFT_SIZE * 2), RATE, { fftSize: FFT_SIZE, hopSize: FFT_SIZE / 2 });
    assert.equal(frames.length, 3);
    assert.deepEqual(frames.map(frame => frame.timeSeconds), [0, FFT_SIZE / 2 / RATE, FFT_SIZE / RATE]);
  });

  it('downmixes stereo channels without changing their average amplitude', () => {
    const left = new Float32Array([0.4, -0.2, 0.1]);
    const right = new Float32Array([0.2, 0.2, -0.1]);
    const mono = Array.from(downmixChannels([left, right]));
    assert.ok(Math.abs(mono[0] - 0.3) < 1e-6);
    assert.equal(mono[1], 0);
    assert.equal(mono[2], 0);
    assert.equal(downmixChannels([]).length, 0);
  });

  it('measures a harmonic-rich handpan-like signal in deterministic broadband noise', () => {
    const sampleRate = RATE;
    const samples = new Float32Array(FFT_SIZE);
    let seed = 0x12345678;
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      // Deterministic noise keeps this regression reproducible across CI runs.
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = ((seed / 0x100000000) * 2 - 1) * 0.002;
      samples[i] = 0.45 * Math.sin(2 * Math.PI * D3 * t)
        + 0.22 * Math.sin(2 * Math.PI * D3 * 2 * t)
        + 0.12 * Math.sin(2 * Math.PI * D3 * 3 * t)
        + noise;
    }

    const result = analyzeWavWindow(samples, sampleRate, { peakFloorDb: -82 });
    assert.ok(result);
    for (const resonance of result.resonances) {
      assert.ok(resonance.measuredHz !== null, 'expected the partial to remain measurable in noise');
      assert.ok(Math.abs(cents(resonance.measuredHz!, resonance.targetHz)) < 1,
        'expected sub-cent accuracy for target ' + resonance.targetHz + ' Hz');
      assert.ok(resonance.prominenceDb !== null && resonance.prominenceDb > 12,
        'expected the harmonic peak to stand out from the noise floor');
    }
  });
});