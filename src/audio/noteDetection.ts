export interface NoteCandidate {
  id: string;
  noteName: string;
  frequency: number;
}

export interface SpectralPeak {
  db: number;
  hz: number;
}

export interface DetectedNote extends NoteCandidate {
  confidence: number;
}

type PeakLookup = (targetHz: number, centsWindow?: number) => SpectralPeak | null;

/**
 * Rank candidate fundamentals using the fundamental plus its 2x and 3x partials.
 * This is deliberately conservative: a missing fundamental is only accepted when
 * both partials are present and there is a clear score margin over other candidates.
 */
export function chooseNoteCandidate(
  candidates: NoteCandidate[],
  peakNear: PeakLookup,
): DetectedNote | null {
  if (candidates.length === 0) return null;

  const ranked = candidates
    .filter((candidate) =>
      Boolean(candidate.id) &&
      Boolean(candidate.noteName) &&
      Number.isFinite(candidate.frequency) &&
      candidate.frequency > 0
    )
    .map((candidate) => {
      const fundamental = peakNear(candidate.frequency, 65);
      const octave = peakNear(candidate.frequency * 2, 55);
      const third = peakNear(candidate.frequency * 3, 55);
      const validFundamental = fundamental && Number.isFinite(fundamental.db) ? fundamental : null;
      const validOctave = octave && Number.isFinite(octave.db) ? octave : null;
      const validThird = third && Number.isFinite(third.db) ? third : null;

      // A weak/missing fundamental can occur in struck metal. Partial peaks corroborate
      // a candidate, but cannot by themselves prove it unless both 2x and 3x are present.
      const baseDb = validFundamental?.db ?? -96;
      const octaveEvidence = validOctave ? Math.max(-24, validOctave.db - baseDb) * 0.22 : -5;
      const thirdEvidence = validThird ? Math.max(-24, validThird.db - baseDb) * 0.18 : -5;
      const fundamentalEvidence = validFundamental ? validFundamental.db : -13;
      const score = fundamentalEvidence + octaveEvidence + thirdEvidence;
      const confidence = Math.max(0, Math.min(1,
        (validFundamental ? (validFundamental.db + 90) / 45 : 0) +
        (validOctave ? 0.12 : 0) + (validThird ? 0.12 : 0)
      ));

      return {
        ...candidate,
        score,
        confidence,
        hasFundamental: Boolean(validFundamental),
        partialCount: Number(Boolean(validOctave)) + Number(Boolean(validThird)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best || best.confidence < 0.18) return null;
  if (!best.hasFundamental && best.partialCount < 2) return null;

  const requiredMargin = best.hasFundamental ? 2.5 : 5;
  if (runnerUp && best.score - runnerUp.score < requiredMargin) return null;

  return {
    id: best.id,
    noteName: best.noteName,
    frequency: best.frequency,
    confidence: best.confidence,
  };
}
