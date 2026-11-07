import type { ResonanceMeasurement, ResonanceRole, StrikeSessionSummary, StrikeSessionModeSummary } from '../types/tuner';

export interface StrikePoint {
  hz: number;
  cents: number;
  confidence: number;
  amplitudeDb: number;
}

export interface StrikeSample {
  capturedAtMs: number;
  fundamental: StrikePoint | null;
  fifth: StrikePoint | null;
  octave: StrikePoint | null;
  rejectionReasons?: Partial<Record<ResonanceRole, string>>;
}

export const MIN_STRIKE_CONFIDENCE = 0.32;

export function getStrikeRejectionReason(measurement: ResonanceMeasurement): string | null {
  if (measurement.status === 'no-signal') return 'Nincs jel';
  if (measurement.status === 'held') return 'Lecsengés alatti adat';
  if (measurement.status === 'uncertain') return 'Bizonytalan mérés';
  if (measurement.peakAmbiguous === true) return 'Több versengő csúcs';
  if (measurement.measuredHz === null || !Number.isFinite(measurement.measuredHz) || measurement.measuredHz <= 0) return 'Nincs mérhető frekvencia';
  if (measurement.deviationCents === null || !Number.isFinite(measurement.deviationCents)) return 'Nincs centérték';
  if (measurement.confidence === null || !Number.isFinite(measurement.confidence) || measurement.confidence < MIN_STRIKE_CONFIDENCE) return 'Alacsony jelbiztonság';
  if (measurement.amplitudeDb === null || !Number.isFinite(measurement.amplitudeDb)) return 'Nincs jelszintadat';
  return null;
}

export function isStrikePointValid(measurement: ResonanceMeasurement): boolean {
  return getStrikeRejectionReason(measurement) === null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeStrikeMode(samples: StrikeSample[], key: 'fundamental' | 'fifth' | 'octave'): StrikeSessionModeSummary {
  const accepted = samples.map((sample) => sample[key]).filter((value): value is StrikePoint => value !== null);
  if (accepted.length === 0) return { medianHz: 0, medianCents: 0, medianConfidence: 0, medianAmplitudeDb: -160, madCents: 0, rangeCents: 0, acceptedCount: 0, rejectedCount: samples.length };
  const cents = accepted.map((value) => value.cents);
  const center = median(cents);
  return {
    medianHz: median(accepted.map((value) => value.hz)),
    medianCents: center,
    medianConfidence: median(accepted.map((value) => value.confidence)),
    medianAmplitudeDb: median(accepted.map((value) => value.amplitudeDb)),
    madCents: median(cents.map((value) => Math.abs(value - center))),
    rangeCents: Math.max(...cents) - Math.min(...cents),
    acceptedCount: accepted.length,
    rejectedCount: samples.length - accepted.length,
  };
}

export function summarizeStrikeSamples(samples: StrikeSample[]): StrikeSessionSummary | null {
  if (samples.length < 3) return null;
  return {
    strikeCount: samples.length,
    requiredSamples: 3,
    fundamental: summarizeStrikeMode(samples, 'fundamental'),
    fifth: summarizeStrikeMode(samples, 'fifth'),
    octave: summarizeStrikeMode(samples, 'octave'),
  };
}

/** MAD and range describe repeatability across strikes, not calibration uncertainty or absolute accuracy. */