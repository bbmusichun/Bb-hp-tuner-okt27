import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findSpectralPeakInWindow } from './spectralPeak';

const SAMPLE_RATE = 48000;
const FFT_SIZE = 16384;
const WINDOW_CENTS = 150;
const DETUNING_CENTS = [-40, -10, 0, 10, 40];
const REFERENCES = [
  { name: 'D3 fundamental', hz: 146.832384 },
  { name: 'A3', hz: 220 },
  { name: 'D4 octave', hz: 293.664768 },
  { name: 'D3 third partial', hz: 146.832384 * 3 },
];

function centsError(measuredHz: number, referenceHz: number): number {
  return 1200 * Math.log2(measuredHz / referenceHz);
}

/**
 * Build a deterministic, single-sine reference spectrum using a Blackman window.
 * Only bins around the expected search window are calculated; other bins represent
 * the analyser floor. No handpan recording or third-party virtual instrument is used.
 */
function sineReferenceSpectrum(
  frequencyHz: number,
  centerHz: number,
  sampleRate = SAMPLE_RATE,
  fftSize = FFT_SIZE,
  amplitude = 0.7,
): Float32Array {
  const binCount = fftSize / 2;
  const spectrum = new Float32Array(binCount);
  spectrum.fill(-100);
  const binWidth = sampleRate / fftSize;
  const lowBin = Math.max(1, Math.floor(centerHz * Math.pow(2, -WINDOW_CENTS / 1200) / binWidth) - 3);
  const highBin = Math.min(binCount - 2, Math.ceil(centerHz * Math.pow(2, WINDOW_CENTS / 1200) / binWidth) + 3);
  const windowedSamples = new Float64Array(fftSize);

  for (let n = 0; n < fftSize; n++) {
    const blackman = 0.42
      - 0.5 * Math.cos((2 * Math.PI * n) / (fftSize - 1))
      + 0.08 * Math.cos((4 * Math.PI * n) / (fftSize - 1));
    windowedSamples[n] = amplitude * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRate) * blackman;
  }

  for (let bin = lowBin; bin <= highBin; bin++) {
    const phaseStep = (2 * Math.PI * bin) / fftSize;
    const cosStep = Math.cos(phaseStep);
    const sinStep = Math.sin(phaseStep);
    let cosPhase = 1;
    let sinPhase = 0;
    let real = 0;
    let imaginary = 0;

    for (let n = 0; n < fftSize; n++) {
      const sample = windowedSamples[n];
      real += sample * cosPhase;
      imaginary -= sample * sinPhase;
      const nextCos = cosPhase * cosStep - sinPhase * sinStep;
      sinPhase = sinPhase * cosStep + cosPhase * sinStep;
      cosPhase = nextCos;
    }

    // Normalize by the Blackman coherent gain so the result is in approximate dBFS.
    const magnitude = (2 * Math.hypot(real, imaginary)) / (fftSize * 0.42);
    spectrum[bin] = 20 * Math.log10(Math.max(magnitude, 1e-12));
  }

  return spectrum;
}

describe('sine-reference validation of the live spectral peak algorithm', () => {
  const sampleRates = [44100, 48000];
  const fftSizes = [8192, 16384, 32768];

  for (const reference of REFERENCES) {
    for (const sampleRate of sampleRates) {
      for (const fftSize of fftSizes) {
        for (const detuningCents of DETUNING_CENTS) {
          it(`measures ${reference.name} at ${detuningCents > 0 ? '+' : ''}${detuningCents} cents within 1 cent (${sampleRate} Hz / FFT ${fftSize})`, () => {
            const actualHz = reference.hz * Math.pow(2, detuningCents / 1200);
            const spectrum = sineReferenceSpectrum(actualHz, reference.hz, sampleRate, fftSize);
            const measured = findSpectralPeakInWindow(reference.hz, WINDOW_CENTS, spectrum, sampleRate);

            assert.ok(measured, 'expected a measurable peak from the known sine reference');
            const errorCents = centsError(measured.freq, actualHz);
            assert.ok(
              Math.abs(errorCents) < 1,
              `known sine was ${actualHz.toFixed(6)} Hz; measured ${measured.freq.toFixed(6)} Hz; error ${errorCents.toFixed(3)} cents; sampleRate=${sampleRate}; fftSize=${fftSize}`,
            );
          });
        }
      }
    }
  }

  it('keeps the peak estimate far below one cent for off-bin sines across the handpan range', () => {
    // Sweep the whole handpan register at deliberately non-bin-aligned frequencies: the
    // bin centre is up to ~34 cents away at D3, so this exercises the interpolator only.
    const errors: { hz: number; errorCents: number }[] = [];
    for (let index = 0; index < 24; index++) {
      const hz = 60 * Math.pow(2, index * 0.16) * Math.pow(2, (index % 5) * 0.019);
      const spectrum = sineReferenceSpectrum(hz, hz);
      const measured = findSpectralPeakInWindow(hz, WINDOW_CENTS, spectrum, SAMPLE_RATE);
      assert.ok(measured, 'expected a peak for ' + hz.toFixed(3) + ' Hz');
      errors.push({ hz, errorCents: Math.abs(centsError(measured.freq, hz)) });
    }
    const worst = errors.reduce((a, b) => (b.errorCents > a.errorCents ? b : a));
    assert.ok(
      worst.errorCents < 0.05,
      `worst offset ${worst.errorCents.toFixed(4)} cents at ${worst.hz.toFixed(3)} Hz (mean ${
        (errors.reduce((sum, item) => sum + item.errorCents, 0) / errors.length).toFixed(4)
      } cents)`,
    );
  });

  it('retains sub-cent peak accuracy for a low-level sine above the noise floor', () => {
    const actualHz = 146.832384 * Math.pow(2, 10 / 1200);
    const spectrum = sineReferenceSpectrum(actualHz, 146.832384, SAMPLE_RATE, FFT_SIZE, 0.0001);
    const measured = findSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);

    assert.ok(measured, 'the -80 dB sine should remain measurable above the -82 dB peak gate');
    assert.ok(Math.abs(centsError(measured.freq, actualHz)) < 1);
  });

  it('returns no measurement for silence/noise-floor-only spectra', () => {
    const silence = new Float32Array(FFT_SIZE / 2);
    silence.fill(-100);
    assert.equal(findSpectralPeakInWindow(146.832384, WINDOW_CENTS, silence, SAMPLE_RATE), null);
  });

  it('rejects a sine below the configured peak floor', () => {
    const spectrum = sineReferenceSpectrum(146.832384, 146.832384, SAMPLE_RATE, FFT_SIZE, 0.00001);
    assert.equal(findSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE), null);
  });

  it('rejects invalid targets and invalid analysis parameters', () => {
    const spectrum = sineReferenceSpectrum(146.832384, 146.832384);
    assert.equal(findSpectralPeakInWindow(0, WINDOW_CENTS, spectrum, SAMPLE_RATE), null);
    assert.equal(findSpectralPeakInWindow(Number.NaN, WINDOW_CENTS, spectrum, SAMPLE_RATE), null);
    assert.equal(findSpectralPeakInWindow(146.832384, -1, spectrum, SAMPLE_RATE), null);
    assert.equal(findSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, 0), null);
  });
});
