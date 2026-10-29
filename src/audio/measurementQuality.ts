/**
 * Measurement-quality assessment for offline windowed partial analysis.
 *
 * A cents value from a single window is not a tuning result on its own: it can
 * come from a marginal peak, from one lucky frame, or from a spectrum where the
 * partial is not separable from its surroundings. This module turns the metrics
 * the analyser already produces (coverage of valid windows, robust spread,
 * peak level, local prominence) into an explicit verdict with the reasons that
 * limited it, so the UI can state what the measurement does and does not support.
 *
 * The thresholds below are engineering criteria, not calibrated uncertainty.
 * They are deliberately conservative and documented in
 * docs/REFERENCE_AUDIO_VALIDATION.md; they must not be presented as a confidence
 * percentage or a metrological error bound.
 */
import type { WavFrameAnalysis } from './wavAnalysis';

export type MeasurementQualityStatus = 'reliable' | 'marginal' | 'insufficient';

export type MeasurementQualityReason =
  | 'no-measurement'
  | 'too-few-windows'
  | 'low-coverage'
  | 'unstable'
  | 'weak-peak'
  | 'low-prominence';

export interface PartialQualityInput {
  /** Windows analysed for this recording. */
  totalWindows: number;
  /** Windows in which this partial produced a peak above the floor. */
  measuredWindows: number;
  /** Robust frame-to-frame spread of the cents readings (median absolute deviation). */
  madCents: number | null;
  /** Median detected peak level in dBFS. */
  medianPeakDb: number | null;
  /** Median peak prominence above the local band background, in dB. */
  medianProminenceDb: number | null;
}

export interface PartialQualityAssessment {
  status: MeasurementQualityStatus;
  reasons: MeasurementQualityReason[];
  /** Share of analysed windows that produced a valid reading, 0…1. */
  coverage: number;
}

/**
 * - coverage: a reading present in most windows is repeatable; one in every four
 *   is not enough to describe the partial.
 * - spread: 3 cents is far below handpan tuning tolerances and survives FFT-bin
 *   and framing noise; 10 cents is already audible and means the frames disagree.
 * - level: -80 dBFS is measurable but, as in the live tuner's peak confidence,
 *   too weak to be called a reliable tuning reading; -70 dBFS has clear margin.
 * - prominence: a peak must stand ~12 dB above the median level of its own target
 *   band to be a distinct resonance rather than window leakage or noise; 6 dB is
 *   the minimum at which it is separable at all.
 * - window count: spread and coverage cannot describe a trend from one or two frames.
 */
export const QUALITY_THRESHOLDS = {
  reliableCoverage: 0.6,
  minimumCoverage: 0.25,
  reliableSpreadCents: 3,
  maximumSpreadCents: 10,
  reliablePeakDb: -70,
  minimumPeakDb: -80,
  reliableProminenceDb: 12,
  minimumProminenceDb: 6,
  minimumWindowsForStability: 3,
} as const;

const SEVERITY: Record<MeasurementQualityStatus, number> = {
  reliable: 0,
  marginal: 1,
  insufficient: 2,
};

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** Format a quality verdict for accessible UI copy without implying calibrated accuracy. */
export function describeMeasurementQuality(assessment: PartialQualityAssessment): {
  title: string;
  description: string;
} {
  switch (assessment.status) {
    case 'reliable':
      return {
        title: 'Ismételhető mérés',
        description: 'A talált csúcs több elemzett ablakban stabilan megjelent. Ez nem igazolja önmagában a külső referencia szerinti abszolút pontosságot.',
      };
    case 'marginal':
      return {
        title: 'Óvatosan értékeld',
        description: 'A mérés használható tájékoztató jelleggel, de a kevés minta vagy a jel minősége miatt érdemes újramérni.',
      };
    default:
      return {
        title: 'Nem elég megbízható',
        description: 'A rendelkezésre álló jelből nem állítható elő kellően alátámasztott hangolási eredmény. Ellenőrizd a jelszintet, a zajt és a hangszer lecsengését, majd mérj újra.',
      };
  }
}

/** Human-readable explanations for quality flags; kept separate from measurement values. */
export const MEASUREMENT_QUALITY_REASON_LABELS: Record<MeasurementQualityReason, string> = {
  'no-measurement': 'Nem találtunk értékelhető frekvenciacsúcsot.',
  'too-few-windows': 'Kevés elemzési ablak áll rendelkezésre a stabilitás megítéléséhez.',
  'low-coverage': 'A csúcs nem jelent meg elég következetesen az elemzési ablakokban.',
  unstable: 'A mért frekvencia több ablak között túlságosan ingadozott.',
  'weak-peak': 'A frekvenciacsúcs túl gyenge a biztos értékeléshez.',
  'low-prominence': 'A frekvenciacsúcs nem emelkedik ki eléggé a környező spektrumból.',
};

export function assessPartialQuality(input: PartialQualityInput): PartialQualityAssessment {
  const totalWindows = Number.isFinite(input.totalWindows) ? Math.max(0, input.totalWindows) : 0;
  const measuredWindows = Number.isFinite(input.measuredWindows)
    ? Math.max(0, Math.min(input.measuredWindows, totalWindows))
    : 0;
  const coverage = totalWindows > 0 ? measuredWindows / totalWindows : 0;
  const reasons: MeasurementQualityReason[] = [];
  let status: MeasurementQualityStatus = 'reliable';

  const degrade = (next: MeasurementQualityStatus, reason: MeasurementQualityReason) => {
    reasons.push(reason);
    if (SEVERITY[next] > SEVERITY[status]) status = next;
  };

  if (measuredWindows === 0) {
    return { status: 'insufficient', reasons: ['no-measurement'], coverage };
  }

  if (measuredWindows < QUALITY_THRESHOLDS.minimumWindowsForStability) {
    degrade('marginal', 'too-few-windows');
  }

  if (coverage < QUALITY_THRESHOLDS.minimumCoverage) {
    degrade('insufficient', 'low-coverage');
  } else if (coverage < QUALITY_THRESHOLDS.reliableCoverage) {
    degrade('marginal', 'low-coverage');
  }

  if (!isFiniteNumber(input.madCents)) {
    degrade('insufficient', 'unstable');
  } else if (input.madCents > QUALITY_THRESHOLDS.maximumSpreadCents) {
    degrade('insufficient', 'unstable');
  } else if (input.madCents > QUALITY_THRESHOLDS.reliableSpreadCents) {
    degrade('marginal', 'unstable');
  }

  if (!isFiniteNumber(input.medianPeakDb) || input.medianPeakDb < QUALITY_THRESHOLDS.minimumPeakDb) {
    degrade('insufficient', 'weak-peak');
  } else if (input.medianPeakDb < QUALITY_THRESHOLDS.reliablePeakDb) {
    degrade('marginal', 'weak-peak');
  }

  if (!isFiniteNumber(input.medianProminenceDb) || input.medianProminenceDb < QUALITY_THRESHOLDS.minimumProminenceDb) {
    degrade('insufficient', 'low-prominence');
  } else if (input.medianProminenceDb < QUALITY_THRESHOLDS.reliableProminenceDb) {
    degrade('marginal', 'low-prominence');
  }

  return { status, reasons, coverage };
}

/** Median with an explicit empty-result value; `null` means "not enough data". */
export function medianOrNull(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median absolute deviation: robust frame-to-frame spread, in the input's unit. */
export function medianAbsoluteDeviation(values: number[]): number | null {
  const center = medianOrNull(values);
  if (center === null) return null;
  return medianOrNull(values.map((value) => Math.abs(value - center)));
}

export interface WavPartialSummary {
  multiplier: number;
  targetHz: number;
  measuredWindows: number;
  totalWindows: number;
  medianCents: number | null;
  madCents: number | null;
  medianPeakDb: number | null;
  medianProminenceDb: number | null;
  quality: PartialQualityAssessment;
}

/**
 * Aggregate one partial (1×, 2×, 3×) across analysed windows.
 * `multiplier` is 1-based: 1 = fundamental, 2 = octave, 3 = third partial.
 */
export function summarizeWavPartial(frames: WavFrameAnalysis[], multiplier: number): WavPartialSummary {
  const index = multiplier - 1;
  const resonances = frames
    .map((frame) => frame.resonances[index])
    .filter((resonance) => resonance !== undefined);
  const cents = resonances
    .map((resonance) => resonance.cents)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const peakDb = resonances
    .map((resonance) => resonance.peakDb)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const prominenceDb = resonances
    .map((resonance) => resonance.prominenceDb)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const targetHz = resonances.find((resonance) => Number.isFinite(resonance.targetHz))?.targetHz
    ?? frames[0]?.resonances[index]?.targetHz
    ?? 0;
  const medianCents = medianOrNull(cents);
  const madCents = medianAbsoluteDeviation(cents);

  return {
    multiplier,
    targetHz,
    measuredWindows: cents.length,
    totalWindows: frames.length,
    medianCents,
    madCents,
    medianPeakDb: medianOrNull(peakDb),
    medianProminenceDb: medianOrNull(prominenceDb),
    quality: assessPartialQuality({
      totalWindows: frames.length,
      measuredWindows: cents.length,
      madCents,
      medianPeakDb: medianOrNull(peakDb),
      medianProminenceDb: medianOrNull(prominenceDb),
    }),
  };
}
