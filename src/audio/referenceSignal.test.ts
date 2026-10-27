import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitchYin } from './yinPitch';
import { estimatePitchSnac } from './snacPitch';
import { isTransientHoldoffActive, requiredTransientHoldoffMs, StablePitchTracker } from './transientGuard';
import { findReliablePeakInSpectrum } from './spectralPeak';

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 16_384;
const WINDOW_CENTS = 150;
const TEST_FREQUENCIES = [146.5, 293, 439.5] as const;

type Tone = { frequencyHz: number; amplitude?: number };
type SignalOptions = {
  sampleRate?: number;
  durationSeconds?: number;
  noiseLevelDb?: number | null;
  seed?: number;
  transient?: { durationMs: number; amplitude: number };
};

/** Deterministic Gaussian noise for reproducible reference tests. */
function createNormalRandom(seed: number): () => number {
  let state = seed >>> 0;
  const uniform = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.max(1e-12, (state >>> 0) / 0x1_0000_0000);
  };
  return () => {
    const u1 = uniform();
    const u2 = uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

/**
 * Create a 3-second (by default) Float32Array of known sine components.
 * noiseLevelDb is the noise level relative to the sine amplitude, e.g. -40 dB.
 */
function generateReferenceSignal(tones: Tone[], options: SignalOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const durationSeconds = options.durationSeconds ?? 3;
  if (!tones.length || tones.some(t => !Number.isFinite(t.frequencyHz) || t.frequencyHz <= 0 ||
      !Number.isFinite(t.amplitude ?? 0.5) || (t.amplitude ?? 0.5) <= 0) ||
      !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError('Invalid reference signal configuration');
  }

  const length = Math.round(sampleRate * durationSeconds);
  const samples = new Float32Array(length);
  const randomNormal = createNormalRandom(options.seed ?? 0x5eed1234);
  const referenceAmplitude = Math.max(...tones.map(t => t.amplitude ?? 0.5));
  const noiseRms = options.noiseLevelDb == null
    ? 0
    : referenceAmplitude / Math.SQRT2 * Math.pow(10, options.noiseLevelDb / 20);
  const transientSamples = options.transient
    ? Math.max(0, Math.floor(sampleRate * options.transient.durationMs / 1000))
    : 0;

  for (let i = 0; i < length; i++) {
    const timeSeconds = i / sampleRate;
    let value = 0;
    for (const tone of tones) {
      value += (tone.amplitude ?? 0.5) * Math.sin(2 * Math.PI * tone.frequencyHz * timeSeconds);
    }
    if (noiseRms > 0) value += randomNormal() * noiseRms;
    if (i < transientSamples && options.transient) {
      value += randomNormal() * options.transient.amplitude;
    }
    samples[i] = value;
  }
  return samples;
}

function centsError(measuredHz: number, targetHz: number): number {
  return 1200 * Math.log2(measuredHz / targetHz);
}

function isOctaveError(measuredHz: number, targetHz: number, toleranceCents = 25): boolean {
  return [targetHz / 2, targetHz * 2].some(
    octaveHz => Math.abs(centsError(measuredHz, octaveHz)) <= toleranceCents,
  );
}

const windowCache = new Map<number, { window: Float64Array; sum: number }>();
function blackmanWindow(length: number): { window: Float64Array; sum: number } {
  const cached = windowCache.get(length);
  if (cached) return cached;
  const window = new Float64Array(length);
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const phase = (2 * Math.PI * i) / (length - 1);
    const value = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
    window[i] = value;
    sum += value;
  }
  const result = { window, sum };
  windowCache.set(length, result);
  return result;
}

/**
 * Small, direct-DFT test oracle for bins around known frequencies. This mirrors
 * a Blackman-windowed spectrum and avoids adding an FFT dependency to the app.
 */
function magnitudeSpectrum(
  samples: Float32Array,
  sampleRate: number,
  targetFrequencies: number[],
): Float32Array {
  const size = samples.length;
  const binWidth = sampleRate / size;
  const binCount = Math.floor(size / 2);
  const spectrum = new Float32Array(binCount);
  spectrum.fill(-100);
  const { window, sum: windowSum } = blackmanWindow(size);
  const bins = new Set<number>();

  for (const targetHz of targetFrequencies) {
    const centerBin = Math.round(targetHz / binWidth);
    for (let bin = Math.max(1, centerBin - 20); bin <= Math.min(binCount - 2, centerBin + 20); bin++) {
      bins.add(bin);
    }
  }

  for (const bin of bins) {
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < size; i++) {
      const angle = (2 * Math.PI * bin * i) / size;
      const weighted = samples[i] * window[i];
      real += weighted * Math.cos(angle);
      imaginary -= weighted * Math.sin(angle);
    }
    const amplitude = (2 * Math.hypot(real, imaginary)) / windowSum;
    spectrum[bin] = Math.max(-100, 20 * Math.log10(Math.max(amplitude, 1e-12)));
  }
  return spectrum;
}

function measureReferencePeak(
  samples: Float32Array,
  targetHz: number,
): number | null {
  const spectrum = magnitudeSpectrum(samples, SAMPLE_RATE, [targetHz]);
  return findReliablePeakInSpectrum(
    spectrum, SAMPLE_RATE, targetHz, WINDOW_CENTS,
    { minDb: -82, minProminenceDb: 6 },
  )?.frequencyHz ?? null;
}

test('reference generator creates deterministic 3-second Float32Array signals', () => {
  const a = generateReferenceSignal([{ frequencyHz: 146.5 }], { seed: 42, noiseLevelDb: -40 });
  const b = generateReferenceSignal([{ frequencyHz: 146.5 }], { seed: 42, noiseLevelDb: -40 });
  assert.equal(a.length, SAMPLE_RATE * 3);
  assert.ok(a instanceof Float32Array);
  assert.deepEqual(a, b);
  assert.ok(a.every(Number.isFinite));
});

test('FFT peak interpolation stays below 0.1 cent for reference tones, including -60/-40 dB noise', () => {
  for (const frequencyHz of TEST_FREQUENCIES) {
    for (const noiseLevelDb of [null, -60, -40] as const) {
      const samples = generateReferenceSignal(
        [{ frequencyHz, amplitude: 0.5 }],
        { noiseLevelDb, seed: 0xabc123 + Math.round(frequencyHz) },
      ).subarray(0, FFT_SIZE);
      const measuredHz = measureReferencePeak(samples, frequencyHz);
      assert.ok(measuredHz !== null, `no reliable spectral peak at ${frequencyHz} Hz / noise ${noiseLevelDb}`);
      const error = centsError(measuredHz!, frequencyHz);
      assert.ok(Math.abs(error) < 0.1,
        `${frequencyHz} Hz / noise ${noiseLevelDb}: error ${error.toFixed(4)} cent`);
      assert.equal(isOctaveError(measuredHz!, frequencyHz), false);
    }
  }
});

test('YIN and SNAC return a bounded, non-octave reference estimate for clean sine tones', () => {
  for (const frequencyHz of TEST_FREQUENCIES) {
    const samples = generateReferenceSignal([{ frequencyHz, amplitude: 0.5 }])
      .subarray(0, FFT_SIZE);
    const minHz = frequencyHz * 0.8;
    const maxHz = frequencyHz * 1.2;
    const yin = estimatePitchYin(samples, SAMPLE_RATE, {
      minHz, maxHz, downsampleFactor: 2,
    });
    const snac = estimatePitchSnac(samples, SAMPLE_RATE, {
      minHz, maxHz, downsampleFactor: 2,
    });

    assert.ok(yin.frequencyHz !== null, `YIN did not estimate ${frequencyHz} Hz`);
    assert.ok(Math.abs(centsError(yin.frequencyHz!, frequencyHz)) < 3,
      `YIN error at ${frequencyHz} Hz exceeded 3 cents`);
    assert.equal(isOctaveError(yin.frequencyHz!, frequencyHz), false);

    assert.ok(snac.frequencyHz !== null, `SNAC did not estimate ${frequencyHz} Hz`);
    assert.ok(Math.abs(centsError(snac.frequencyHz!, frequencyHz)) < 3,
      `SNAC error at ${frequencyHz} Hz exceeded 3 cents`);
    assert.equal(isOctaveError(snac.frequencyHz!, frequencyHz), false);
  }
});

test('a missing 3x partial returns no reliable peak; 1x and 2x are not used to infer it', () => {
  const samples = generateReferenceSignal([
    { frequencyHz: 146.5, amplitude: 0.35 },
    { frequencyHz: 293, amplitude: 0.5 },
  ], { noiseLevelDb: -60 }).subarray(0, FFT_SIZE);
  const spectrum = magnitudeSpectrum(samples, SAMPLE_RATE, [146.5, 293, 439.5]);

  const fundamental = findReliablePeakInSpectrum(spectrum, SAMPLE_RATE, 146.5, WINDOW_CENTS);
  const octave = findReliablePeakInSpectrum(spectrum, SAMPLE_RATE, 293, WINDOW_CENTS);
  const thirdPartial = findReliablePeakInSpectrum(spectrum, SAMPLE_RATE, 439.5, WINDOW_CENTS);

  assert.ok(fundamental !== null);
  assert.ok(octave !== null);
  assert.equal(thirdPartial, null);
});

test('transient holdoff plus stable tracker reaches a trusted estimate only after settling', () => {
  const onsetAtMs = 1_000;
  const holdoffMs = requiredTransientHoldoffMs(FFT_SIZE, SAMPLE_RATE, 50);
  const samples = generateReferenceSignal(
    [{ frequencyHz: 146.5, amplitude: 0.5 }],
    {
      durationSeconds: 2,
      noiseLevelDb: -40,
      seed: 77,
      transient: { durationMs: 50, amplitude: 0.15 },
    },
  );
  const tracker = new StablePitchTracker({
    requiredReadings: 4,
    maxDeviationCents: 1,
    minConfidence: 0.5,
  });

  let stableAtMs: number | null = null;
  let acceptedDuringHoldoff = false;
  for (let elapsedMs = 0; elapsedMs <= 1_000; elapsedMs += 20) {
    const nowMs = onsetAtMs + elapsedMs;
    if (isTransientHoldoffActive(onsetAtMs, nowMs, FFT_SIZE, SAMPLE_RATE, 50)) {
      tracker.reset();
      if (stableAtMs !== null) acceptedDuringHoldoff = true;
      continue;
    }

    const endSample = Math.floor((elapsedMs / 1000) * SAMPLE_RATE);
    const startSample = endSample - FFT_SIZE;
    if (startSample < 0) continue;
    const frame = samples.subarray(startSample, endSample);
    if (frame.length !== FFT_SIZE) continue;

    const measuredHz = measureReferencePeak(frame, 146.5);
    const reading = tracker.observe({
      frequencyHz: measuredHz ?? Number.NaN,
      confidence: measuredHz === null ? 0 : 1,
      timestampMs: nowMs,
    });
    if (reading.stable && stableAtMs === null) stableAtMs = elapsedMs;
  }

  assert.equal(acceptedDuringHoldoff, false);
  assert.ok(stableAtMs !== null, 'the tracker did not converge');
  assert.ok(stableAtMs! >= holdoffMs,
    `measurement converged at ${stableAtMs} ms before the ${holdoffMs.toFixed(1)} ms holdoff`);
  assert.ok(stableAtMs! <= 500,
    `measurement took ${stableAtMs} ms to settle; expected at most 500 ms`);
});
