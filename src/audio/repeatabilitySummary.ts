import type { TuningLogEntry } from '../types/tuner';

export interface RepeatabilityMetric {
  medianCents: number;
  madCents: number;
  rangeCents: number;
}

export interface RepeatabilitySummary {
  noteName: string;
  scaleId: string;
  sampleCount: number;
  requiredSamples: number;
  fundamental: RepeatabilityMetric;
  thirdPartial: RepeatabilityMetric;
  octave: RepeatabilityMetric;
}

function median(values: number[]): number | null {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metric(values: number[]): RepeatabilityMetric | null {
  const center = median(values);
  if (center === null) return null;
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  if (mad === null) return null;
  return {
    medianCents: center,
    madCents: mad,
    rangeCents: Math.max(...values) - Math.min(...values),
  };
}

/**
 * Summarize repeated captured measurements for the same scale and tone field.
 * MAD/range describe observed repeatability only; they are not instrument
 * uncertainty, calibration accuracy, or a guarantee of correct peak selection.
 */
export function summarizeRepeatability(
  logs: TuningLogEntry[],
  scaleId: string,
  noteName: string,
  maxSamples = 10,
): RepeatabilitySummary | null {
  if (!scaleId.trim() || !noteName.trim() || !Number.isInteger(maxSamples) || maxSamples < 3) return null;

  const samples = logs
    .filter((entry) => entry.scaleId === scaleId && entry.noteName === noteName)
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxSamples);

  if (samples.length < 3) return null;

  const fundamental = metric(samples.map((entry) => entry.fundamentalCents));
  const thirdPartial = metric(samples.map((entry) => entry.fifthCents));
  const octave = metric(samples.map((entry) => entry.octaveCents));
  if (!fundamental || !thirdPartial || !octave) return null;

  return {
    noteName,
    scaleId,
    sampleCount: samples.length,
    requiredSamples: 3,
    fundamental,
    thirdPartial,
    octave,
  };
}
