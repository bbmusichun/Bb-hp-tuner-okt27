/**
 * Keep weak spectral peaks visible, but do not call them reliable tuning readings.
 * The UI can still display their frequency while marking the result uncertain.
 */
export function resonanceConfidenceFromDb(amplitudeDb: number): number {
  if (!Number.isFinite(amplitudeDb)) return 0;
  return Math.max(0, Math.min(1, (amplitudeDb + 100) / 65));
}

export function isReliableResonanceConfidence(confidence: number): boolean {
  // -80 dB is measurable but too weak to qualify as a reliable tuning reading.
  return Number.isFinite(confidence) && confidence >= 0.32;
}
