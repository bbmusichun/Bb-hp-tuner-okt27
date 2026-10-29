import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fuseAgreeingFrequencyEstimates } from './frequencyFusion';

const A4 = 440;
const cents = (measured: number, target: number) => 1200 * Math.log2(measured / target);

describe('reference-frequency estimate fusion', () => {
  it('leaves an exact pure-tone reference unchanged', () => {
    assert.ok(Math.abs(fuseAgreeingFrequencyEstimates(A4, A4, 1) - A4) < 1e-10);
  });

  it('reduces error when two high-quality estimates bracket the known reference', () => {
    const target = 146.832384;
    const spectral = target * Math.pow(2, 2.8 / 1200);
    const periodic = target * Math.pow(2, -1.8 / 1200);
    const fused = fuseAgreeingFrequencyEstimates(spectral, periodic, 0.96);

    assert.ok(Math.abs(cents(fused, target)) < Math.abs(cents(spectral, target)));
    assert.ok(Math.abs(cents(fused, target)) < Math.abs(cents(periodic, target)));
  });

  it('does not let a low-clarity periodic estimate move the FFT peak', () => {
    const spectral = A4 * Math.pow(2, 3 / 1200);
    const periodic = A4 * Math.pow(2, -2 / 1200);
    assert.equal(fuseAgreeingFrequencyEstimates(spectral, periodic, 0.5), spectral);
  });

  it('does not blend an octave error or a distant competing pitch', () => {
    const spectral = A4 * Math.pow(2, 2 / 1200);
    assert.equal(fuseAgreeingFrequencyEstimates(spectral, A4 * 2, 0.99), spectral);
    assert.equal(fuseAgreeingFrequencyEstimates(spectral, A4 * Math.pow(2, -20 / 1200), 0.99), spectral);
  });

  it('falls back safely for missing and invalid estimates', () => {
    assert.equal(fuseAgreeingFrequencyEstimates(A4, null, 0), A4);
    assert.equal(fuseAgreeingFrequencyEstimates(A4, Number.NaN, 1), A4);
    assert.ok(Number.isNaN(fuseAgreeingFrequencyEstimates(Number.NaN, A4, 1)));
  });
});
