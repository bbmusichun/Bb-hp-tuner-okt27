/**
 * Hangoal – Handpan hangolási adatok
 * Data model and types according to the functional specification
 */

import type { TuningToleranceSetting } from '../audio/tuningTolerance';

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
  /** True when a second similarly strong, separated FFT peak competes in the target window. */
  peakAmbiguous?: boolean;
  /** Peak-to-peak spread across the current short tracking window; not measurement uncertainty. */
  stabilitySpreadCents?: number | null;
  /** Observed start-to-end frequency movement during the recent sustain/decay window. */
  decayDriftCents?: number | null;
  /** Peak-to-peak frequency movement during the recent sustain/decay window. */
  decayRangeCents?: number | null;
  /** Linear-regression drift rate in cents per second during the recent window. */
  decaySlopeCentsPerSecond?: number | null;
  decaySampleCount?: number;
  decayDurationMs?: number;
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
  noteName: string; // Display/target pitch, e.g. "D3", "A3", "Bb3"
  /** Original tone-field name used to locate its calibration after transposition. */
  sourceNoteName?: string;
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

export interface ResonanceSnapshotQuality {
  confidence: number | null;
  amplitudeDb: number | null;
  peakAmbiguous: boolean;
  stabilitySpreadCents: number | null;
  decayDriftCents: number | null;
  decayRangeCents: number | null;
  decaySlopeCentsPerSecond: number | null;
  decaySampleCount: number;
  decayDurationMs: number;
  status: MeasurementStatus;
}

export interface StrikeSessionModeSummary {
  medianHz: number;
  medianCents: number;
  medianConfidence: number;
  medianAmplitudeDb: number;
  madCents: number;
  rangeCents: number;
  acceptedCount: number;
  rejectedCount: number;
}

export interface StrikeSessionSummary {
  strikeCount: number;
  requiredSamples: number;
  fundamental: StrikeSessionModeSummary;
  fifth: StrikeSessionModeSummary;
  octave: StrikeSessionModeSummary;
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
  toleranceOverrideCents?: TuningToleranceSetting;
  /** Per-resonance measurement quality captured with the snapshot; optional for older logs. */
  quality?: Partial<Record<ResonanceRole, ResonanceSnapshotQuality>>;
  /** Robust per-mode aggregate from manually confirmed, distinct strikes. */
  strikeSession?: StrikeSessionSummary;
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
