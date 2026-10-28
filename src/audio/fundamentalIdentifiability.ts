/**
 * Fundamental identifiability for handpan tone fields.
 *
 * A handpan note is not one sine: a tone field radiates a fundamental plus a strong
 * octave (2×) and twelfth (3×), and the octave is frequently louder than the
 * fundamental. That structure is what makes the classic pitch-detection error
 * possible — the analyser locks onto a partial and reports it as the note, so every
 * cents reading is off by an octave or a twelfth.
 *
 * This module answers one question about a single window: does the spectrum around
 * the candidate support it *being the root of a harmonic series*, or could the
 * candidate itself be a partial of a lower note? The evidence is explicit — the
 * measured harmonics and the levels of the candidate's own sub-multiples — and the
 * verdict lists the criteria that limited it.
 *
 * The thresholds are engineering criteria, not calibrated uncertainty, and they are
 * documented in docs/REFERENCE_AUDIO_VALIDATION.md.
 */
import { findSpectralPeakInWindow } from './spectralPeak';

export type IdentifiabilityStatus = 'identified' | 'ambiguous' | 'unidentified';

export type IdentifiabilityReason =
  | 'no-fundamental'
  | 'strong-subharmonic'
  | 'missing-octave'
  | 'missing-twelfth'
  | 'inconsistent-octave';

/** A harmonic above the candidate: 2 = octave, 3 = twelfth. */
export interface HarmonicEvidence {
  multiple: number;
  expectedHz: number;
  measuredHz: number | null;
  levelDb: number | null;
  /** Level relative to the measured fundamental, in dB. */
  relativeDb: number | null;
  /** Peak strong enough to corroborate the series. */
  present: boolean;
  /** Measured peak sits where the measured fundamental predicts it. */
  consistent: boolean;
}

/** A lower note the candidate could be a partial of: 2 = octave below, 3 = twelfth below. */
export interface SubharmonicEvidence {
  divisor: number;
  expectedHz: number;
  measuredHz: number | null;
  relativeDb: number | null;
}

export interface IdentifiabilityAssessment {
  status: IdentifiabilityStatus;
  reasons: IdentifiabilityReason[];
  fundamentalHz: number | null;
  fundamentalLevelDb: number | null;
  harmonics: HarmonicEvidence[];
  subharmonics: SubharmonicEvidence[];
  /** Loudest lower root found, or null when nothing below the candidate was detected. */
  strongestSubharmonic: SubharmonicEvidence | null;
}

export interface IdentifiabilityOptions {
  peakFloorDb?: number;
  windowCents?: number;
}

export const IDENTIFIABILITY_THRESHOLDS = {
  /** Search window around every expected partial, matching the analyser's own window. */
  windowCents: 150,
  /**
   * A lower root this close in level to the candidate means the candidate may be its
   * octave or twelfth: the same energy explains both, so the root is not identified.
   */
  subharmonicAmbiguityDb: 6,
  /** A partial must be within this much of the fundamental to corroborate the series. */
  harmonicPresenceDb: -30,
  /** Handpan partials are mildly inharmonic; beyond this the "octave" is a different peak. */
  octaveConsistencyCents: 60,
  /** Share of analysed windows that must agree before a recording is called identified. */
  identifiedCoverage: 0.6,
  minimumCoverage: 0.25,
} as const;

const PARTIAL_MULTIPLES = [2, 3] as const;
const SUBHARMONIC_DIVISORS = [2, 3] as const;

const SEVERITY: Record<IdentifiabilityStatus, number> = {
  identified: 0,
  ambiguous: 1,
  unidentified: 2,
};

function centsBetween(measuredHz: number, expectedHz: number): number {
  return 1200 * Math.log2(measuredHz / expectedHz);
}

function emptyAssessment(reasons: IdentifiabilityReason[]): IdentifiabilityAssessment {
  return {
    status: 'unidentified',
    reasons,
    fundamentalHz: null,
    fundamentalLevelDb: null,
    harmonics: [],
    subharmonics: [],
    strongestSubharmonic: null,
  };
}

/**
 * Assess whether `candidateHz` is the root of the harmonic series visible in `spectrum`.
 * `spectrum` holds dB magnitudes for the linear bins 0…n/2 of a `sampleRate` analyser.
 */
export function assessFundamentalIdentifiability(
  candidateHz: number,
  spectrum: Float32Array,
  sampleRate: number,
  options: IdentifiabilityOptions = {},
): IdentifiabilityAssessment {
  const windowCents = options.windowCents ?? IDENTIFIABILITY_THRESHOLDS.windowCents;
  const peakFloorDb = options.peakFloorDb ?? -82;
  if (
    !Number.isFinite(candidateHz) || candidateHz <= 0 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !spectrum || spectrum.length < 3
  ) {
    return emptyAssessment(['no-fundamental']);
  }

  const fundamental = findSpectralPeakInWindow(candidateHz, windowCents, spectrum, sampleRate, peakFloorDb);
  if (!fundamental) return emptyAssessment(['no-fundamental']);

  const harmonics: HarmonicEvidence[] = PARTIAL_MULTIPLES.map((multiple) => {
    const expectedHz = candidateHz * multiple;
    const peak = findSpectralPeakInWindow(expectedHz, windowCents, spectrum, sampleRate, peakFloorDb);
    const relativeDb = peak ? peak.magDb - fundamental.magDb : null;
    const present = relativeDb !== null && relativeDb >= IDENTIFIABILITY_THRESHOLDS.harmonicPresenceDb;
    const consistent = present && peak !== null &&
      Math.abs(centsBetween(peak.freq, fundamental.freq * multiple)) <=
        IDENTIFIABILITY_THRESHOLDS.octaveConsistencyCents;
    return {
      multiple,
      expectedHz,
      measuredHz: peak?.freq ?? null,
      levelDb: peak?.magDb ?? null,
      relativeDb,
      present,
      consistent,
    };
  });

  const subharmonics: SubharmonicEvidence[] = SUBHARMONIC_DIVISORS.map((divisor) => {
    const expectedHz = candidateHz / divisor;
    const peak = findSpectralPeakInWindow(expectedHz, windowCents, spectrum, sampleRate, peakFloorDb);
    return {
      divisor,
      expectedHz,
      measuredHz: peak?.freq ?? null,
      relativeDb: peak ? peak.magDb - fundamental.magDb : null,
    };
  });

  const strongestSubharmonic = subharmonics
    .filter((subharmonic) => subharmonic.relativeDb !== null)
    .sort((a, b) => (b.relativeDb ?? 0) - (a.relativeDb ?? 0))[0] ?? null;

  const reasons: IdentifiabilityReason[] = [];
  let status: IdentifiabilityStatus = 'identified';
  const degrade = (next: IdentifiabilityStatus, reason: IdentifiabilityReason) => {
    reasons.push(reason);
    if (SEVERITY[next] > SEVERITY[status]) status = next;
  };

  if (
    strongestSubharmonic !== null &&
    (strongestSubharmonic.relativeDb ?? -Infinity) > -IDENTIFIABILITY_THRESHOLDS.subharmonicAmbiguityDb
  ) {
    degrade('ambiguous', 'strong-subharmonic');
  }

  const octave = harmonics[0];
  const twelfth = harmonics[1];

  // Without either upper partial there is no harmonic series to root the candidate in:
  // a lone spectral peak must not be presented as an identified handpan fundamental.
  if (!octave.present && !twelfth.present) {
    degrade('unidentified', 'missing-octave');
    degrade('unidentified', 'missing-twelfth');
  } else {
    if (!octave.present) degrade('ambiguous', 'missing-octave');
    else if (!octave.consistent) degrade('ambiguous', 'inconsistent-octave');
    if (!twelfth.present) degrade('ambiguous', 'missing-twelfth');
  }

  return {
    status,
    reasons,
    fundamentalHz: fundamental.freq,
    fundamentalLevelDb: fundamental.magDb,
    harmonics,
    subharmonics,
    strongestSubharmonic,
  };
}

export interface IdentifiabilitySummary {
  status: IdentifiabilityStatus;
  /** Windows that carried an identifiability assessment. */
  windows: number;
  identifiedWindows: number;
  ambiguousWindows: number;
  unidentifiedWindows: number;
  /** Reasons seen in non-identified windows, most frequent first. */
  reasons: IdentifiabilityReason[];
}

/**
 * Aggregate per-window assessments over a recording. One ambiguous window is not a
 * verdict about the recording; the share of windows that agree is.
 */
export function summarizeFundamentalIdentifiability(
  frames: { identifiability?: IdentifiabilityAssessment }[],
): IdentifiabilitySummary {
  const assessments = frames
    .map((frame) => frame.identifiability)
    .filter((assessment): assessment is IdentifiabilityAssessment => assessment !== undefined);

  const identifiedWindows = assessments.filter((assessment) => assessment.status === 'identified').length;
  const ambiguousWindows = assessments.filter((assessment) => assessment.status === 'ambiguous').length;
  const unidentifiedWindows = assessments.filter((assessment) => assessment.status === 'unidentified').length;

  if (!assessments.length) {
    return {
      status: 'unidentified',
      windows: 0,
      identifiedWindows: 0,
      ambiguousWindows: 0,
      unidentifiedWindows: 0,
      reasons: ['no-fundamental'],
    };
  }

  const coverage = identifiedWindows / assessments.length;
  const status: IdentifiabilityStatus = coverage >= IDENTIFIABILITY_THRESHOLDS.identifiedCoverage
    ? 'identified'
    : coverage >= IDENTIFIABILITY_THRESHOLDS.minimumCoverage ? 'ambiguous' : 'unidentified';

  const counts = new Map<IdentifiabilityReason, number>();
  for (const assessment of assessments) {
    if (assessment.status === 'identified') continue;
    for (const reason of assessment.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const reasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason]) => reason);

  return {
    status,
    windows: assessments.length,
    identifiedWindows,
    ambiguousWindows,
    unidentifiedWindows,
    reasons,
  };
}
