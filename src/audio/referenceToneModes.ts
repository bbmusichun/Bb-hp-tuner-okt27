export type ReferenceToneMode = 'continuous' | 'strike' | 'off';

export function normalizeReferenceToneMode(value: unknown): ReferenceToneMode {
  return value === 'continuous' || value === 'strike' || value === 'off' ? value : 'continuous';
}

/** Only play on the rising edge of the transient guard to avoid repeated beeps throughout one strike. */
export function shouldTriggerStrikeReferenceTone(
  mode: ReferenceToneMode,
  isListening: boolean,
  transientHoldoff: boolean,
  previousTransientHoldoff: boolean,
): boolean {
  return mode === 'strike' && isListening && transientHoldoff && !previousTransientHoldoff;
}
