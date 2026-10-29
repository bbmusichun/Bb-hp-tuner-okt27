import type { WavFrameAnalysis } from './wavAnalysis';
import { medianAbsoluteDeviation, medianOrNull } from './measurementQuality';

export interface PartialInharmonicityEstimate {
  /** Frames with a strong, separately visible 1x/2x/3x resonance and a matching note. */
  sampleCount: number;
  /** Frames where the selected note was detected, before resonance-quality filtering. */
  matchingNoteFrames: number;
  coverage: number;
  octaveCents: number | null;
  thirdPartialCents: number | null;
  octaveMadCents: number | null;
  thirdPartialMadCents: number | null;
  reliable: boolean;
}

const centsFromRatio = (measuredHz: number, expectedHz: number): number =>
  1200 * Math.log2(measuredHz / expectedHz);

function isStrongResonance(resonance: WavFrameAnalysis['resonances'][number] | undefined): boolean {
  return Boolean(
    resonance &&
    resonance.measuredHz !== null && Number.isFinite(resonance.measuredHz) && resonance.measuredHz > 0 &&
    resonance.peakDb !== null && Number.isFinite(resonance.peakDb) && resonance.peakDb >= -70 &&
    resonance.prominenceDb !== null && Number.isFinite(resonance.prominenceDb) && resonance.prominenceDb >= 12
  );
}

/**
 * Estimate the instrument's actual partial ratios, normalized to the measured
 * fundamental of each same frame. The recording's overall tuning therefore does
 * not get mistaken for partial inharmonicity. This is a guarded estimate, not a
 * certified calibration; a person must explicitly apply it to an instrument profile.
 */
export function estimatePartialInharmonicity(
  frames: WavFrameAnalysis[],
  targetFrequencyHz: number,
): PartialInharmonicityEstimate {
  const matching = frames.filter((frame) => {
    const detected = frame.detectedNote;
    if (!detected || !Number.isFinite(detected.frequency) || detected.frequency <= 0 || detected.confidence < 0.55) return false;
    if (!Number.isFinite(targetFrequencyHz) || targetFrequencyHz <= 0) return false;
    return Math.abs(centsFromRatio(detected.frequency, targetFrequencyHz)) <= 35;
  });

  const octaveOffsets: number[] = [];
  const thirdOffsets: number[] = [];

  for (const frame of matching) {
    const [fundamental, octave, third] = frame.resonances;
    if (!isStrongResonance(fundamental) || !isStrongResonance(octave) || !isStrongResonance(third)) continue;
    const f0 = fundamental.measuredHz as number;
    const f2 = octave.measuredHz as number;
    const f3 = third.measuredHz as number;
    const octaveCents = centsFromRatio(f2, f0 * 2);
    const thirdPartialCents = centsFromRatio(f3, f0 * 3);
    if (
      Number.isFinite(octaveCents) && Math.abs(octaveCents) <= 50 &&
      Number.isFinite(thirdPartialCents) && Math.abs(thirdPartialCents) <= 50
    ) {
      octaveOffsets.push(octaveCents);
      thirdOffsets.push(thirdPartialCents);
    }
  }

  const octaveCents = medianOrNull(octaveOffsets);
  const thirdPartialCents = medianOrNull(thirdOffsets);
  const octaveMadCents = medianAbsoluteDeviation(octaveOffsets);
  const thirdPartialMadCents = medianAbsoluteDeviation(thirdOffsets);
  const sampleCount = Math.min(octaveOffsets.length, thirdOffsets.length);
  const coverage = matching.length > 0 ? sampleCount / matching.length : 0;
  const reliable =
    sampleCount >= 4 &&
    coverage >= 0.6 &&
    octaveMadCents !== null && octaveMadCents <= 3 &&
    thirdPartialMadCents !== null && thirdPartialMadCents <= 3 &&
    octaveCents !== null && Math.abs(octaveCents) <= 50 &&
    thirdPartialCents !== null && Math.abs(thirdPartialCents) <= 50;

  return {
    sampleCount,
    matchingNoteFrames: matching.length,
    coverage,
    octaveCents,
    thirdPartialCents,
    octaveMadCents,
    thirdPartialMadCents,
    reliable,
  };
}
