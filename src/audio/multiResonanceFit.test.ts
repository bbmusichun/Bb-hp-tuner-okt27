import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refineIndependentResonances } from './multiResonanceFit';

const RATE = 48000;
const SIZE = 16384;
const BASE = 146.832384;
const cents = (hz: number, reference: number) => 1200 * Math.log2(hz / reference);

function makeFrame(modes: { frequency: number; amplitude: number; decay: number; phase: number }[]): Float32Array {
  const samples = new Float32Array(SIZE);
  let seed = 0x7f4a7c15;
  for (let i = 0; i < SIZE; i++) {
    const time = i / RATE;
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = (seed / 0x100000000 - 0.5) * 0.0002;
    samples[i] = modes.reduce((sum, mode) =>
      sum + mode.amplitude * Math.exp(-mode.decay * time) *
        Math.sin(2 * Math.PI * mode.frequency * time + mode.phase), noise);
  }
  return samples;
}

test('joint fit separates all three independently detuned modes under level and decay imbalance', () => {
  const scenarios = [
    [
      { frequency: BASE * 2 ** (-2.6 / 1200), amplitude: 0.055, decay: 0.7, phase: 0.17 },
      { frequency: BASE * 2.0041 * 2 ** (1.8 / 1200), amplitude: 0.34, decay: 2.5, phase: 1.83 },
      { frequency: BASE * 3.011 * 2 ** (-1.2 / 1200), amplitude: 0.19, decay: 4.1, phase: 3.01 },
    ],
    [
      { frequency: BASE * 2 ** (2.2 / 1200), amplitude: 0.31, decay: 2.8, phase: 2.41 },
      { frequency: BASE * 2.0017 * 2 ** (-1.6 / 1200), amplitude: 0.065, decay: 0.9, phase: 0.61 },
      { frequency: BASE * 3.014 * 2 ** (2.7 / 1200), amplitude: 0.14, decay: 3.6, phase: 4.72 },
    ],
    [
      { frequency: BASE * 2 ** (-0.9 / 1200), amplitude: 0.12, decay: 1.9, phase: 5.2 },
      { frequency: BASE * 2.0033 * 2 ** (2.5 / 1200), amplitude: 0.22, decay: 3.9, phase: 2.3 },
      { frequency: BASE * 3.008 * 2 ** (-2.1 / 1200), amplitude: 0.36, decay: 0.65, phase: 0.92 },
    ],
  ];

  for (const [scenarioIndex, modes] of scenarios.entries()) {
    const samples = makeFrame(modes);
    const estimates = refineIndependentResonances(
      samples, RATE, modes.map((mode) => mode.frequency * 2 ** (1.5 / 1200)), 8,
    );
    for (const [modeIndex, mode] of modes.entries()) {
      const estimate = estimates[modeIndex];
      assert.ok(estimate !== null, `missing mode ${modeIndex} in scenario ${scenarioIndex}`);
      assert.ok(
        Math.abs(cents(estimate!, mode.frequency)) < 0.35,
        `scenario ${scenarioIndex}, mode ${modeIndex}: ${cents(estimate!, mode.frequency).toFixed(4)} cents`,
      );
    }
  }
});

test('joint fit leaves missing resonances absent and still refines available modes', () => {
  const modes = [
    { frequency: BASE * 2 ** (1.3 / 1200), amplitude: 0.24, decay: 1.4, phase: 0.2 },
    { frequency: BASE * 3.009 * 2 ** (-2.1 / 1200), amplitude: 0.17, decay: 2.6, phase: 1.8 },
  ];
  const samples = makeFrame(modes);
  const estimates = refineIndependentResonances(
    samples, RATE, [modes[0].frequency * 2 ** (1.2 / 1200), null, modes[1].frequency * 2 ** (-1.1 / 1200)], 8,
  );
  assert.ok(estimates[0] !== null);
  assert.equal(estimates[1], null);
  assert.ok(estimates[2] !== null);
  assert.ok(Math.abs(cents(estimates[0]!, modes[0].frequency)) < 0.35);
  assert.ok(Math.abs(cents(estimates[2]!, modes[1].frequency)) < 0.35);
});

test('joint fit does not force the octave and compound fifth to exact integer ratios', () => {
  const modes = [
    { frequency: BASE * 2 ** (0.7 / 1200), amplitude: 0.2, decay: 1.5, phase: 0.1 },
    { frequency: BASE * 2.006 * 2 ** (-1.3 / 1200), amplitude: 0.23, decay: 2.2, phase: 1.2 },
    { frequency: BASE * 3.017 * 2 ** (2.4 / 1200), amplitude: 0.16, decay: 2.8, phase: 2.1 },
  ];
  const estimates = refineIndependentResonances(
    makeFrame(modes), RATE, modes.map((mode) => mode.frequency), 8,
  );
  for (const [index, mode] of modes.entries()) {
    assert.ok(estimates[index] !== null);
    assert.ok(Math.abs(cents(estimates[index]!, mode.frequency)) < 0.35);
  }
  const measuredRatio = estimates[1]! / estimates[0]!;
  assert.ok(Math.abs(cents(measuredRatio, 2)) > 3.5, 'the measured octave mode was incorrectly forced to 2x');
});
