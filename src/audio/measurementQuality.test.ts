import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPartialQuality,
  medianAbsoluteDeviation,
  summarizeWavPartial,
  QUALITY_THRESHOLDS,
  describeMeasurementQuality,
  MEASUREMENT_QUALITY_REASON_LABELS,
} from './measurementQuality';
import { analyzeWavRecording } from './wavAnalysis';
import type { WavFrameAnalysis } from './wavAnalysis';

const D3 = 146.832384;
const RATE = 44100;
const FFT_SIZE = 16384;

function frame(cents: [number | null, number | null, number | null], peakDb = -45, prominenceDb = 25): WavFrameAnalysis {
  const targets = [D3, D3 * 2, D3 * 3];
  return {
    timeSeconds: 0,
    rmsDb: -20,
    resonances: targets.map((targetHz, index) => {
      const value = cents[index];
      return {
        targetHz,
        measuredHz: value === null ? null : targetHz * Math.pow(2, value / 1200),
        cents: value,
        peakDb: value === null ? null : peakDb,
        prominenceDb: value === null ? null : prominenceDb,
      };
    }),
  };
}

function repeat(build: (index: number) => WavFrameAnalysis, count: number): WavFrameAnalysis[] {
  return Array.from({ length: count }, (_, index) => build(index));
}

function sine(frequency: number, length: number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / RATE);
  return samples;
}

describe('quality verdict wording', () => {
  it('explains the distinction between repeatability and absolute accuracy', () => {
    const reliable = describeMeasurementQuality({
      status: 'reliable',
      reasons: [],
      coverage: 1,
    });
    assert.equal(reliable.title, 'Ismételhető mérés');
    assert.match(reliable.description, /abszolút pontosságot/);
  });

  it('gives actionable guidance for marginal and insufficient readings', () => {
    const marginal = describeMeasurementQuality({
      status: 'marginal',
      reasons: ['too-few-windows'],
      coverage: 0.5,
    });
    const insufficient = describeMeasurementQuality({
      status: 'insufficient',
      reasons: ['weak-peak'],
      coverage: 0.1,
    });
    assert.match(marginal.description, /újramérni/);
    assert.match(insufficient.description, /mérj újra/);
  });

  it('provides a Hungarian explanation for each quality reason', () => {
    const reasons = Object.keys(MEASUREMENT_QUALITY_REASON_LABELS);
    assert.equal(reasons.length, 6);
    for (const reason of reasons) {
      assert.ok(MEASUREMENT_QUALITY_REASON_LABELS[reason as keyof typeof MEASUREMENT_QUALITY_REASON_LABELS].length > 10);
    }
  });
});

describe('partial measurement quality', () => {
  it('treats repeatable, strong, prominent windows as a reliable reading', () => {
    const result = assessPartialQuality({
      totalWindows: 6,
      measuredWindows: 6,
      madCents: 0.4,
      medianPeakDb: -45,
      medianProminenceDb: 25,
    });
    assert.equal(result.status, 'reliable');
    assert.deepEqual(result.reasons, []);
    assert.equal(result.coverage, 1);
  });

  it('does not claim a stable partial from a single window', () => {
    const result = assessPartialQuality({
      totalWindows: 1,
      measuredWindows: 1,
      madCents: 0,
      medianPeakDb: -40,
      medianProminenceDb: 30,
    });
    assert.equal(result.status, 'marginal');
    assert.deepEqual(result.reasons, ['too-few-windows']);
  });

  it('reports a partial present in most windows as insufficient', () => {
    const result = assessPartialQuality({
      totalWindows: 8,
      measuredWindows: 1,
      madCents: 0.5,
      medianPeakDb: -40,
      medianProminenceDb: 30,
    });
    assert.equal(result.status, 'insufficient');
    assert.ok(result.reasons.includes('low-coverage'));
    assert.ok(result.coverage < QUALITY_THRESHOLDS.minimumCoverage);
  });

  it('reports windows that disagree about the frequency as unstable', () => {
    const result = assessPartialQuality({
      totalWindows: 6,
      measuredWindows: 6,
      madCents: 22,
      medianPeakDb: -40,
      medianProminenceDb: 30,
    });
    assert.equal(result.status, 'insufficient');
    assert.deepEqual(result.reasons, ['unstable']);
  });

  it('keeps a small but real spread as a marginal reading', () => {
    const result = assessPartialQuality({
      totalWindows: 6,
      measuredWindows: 6,
      madCents: 5,
      medianPeakDb: -40,
      medianProminenceDb: 30,
    });
    assert.equal(result.status, 'marginal');
    assert.deepEqual(result.reasons, ['unstable']);
  });

  it('never promotes a below-floor peak to a reliable reading', () => {
    const weak = assessPartialQuality({
      totalWindows: 6,
      measuredWindows: 6,
      madCents: 0.5,
      medianPeakDb: -85,
      medianProminenceDb: 30,
    });
    assert.equal(weak.status, 'insufficient');
    assert.ok(weak.reasons.includes('weak-peak'));

    const borderline = assessPartialQuality({
      totalWindows: 6,
      measuredWindows: 6,
      madCents: 0.5,
      medianPeakDb: -75,
      medianProminenceDb: 30,
    });
    assert.equal(borderline.status, 'marginal');
    assert.deepEqual(borderline.reasons, ['weak-peak']);
  });

  it('rejects a peak that does not stand out from its local band', () => {
    const result = assessPartialQuality({
      totalWindows: 6,
      measuredWindows: 6,
      madCents: 0.5,
      medianPeakDb: -40,
      medianProminenceDb: 3,
    });
    assert.equal(result.status, 'insufficient');
    assert.deepEqual(result.reasons, ['low-prominence']);
  });

  it('returns no measurement instead of a verdict when nothing was detected', () => {
    const result = assessPartialQuality({
      totalWindows: 0,
      measuredWindows: 0,
      madCents: null,
      medianPeakDb: null,
      medianProminenceDb: null,
    });
    assert.equal(result.status, 'insufficient');
    assert.deepEqual(result.reasons, ['no-measurement']);
    assert.equal(result.coverage, 0);
  });
});

describe('partial summary aggregation', () => {
  it('collects the requested partial rather than the fundamental', () => {
    const frames = repeat((index) => frame([0.2, 3 + index * 0.1, null]), 4);
    const octave = summarizeWavPartial(frames, 2);
    assert.equal(octave.multiplier, 2);
    assert.ok(Math.abs(octave.targetHz - D3 * 2) < 1e-9);
    assert.equal(octave.measuredWindows, 4);
    assert.equal(octave.totalWindows, 4);
    assert.ok(octave.medianCents !== null && octave.medianCents > 2.9 && octave.medianCents < 3.4);
    assert.equal(octave.quality.status, 'reliable');
  });

  it('marks a partial absent from every window as insufficient', () => {
    const frames = repeat(() => frame([0.1, 0.2, null]), 5);
    const third = summarizeWavPartial(frames, 3);
    assert.equal(third.measuredWindows, 0);
    assert.equal(third.medianCents, null);
    assert.equal(third.quality.status, 'insufficient');
    assert.deepEqual(third.quality.reasons, ['no-measurement']);
  });

  it('returns an empty summary for a recording with no windows', () => {
    const result = summarizeWavPartial([], 1);
    assert.equal(result.totalWindows, 0);
    assert.equal(result.medianCents, null);
    assert.equal(result.quality.status, 'insufficient');
  });

  it('computes a robust spread that ignores a single outlier', () => {
    assert.equal(medianAbsoluteDeviation([1, 1, 1, 1, 40]), 0);
    assert.equal(medianAbsoluteDeviation([]), null);
  });
});

describe('quality assessment on real analyser output', () => {
  it('accepts a dense synthetic D3 and rejects partials that are not in the signal', () => {
    const frames = analyzeWavRecording(sine(D3, FFT_SIZE * 4), RATE, { fftSize: FFT_SIZE, hopSize: 8192, targetHz: D3 });
    assert.ok(frames.length >= 3);
    const fundamental = summarizeWavPartial(frames, 1);
    assert.equal(fundamental.quality.status, 'reliable');
    assert.ok(fundamental.medianCents !== null && Math.abs(fundamental.medianCents) < 1);

    const octave = summarizeWavPartial(frames, 2);
    assert.notEqual(octave.quality.status, 'reliable');
  });

  it('does not report a reliable reading from noise alone', () => {
    // Deterministic pseudo-noise: no periodic component to measure.
    let state = 12345;
    const noise = new Float32Array(FFT_SIZE * 4);
    for (let i = 0; i < noise.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = ((state / 0x7fffffff) * 2 - 1) * 0.2;
    }
    const frames = analyzeWavRecording(noise, RATE, { fftSize: FFT_SIZE, hopSize: 8192, targetHz: D3 });
    assert.ok(frames.length >= 3);
    for (const multiplier of [1, 2, 3]) {
      assert.notEqual(summarizeWavPartial(frames, multiplier).quality.status, 'reliable',
        'noise must not be reported as a reliable partial measurement (multiplier ' + multiplier + ')');
    }
  });
});
