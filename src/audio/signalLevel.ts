/** RMS gate for the presence of a usable audio frame. */
export const MIN_USABLE_SIGNAL_DB = -72;

/**
 * Keep quiet handpan decay frames available to the per-resonance FFT/confidence
 * checks. A frame passing this gate is not automatically a valid pitch.
 */
export function isUsableSignalLevel(inputLevelDb: number, minimumDb = MIN_USABLE_SIGNAL_DB): boolean {
  return Number.isFinite(inputLevelDb) && Number.isFinite(minimumDb) && inputLevelDb > minimumDb;
}
