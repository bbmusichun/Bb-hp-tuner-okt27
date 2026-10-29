import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findPeakNearFrequency, findSignificantSpectralPeaks } from './peakSpectrum';

const SAMPLE_RATE = 48000;
const FFT_SIZE = 16384;

function spectrumWithPeaks(entries: Array<[number, number]>, floor = -100): Float32Array {
  const spectrum = new Float32Array(FFT_SIZE / 2);
  spectrum.fill(floor);
  for (const [bin, db] of entries) spectrum[bin] = db;
  return spectrum;
}

describe('Linotune-style exact-bin peak spectrum', () => {
  it('returns exact FFT-bin frequencies and relative amplitudes for all significant peaks', () => {
    const spectrum = spectrumWithPeaks([[50, -20], [100, -32], [150, -45]]);
    const peaks = findSignificantSpectralPeaks(spectrum, SAMPLE_RATE, 146.832384, {
      minimumAmplitudeDb: -88, dynamicRangeDb: 48, minPeakDistanceBins: 2,
    });
    assert.deepEqual(peaks.map((peak) => peak.bin), [50, 100, 150]);
    assert.deepEqual(peaks.map((peak) => peak.frequencyHz), [50 * SAMPLE_RATE / FFT_SIZE, 100 * SAMPLE_RATE / FFT_SIZE, 150 * SAMPLE_RATE / FFT_SIZE]);
    assert.deepEqual(peaks.map((peak) => peak.relativeDb), [0, -12, -25]);
    assert.ok(peaks.every((peak) => Number.isFinite(peak.multipleOfBase) && peak.multipleOfBase > 0));
  });

  it('suppresses bins below the dynamic noise-floor threshold', () => {
    const spectrum = spectrumWithPeaks([[50, -20], [60, -40], [70, -76], [80, -92]]);
    const peaks = findSignificantSpectralPeaks(spectrum, SAMPLE_RATE, 146.8, { dynamicRangeDb: 48 });
    assert.deepEqual(peaks.map((peak) => peak.bin), [50, 60]);
  });

  it('does not fabricate peaks from silence or non-finite samples', () => {
    const silence = new Float32Array(FFT_SIZE / 2);
    silence.fill(-100);
    assert.deepEqual(findSignificantSpectralPeaks(silence, SAMPLE_RATE, 146.8), []);
    const invalid = spectrumWithPeaks([[50, Number.NaN], [60, Number.POSITIVE_INFINITY]]);
    assert.deepEqual(findSignificantSpectralPeaks(invalid, SAMPLE_RATE, 146.8), []);
  });

  it('preserves distinct nearby local maxima for diagnosing double peaks', () => {
    const spectrum = spectrumWithPeaks([[50, -15], [53, -20], [56, -25]]);
    const peaks = findSignificantSpectralPeaks(spectrum, SAMPLE_RATE, 146.8, { minPeakDistanceBins: 2 });
    assert.deepEqual(peaks.map((peak) => peak.bin), [50, 53, 56]);
  });

  it('honours range and peak-count controls', () => {
    const spectrum = spectrumWithPeaks([[40, -20], [60, -21], [80, -22], [100, -23]]);
    const peaks = findSignificantSpectralPeaks(spectrum, SAMPLE_RATE, 146.8, {
      minFrequencyHz: 150, maxFrequencyHz: 300, maxPeaks: 2,
    });
    assert.equal(peaks.length, 2);
    assert.deepEqual(peaks.map((peak) => peak.bin), [60, 80]);
  });


  it('selects the nearest peak only within the requested cursor tolerance', () => {
    const spectrum = spectrumWithPeaks([[50, -20], [100, -30], [150, -40]]);
    const peaks = findSignificantSpectralPeaks(spectrum, SAMPLE_RATE, 146.8);
    const binWidth = SAMPLE_RATE / FFT_SIZE;
    assert.equal(findPeakNearFrequency(peaks, 100 * binWidth + 1, 2)?.bin, 100);
    assert.equal(findPeakNearFrequency(peaks, 100 * binWidth + 4, 2), null);
    assert.equal(findPeakNearFrequency(peaks, Number.NaN, 2), null);
    assert.equal(findPeakNearFrequency(peaks, 100 * binWidth, -1), null);
  });

  it('rejects invalid analysis parameters', () => {
    const spectrum = spectrumWithPeaks([[50, -20]]);
    assert.deepEqual(findSignificantSpectralPeaks(spectrum, 0, 146.8), []);
    assert.deepEqual(findSignificantSpectralPeaks(spectrum, SAMPLE_RATE, 0), []);
    assert.deepEqual(findSignificantSpectralPeaks(new Float32Array([1, 2]), SAMPLE_RATE, 146.8), []);
  });
});
