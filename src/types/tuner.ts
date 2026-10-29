/**
 * BB Tuner – Handpan tuning analyzer
 * Data model and types according to the functional specification
 */

export type ResonanceRole = 'fundamental' | 'fifth' | 'octave';

export type MeasurementStatus = 'valid' | 'uncertain' | 'held' | 'no-signal';

export interface ResonanceMeasurement {
  role: ResonanceRole;
  name: string; // "Alap", "Kvint", "Oktáv"
  noteName: string; // e.g. "D3", "A3", "D4"
  measuredHz: number | null;
  targetHz: number | null;
  deviationCents: number | null;
  amplitudeDb: number | null;
  confidence: number | null; // 0 to 1
  timestampMs: number;
  status: MeasurementStatus;
}

export type MicState = 'inactive' | 'active' | 'weak-signal' | 'error';

export interface StabilityPoint {
  timeSec: number;
  cents: number;
  valid: boolean;
}

export type BBNavTab = 'hangolas' | 'spektrum' | 'hangmezo' | 'meresek';

export interface ToneFieldNote {
  id: string;
  noteName: string; // e.g. "D3", "A3", "Bb3"
  frequency: number; // Target fundamental Hz
  fifthFreq: number; // Target third partial (3x fundamental) Hz
  octaveFreq: number; // Target 2x Hz
  positionIndex: number; // 0 = Ding, 1..N = perimeter
}

export interface HandpanScale {
  id: string;
  name: string;
  root: string;
  noteCount: number;
  notes: {
    name: string;
    midi: number;
    /** Exact custom target for non-equal-tempered instrument notes. Presets omit it. */
    frequencyHz?: number;
  }[];
}

export interface TuningLogEntry {
  id: string;
  timestamp: number;
  noteName: string;
  /** Scale/profile identity; optional for older saved logs. */
  scaleId?: string;
  /** Physical instrument identity; optional for older saved logs. */
  instrumentProfileId?: string;
  instrumentProfileName?: string;
  /** Capture conditions, optional for older saved logs. */
  audioSampleRateHz?: number;
  inputLevelDbfs?: number;
  /** Tolerance policy used when calculating overallInTune; null means adaptive Auto. */
  toleranceOverrideCents?: number | null;
  /** Measured frequencies. */
  fundamentalHz: number;
  fundamentalCents: number;
  fifthHz: number;
  fifthCents: number;
  octaveHz: number;
  octaveCents: number;
  /** Target frequencies are optional for backward compatibility with older saved logs. */
  fundamentalTargetHz?: number;
  fifthTargetHz?: number;
  octaveTargetHz?: number;
  overallInTune: boolean;
}
