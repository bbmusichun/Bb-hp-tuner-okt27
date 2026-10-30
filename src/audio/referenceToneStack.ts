export const MAX_REFERENCE_TONE_VOICES = 11;
export const REFERENCE_TONE_STACK_BASE_GAIN = 0.3;

/** Deduplicate and validate tone-stack frequencies before they reach Web Audio. */
export function normalizeReferenceToneFrequencies(frequenciesHz: readonly number[]): number[] {
  return [...new Set(frequenciesHz)]
    .filter((frequency) => Number.isFinite(frequency) && frequency > 0 && frequency < 20000)
    .slice(0, MAX_REFERENCE_TONE_VOICES);
}

/** Keep the coherent worst-case stack amplitude below unity as voices are added. */
export function getReferenceToneStackGain(voiceCount: number): number {
  if (!Number.isInteger(voiceCount) || voiceCount <= 0 || voiceCount > MAX_REFERENCE_TONE_VOICES) return 0;
  return REFERENCE_TONE_STACK_BASE_GAIN / Math.sqrt(voiceCount);
}
