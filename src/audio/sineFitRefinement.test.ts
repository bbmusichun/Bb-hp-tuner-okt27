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

  it('returns null for silence and invalid inputs', () => {
    assert.equal(refineFrequencyBySineFit(new Float32Array(SIZE), RATE, BASE), null);
    assert.equal(refineFrequencyBySineFit(new Float32Array(100), RATE, BASE), null);
    assert.equal(refineFrequencyBySineFit(signal(BASE), 0, BASE), null);
    assert.equal(refineFrequencyBySineFit(signal(BASE), RATE, 0), null);
  });

  it('does not search beyond its bounded local range', () => {
    const actual = BASE * 2 ** (15 / 1200);
    const measured = refineFrequencyBySineFit(signal(actual), RATE, BASE, 8);
    assert.ok(measured !== null);
    assert.ok(Math.abs(cents(measured, BASE)) < 8.1);
  });
});
