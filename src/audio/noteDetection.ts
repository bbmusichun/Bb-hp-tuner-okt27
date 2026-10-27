export interface NoteCandidate { id: string; noteName: string; frequency: number; }
export interface SpectralPeak { db: number; hz: number; }
export interface DetectedNote extends NoteCandidate { confidence: number; }
type PeakLookup = (targetHz: number, centsWindow?: number) => SpectralPeak | null;
const centsDistance = (measured: SpectralPeak | null, targetHz: number): number =>
  measured && Number.isFinite(measured.hz) && measured.hz > 0
    ? Math.abs(1200 * Math.log2(measured.hz / targetHz))
    : 0;

/**
 * Ranks each configured handpan note using independent f0, 2x and 3x evidence.
 * Exact frequency proximity contributes to the score so a loud nearby resonance
 * cannot win simply because it is loud. Missing f0 remains a conservative fallback.
 */
export function chooseNoteCandidate(candidates: NoteCandidate[], peakNear: PeakLookup): DetectedNote | null {
  if (!candidates.length) return null;
  const ranked = candidates
    .filter(c => Boolean(c.id) && Boolean(c.noteName) && Number.isFinite(c.frequency) && c.frequency > 0)
    .map(candidate => {
      const fundamental = peakNear(candidate.frequency, 65);
      const octave = peakNear(candidate.frequency * 2, 55);
      const third = peakNear(candidate.frequency * 3, 55);
      const f = fundamental && Number.isFinite(fundamental.db) && Number.isFinite(fundamental.hz) ? fundamental : null;
      const o = octave && Number.isFinite(octave.db) && Number.isFinite(octave.hz) ? octave : null;
      const t = third && Number.isFinite(third.db) && Number.isFinite(third.hz) ? third : null;
      const baseDb = f?.db ?? -96;
      const octaveEvidence = o ? Math.max(-24, o.db - baseDb) * 0.22 : -5;
      const thirdEvidence = t ? Math.max(-24, t.db - baseDb) * 0.18 : -5;
      const fundamentalEvidence = f ? f.db : -13;
      // Frequency-error penalties are intentionally modest: real handpan partials
      // may be inharmonic, but the correct candidate should still be closer overall.
      const frequencyPenalty =
        Math.min(6, centsDistance(f, candidate.frequency) * 0.045) +
        Math.min(3, centsDistance(o, candidate.frequency * 2) * 0.018) +
        Math.min(3, centsDistance(t, candidate.frequency * 3) * 0.018);
      // Reward a candidate when both partials corroborate the same fundamental.
      // This helps distinguish a true lower note from a stronger overlapping octave.
      const corroborationBonus = f && o && t ? 2.5 : 0;
      const score = fundamentalEvidence + octaveEvidence + thirdEvidence - frequencyPenalty + corroborationBonus;
      const confidence = Math.max(0, Math.min(1,
        (f ? (f.db + 90) / 45 : 0) + (o ? 0.12 : 0) + (t ? 0.12 : 0)
      ));
      const partialCount = Number(Boolean(o)) + Number(Boolean(t));
      const eligible = confidence >= 0.18 && (Boolean(f) || partialCount === 2);
      return { ...candidate, score, confidence, hasFundamental: Boolean(f), partialCount, eligible };
    })
    .filter(c => c.eligible && Number.isFinite(c.score))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0], runnerUp = ranked[1];
  if (!best) return null;
  const requiredMargin = best.hasFundamental ? 3.5 : 6;
  if (runnerUp && best.score - runnerUp.score < requiredMargin) return null;
  return { id: best.id, noteName: best.noteName, frequency: best.frequency, confidence: best.confidence };
}
