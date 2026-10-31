import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpectralPeakInWindow, findSpectralPeakInWindow } from './spectralPeak';

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

  it('chooses the strongest local peak when several peaks fall inside the target window', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-100);
    // Three plausible resonances inside the D3 search window; the middle peak is strongest.
    spectrum[48] = -35;
    spectrum[49] = -25;
    spectrum[50] = -35;
    spectrum[51] = -18;
    spectrum[52] = -8;
    spectrum[53] = -18;
    spectrum[54] = -35;

    const measured = findSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(measured);
    assert.equal(measured.bin, 52);
    assert.ok(Number.isFinite(measured.freq) && measured.freq > 0);
    assert.ok(Number.isFinite(measured.magDb));
  });

  it('does not let non-finite bins become a reported peak', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-100);
    spectrum[48] = Number.NaN;
    spectrum[49] = Number.POSITIVE_INFINITY;
    spectrum[52] = -40;
    spectrum[53] = -20;
    spectrum[54] = -40;

    const measured = findSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(measured);
    assert.equal(measured.bin, 53);
    assert.ok(Number.isFinite(measured.freq));
    assert.ok(Number.isFinite(measured.magDb));
  });

  it('returns no measurement when the spectrum is too short to contain a valid local peak', () => {
    assert.equal(findSpectralPeakInWindow(146.832384, WINDOW_CENTS, new Float32Array([0, -10]), SAMPLE_RATE), null);
  });

  it('uses a wider local-floor window while keeping the peak search narrow', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-70);
    spectrum[49] = -50;
    spectrum[50] = -30;
    spectrum[51] = -50;

    const result = analyzeSpectralPeakInWindow(146.832384, 45, spectrum, SAMPLE_RATE, -82, 4, 2, 150);
    assert.ok(result.peak);
    assert.equal(result.peak.bin, 50);
    assert.equal(result.noiseFloorDb, -70);
    assert.equal(result.prominenceDb, 40);
  });
});

describe('ambiguous spectral peak diagnostics', () => {
  it('flags two similarly strong, separated peaks instead of implying a unique resonance', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-100);
    spectrum[48] = -40;
    spectrum[49] = -24;
    spectrum[50] = -40;
    spectrum[53] = -41;
    spectrum[54] = -26;
    spectrum[55] = -41;

    const result = analyzeSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(result.peak);
    assert.ok(result.competingPeak);
    assert.equal(result.ambiguous, true);
    assert.equal(result.peak.bin, 49);
    assert.equal(result.competingPeak.bin, 54);
  });

  it('does not flag a clearly dominant peak when a weaker neighbour is present', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-100);
    spectrum[48] = -40;
    spectrum[49] = -15;
    spectrum[50] = -40;
    spectrum[53] = -45;
    spectrum[54] = -32;
    spectrum[55] = -45;

    const result = analyzeSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(result.peak);
    assert.ok(result.competingPeak);
    assert.equal(result.ambiguous, false);
  });

  it('keeps a single peak unambiguous and preserves the legacy strongest-peak API', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-100);
    spectrum[49] = -35;
    spectrum[50] = -10;
    spectrum[51] = -35;

    const result = analyzeSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(result.peak);
    assert.equal(result.competingPeak, null);
    assert.equal(result.ambiguous, false);
    assert.equal(findSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE)?.bin, 50);
  });
});


describe('local spectral prominence', () => {
  it('measures a peak against the median floor in its target window', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-70);
    spectrum[49] = -50;
    spectrum[50] = -30;
    spectrum[51] = -50;

    const result = analyzeSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(result.peak);
    assert.equal(result.noiseFloorDb, -70);
    assert.equal(result.prominenceDb, 40);
  });

  it('reports only a small prominence when a peak barely rises above the local floor', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-20);
    spectrum[49] = -16;
    spectrum[50] = -15;
    spectrum[51] = -16;

    const result = analyzeSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(result.peak);
    assert.equal(result.noiseFloorDb, -20);
    assert.equal(result.prominenceDb, 5);
  });

  it('reports the peak-to-local-median difference', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-20);
    spectrum[49] = -20;
    spectrum[50] = -10;
    spectrum[51] = -20;

    const result = analyzeSpectralPeakInWindow(146.832384, WINDOW_CENTS, spectrum, SAMPLE_RATE);
    assert.ok(result.peak);
    assert.equal(result.prominenceDb, 10);
  });

  it('does not invent high prominence when both search and floor windows are too narrow', () => {
    const spectrum = new Float32Array(FFT_SIZE / 2);
    spectrum.fill(-70);
    spectrum[49] = -50;
    spectrum[50] = -30;
    spectrum[51] = -50;

    const result = analyzeSpectralPeakInWindow(146.832384, 15, spectrum, SAMPLE_RATE);
    assert.ok(result.peak);
    assert.equal(result.noiseFloorDb, result.peak.magDb);
    assert.equal(result.prominenceDb, 0);
  });
});
