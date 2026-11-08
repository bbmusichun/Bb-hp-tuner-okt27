import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { refineFrequencyBySineFit } from './sineFitRefinement';

const RATE = 48000;
const SIZE = 16384;
const BASE = 146.832384;
function cents(hz: number, reference: number): number {
  return 1200 * Math.log2(hz / reference);
}
function signal(frequency: number, withHarmonics = false): Float32Array {
  const samples = new Float32Array(SIZE);
  let seed = 0x12345678;
  for (let i = 0; i < SIZE; i++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = ((seed / 0x100000000) - 0.5) * 0.001;
    const fundamental = 0.35 * Math.sin(2 * Math.PI * frequency * i / RATE + 0.37);
    const second = withHarmonics ? 0.22 * Math.sin(2 * Math.PI * frequency * 2 * i / RATE + 1.1) : 0;
    const third = withHarmonics ? 0.12 * Math.sin(2 * Math.PI * frequency * 3 * i / RATE + 2.2) : 0;
    samples[i] = fundamental + second + third + noise;
  }
  return samples;
}

describe('time-domain sine-fit frequency refinement', () => {
  for (const detuning of [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]) {
    it(`resolves a clean D3 sine at ${detuning} cents to within 0.15 cent`, () => {
      const actual = BASE * 2 ** (detuning / 1200);
      const measured = refineFrequencyBySineFit(signal(actual), RATE, actual * 2 ** (3 / 1200), 8);
      assert.ok(measured !== null);
      assert.ok(Math.abs(cents(measured, actual)) < 0.15, `error=${cents(measured, actual).toFixed(4)} cents`);
    });
  }

  it('retains sub-quarter-cent accuracy with strong second/third partials and deterministic noise', () => {
    const actual = BASE * 2 ** (2.4 / 1200);
    const measured = refineFrequencyBySineFit(signal(actual, true), RATE, actual * 2 ** (-2 / 1200), 8);
    assert.ok(measured !== null);
    assert.ok(Math.abs(cents(measured, actual)) < 0.25, `error=${cents(measured, actual).toFixed(4)} cents`);
  });

  it('keeps sub-quarter-cent accuracy at common audio sample rates', () => {
    for (const sampleRate of [44100, 48000, 96000]) {
      const length = Math.round(sampleRate * (SIZE / RATE));
      const actual = BASE * 2 ** (-2.35 / 1200);
      const samples = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        samples[i] = 0.31 * Math.sin(2 * Math.PI * actual * i / sampleRate + 1.17);
      }
      const measured = refineFrequencyBySineFit(
        samples, sampleRate, actual * 2 ** (2 / 1200), 8,
      );
      assert.ok(measured !== null, `no estimate at ${sampleRate} Hz`);
      assert.ok(
        Math.abs(cents(measured, actual)) < 0.15,
        `${sampleRate} Hz error=${cents(measured, actual).toFixed(4)} cents`,
      );
    }
  });

  it('resists a DC offset and a stronger octave partial', () => {
    const actual = BASE * 2 ** (1.65 / 1200);
    const samples = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      const t = i / RATE;
      samples[i] = 0.08 * Math.sin(2 * Math.PI * actual * t + 0.4) +
        0.34 * Math.sin(2 * Math.PI * actual * 2 * t + 1.2) +
        0.12 * Math.sin(2 * Math.PI * actual * 3 * t + 2.1) + 0.035;
    }
    const measured = refineFrequencyBySineFit(
      samples, RATE, actual * 2 ** (-2 / 1200), 8,
    );
    assert.ok(measured !== null);
    assert.ok(
      Math.abs(cents(measured, actual)) < 0.35,
      `error=${cents(measured, actual).toFixed(4)} cents`,
    );
  });

  it('measures a decaying handpan-like partial stack without following the attack', () => {
    const actual = BASE * 2 ** (-0.85 / 1200);
    const samples = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      const t = i / RATE;
      const envelope = Math.exp(-t * 2.2);
      samples[i] = envelope * (
        0.28 * Math.sin(2 * Math.PI * actual * t + 0.2) +
        0.19 * Math.sin(2 * Math.PI * actual * 2.003 * t + 1.1) +
        0.09 * Math.sin(2 * Math.PI * actual * 3.012 * t + 2.0)
      );
    }
    const measured = refineFrequencyBySineFit(
      samples, RATE, actual * 2 ** (1.5 / 1200), 8,
    );
    assert.ok(measured !== null);
    assert.ok(
      Math.abs(cents(measured, actual)) < 0.5,
      `error=${cents(measured, actual).toFixed(4)} cents`,
    );
  });

  it('refines the fundamental, octave, and third partial independently in an inharmonic handpan-like frame', () => {
    const base = BASE * 2 ** (1.4 / 1200);
    const modes = [
      { frequency: base, expected: base, name: 'fundamental' },
      { frequency: base * 2.002, expected: base * 2.002, name: 'octave mode' },
      { frequency: base * 3.009, expected: base * 3.009, name: 'third partial mode' },
    ];
    const samples = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      const time = i / RATE;
      const envelope = Math.exp(-time * 1.8);
      samples[i] = envelope * (
        0.22 * Math.sin(2 * Math.PI * modes[0].frequency * time + 0.2) +
        0.27 * Math.sin(2 * Math.PI * modes[1].frequency * time + 1.1) +
        0.16 * Math.sin(2 * Math.PI * modes[2].frequency * time + 2.0)
      );
    }

    for (const mode of modes) {
      const measured = refineFrequencyBySineFit(
        samples, RATE, mode.expected * 2 ** (2 / 1200), 8,
      );
      assert.ok(measured !== null, `no estimate for ${mode.name}`);
      assert.ok(
        Math.abs(cents(measured, mode.expected)) < 0.5,
        `${mode.name} error=${cents(measured, mode.expected).toFixed(4)} cents`,
      );
    }
  });

  it('measures all three independently detuned modes from the same decaying, noisy frame', () => {
    const modes = [
      { name: 'fundamental', frequency: BASE * 2 ** (1.7 / 1200), decay: 1.4, amplitude: 0.16 },
      { name: 'octave', frequency: BASE * 2.0017 * 2 ** (-2.2 / 1200), decay: 2.1, amplitude: 0.29 },
      { name: 'compound fifth', frequency: BASE * 3.006 * 2 ** (3.1 / 1200), decay: 2.8, amplitude: 0.21 },
    ];
    const samples = new Float32Array(SIZE);
    let seed = 0x91e10da5;
    for (let i = 0; i < SIZE; i++) {
      const time = i / RATE;
      seed = (1664525 * seed + 1013904223) >>> 0;
      const noise = ((seed / 0x100000000) - 0.5) * 0.00015;
      samples[i] = modes.reduce((sum, mode, index) =>
        sum + mode.amplitude * Math.exp(-mode.decay * time) *
          Math.sin(2 * Math.PI * mode.frequency * time + 0.43 * (index + 1)), noise);
    }

    for (const mode of modes) {
      const measured = refineFrequencyBySineFit(
        samples, RATE, mode.frequency * 2 ** (1.5 / 1200), 8,
      );
      assert.ok(measured !== null, `no estimate for ${mode.name}`);
      assert.ok(
        Math.abs(cents(measured, mode.frequency)) < 0.6,
        `${mode.name} error=${cents(measured, mode.frequency).toFixed(4)} cents`,
      );
    }
  });

  it('returns null for silence and invalid inputs, including non-finite samples', () => {
    assert.equal(refineFrequencyBySineFit(new Float32Array(SIZE), RATE, BASE), null);
    assert.equal(refineFrequencyBySineFit(new Float32Array(100), RATE, BASE), null);
    assert.equal(refineFrequencyBySineFit(signal(BASE), 0, BASE), null);
    assert.equal(refineFrequencyBySineFit(signal(BASE), RATE, 0), null);
    const invalidSamples = signal(BASE);
    invalidSamples[123] = Number.NaN;
    assert.equal(refineFrequencyBySineFit(invalidSamples, RATE, BASE), null);
  });

  it('rejects a constant DC signal instead of inventing a pitch', () => {
    const dcOnly = new Float32Array(SIZE);
    dcOnly.fill(0.12);
    assert.equal(refineFrequencyBySineFit(dcOnly, RATE, BASE), null);
  });

  it('rejects broadband noise with no sufficiently strong narrow-band candidate', () => {
    const noise = new Float32Array(SIZE);
    let seed = 0xabcdef01;
    for (let i = 0; i < noise.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      noise[i] = (seed / 0x100000000 - 0.5) * 0.2;
    }
    assert.equal(refineFrequencyBySineFit(noise, RATE, BASE), null);
  });

  it('rejects a fit whose optimum is pinned to the local search boundary', () => {
    for (const detuning of [-15, -8.5, 8.5, 15]) {
      const actual = BASE * 2 ** (detuning / 1200);
      const measured = refineFrequencyBySineFit(signal(actual), RATE, BASE, 8);
      assert.equal(measured, null, `unexpected boundary estimate at ${detuning} cents`);
    }
  });

  it('still returns an interior optimum close to the allowed search edge', () => {
    for (const detuning of [-7.5, 7.5]) {
      const actual = BASE * 2 ** (detuning / 1200);
      const measured = refineFrequencyBySineFit(signal(actual), RATE, BASE, 8);
      assert.ok(measured !== null);
      assert.ok(Math.abs(cents(measured, actual)) < 0.15);
    }
  });

  it('keeps the estimate phase-invariant with a large DC offset and a short frame', () => {
    const actual = BASE * 2 ** (2.1 / 1200);
    for (const phase of [0.01, 0.7, 1.9, 3.13, 5.8]) {
      const samples = new Float32Array(4096);
      for (let i = 0; i < samples.length; i++) {
        const t = i / RATE;
        samples[i] = 0.12 + 0.2 * Math.sin(2 * Math.PI * actual * t + phase);
      }
      const measured = refineFrequencyBySineFit(
        samples, RATE, actual * 2 ** (-2 / 1200), 8,
      );
      assert.ok(measured !== null, `no estimate at phase ${phase}`);
      assert.ok(
        Math.abs(cents(measured, actual)) < 0.2,
        `phase=${phase}, error=${cents(measured, actual).toFixed(4)} cents`,
      );
    }
  });

  it('keeps all three independent modes separated under severe level and decay imbalance', () => {
    const scenarios = [
      {
        modes: [
          { frequency: BASE * 2 ** (-2.6 / 1200), decay: 0.7, amplitude: 0.055, phase: 0.17 },
          { frequency: BASE * 2.0041 * 2 ** (1.8 / 1200), decay: 2.5, amplitude: 0.34, phase: 1.83 },
          { frequency: BASE * 3.011 * 2 ** (-1.2 / 1200), decay: 4.1, amplitude: 0.19, phase: 3.01 },
        ],
      },
      {
        modes: [
          { frequency: BASE * 2 ** (2.2 / 1200), decay: 2.8, amplitude: 0.31, phase: 2.41 },
          { frequency: BASE * 1.9975 * 2 ** (-1.6 / 1200), decay: 0.9, amplitude: 0.065, phase: 0.61 },
          { frequency: BASE * 3.014 * 2 ** (2.7 / 1200), decay: 3.6, amplitude: 0.14, phase: 4.72 },
        ],
      },
      {
        modes: [
          { frequency: BASE * 2 ** (-0.9 / 1200), decay: 1.9, amplitude: 0.12, phase: 5.2 },
          { frequency: BASE * 2.0033 * 2 ** (2.5 / 1200), decay: 3.9, amplitude: 0.22, phase: 2.3 },
          { frequency: BASE * 3.008 * 2 ** (-2.1 / 1200), decay: 0.65, amplitude: 0.36, phase: 0.92 },
        ],
      },
    ];

    for (const [scenarioIndex, scenario] of scenarios.entries()) {
      const samples = new Float32Array(SIZE);
      let seed = 0x6d2b79f5 + scenarioIndex;
      for (let i = 0; i < SIZE; i++) {
        const time = i / RATE;
        seed = (1664525 * seed + 1013904223) >>> 0;
        const noise = (seed / 0x100000000 - 0.5) * 0.0002;
        samples[i] = scenario.modes.reduce((sum, mode) =>
          sum + mode.amplitude * Math.exp(-mode.decay * time) *
            Math.sin(2 * Math.PI * mode.frequency * time + mode.phase), noise);
      }

      for (const [modeIndex, mode] of scenario.modes.entries()) {
        const measured = refineFrequencyBySineFit(
          samples, RATE, mode.frequency * 2 ** (1.5 / 1200), 8,
        );
        assert.ok(measured !== null, `no estimate in scenario ${scenarioIndex}, mode ${modeIndex}`);
        assert.ok(
          Math.abs(cents(measured, mode.frequency)) < 0.8,
          `scenario ${scenarioIndex}, mode ${modeIndex}: error=${cents(measured, mode.frequency).toFixed(4)} cents`,
        );
      }
    }
  });

});
