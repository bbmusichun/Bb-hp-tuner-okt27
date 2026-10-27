import { findSpectralPeakInWindow } from './spectralPeak';

export interface WavResonance {
  targetHz: number;
  measuredHz: number | null;
  cents: number | null;
  peakDb: number | null;
}

export interface WavFrameAnalysis {
  timeSeconds: number;
  rmsDb: number;
  resonances: WavResonance[];
}

export interface WavAnalysisOptions {
  fftSize?: number;
  hopSize?: number;
  targetHz?: number;
  peakFloorDb?: number;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

/** Radix-2 in-place complex FFT. Arrays are expected to have equal power-of-two lengths. */
function fft(real: Float64Array, imaginary: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      const half = length >> 1;
      for (let offset = 0; offset < half; offset++) {
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

/**
 * Analyze a decoded mono audio window using a Blackman window and the same
 * spectral peak finder used by the live tuner. WAV data is diagnostic material,
 * not an absolute frequency reference.
 */
export function analyzeWavWindow(
  samples: Float32Array,
  sampleRate: number,
  options: WavAnalysisOptions = {},
): WavFrameAnalysis | null {
  const fftSize = options.fftSize ?? 16384;
  const targetHz = options.targetHz ?? 146.832384;
  const peakFloorDb = options.peakFloorDb ?? -82;
  if (
    !Number.isInteger(fftSize) || fftSize < 1024 ||
    (fftSize & (fftSize - 1)) !== 0 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Number.isFinite(targetHz) || targetHz <= 0 ||
    samples.length < fftSize
  ) return null;

  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  let sumSquares = 0;
  let windowSum = 0;
  for (let i = 0; i < fftSize; i++) {
    const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
    const blackman = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1))
      + 0.08 * Math.cos(4 * Math.PI * i / (fftSize - 1));
    real[i] = sample * blackman;
    sumSquares += sample * sample;
    windowSum += blackman;
  }
  if (sumSquares < 1e-12) return null;
  fft(real, imaginary);

  const spectrum = new Float32Array(fftSize / 2);
  for (let bin = 0; bin < spectrum.length; bin++) {
    const magnitude = 2 * Math.hypot(real[bin], imaginary[bin]) / Math.max(windowSum, 1e-12);
    spectrum[bin] = 20 * Math.log10(Math.max(magnitude, 1e-12));
  }

  const targets = [targetHz, targetHz * 2, targetHz * 3];
  const resonances = targets.map((target) => {
    const peak = findSpectralPeakInWindow(target, 150, spectrum, sampleRate, peakFloorDb);
    return {
      targetHz: target,
      measuredHz: peak?.freq ?? null,
      cents: peak ? 1200 * Math.log2(peak.freq / target) : null,
      peakDb: peak?.magDb ?? null,
    };
  });
  return {
    timeSeconds: 0,
    rmsDb: 20 * Math.log10(Math.max(Math.sqrt(sumSquares / fftSize), 1e-12)),
    resonances,
  };
}

/** Analyze overlapping windows across decoded mono audio. */
export function analyzeWavRecording(
  samples: Float32Array,
  sampleRate: number,
  options: WavAnalysisOptions = {},
): WavFrameAnalysis[] {
  const fftSize = options.fftSize ?? 16384;
  const hopSize = options.hopSize ?? Math.floor(fftSize / 2);
  if (!Number.isInteger(hopSize) || hopSize < 1 || samples.length < fftSize) return [];
  const frames: WavFrameAnalysis[] = [];
  for (let start = 0; start + fftSize <= samples.length; start += hopSize) {
    const frame = analyzeWavWindow(samples.subarray(start, start + fftSize), sampleRate, options);
    if (frame) {
      frame.timeSeconds = start / sampleRate;
      frames.push(frame);
    }
  }
  return frames;
}

export function downmixChannels(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  }
  return mono;
}
