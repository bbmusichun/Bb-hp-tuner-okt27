export const MIN_TRACKING_PROMINENCE_DB = 8;

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

/**
 * Only clear, sufficiently strong peaks may influence temporal smoothing or stability.
 * Ambiguous and weak peaks remain visible as uncertain measurements, but are quarantined
 * so they cannot bias a later clean frame.
 */
export function isTrackableResonancePeak(
  peakAmbiguous: boolean,
  confidence: number,
  prominenceDb = MIN_TRACKING_PROMINENCE_DB,
): boolean {
  return !peakAmbiguous &&
    isReliableResonanceConfidence(confidence) &&
    Number.isFinite(prominenceDb) &&
    prominenceDb >= MIN_TRACKING_PROMINENCE_DB;
}
