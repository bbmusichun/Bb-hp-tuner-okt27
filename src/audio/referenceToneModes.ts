export type ReferenceToneMode = 'continuous' | 'strike' | 'off';
export type ReferenceToneRole = 'fundamental' | 'fifth' | 'octave';
export type ReferenceToneModesByRole = Record<ReferenceToneRole, ReferenceToneMode>;

export const REFERENCE_TONE_ROLES: readonly ReferenceToneRole[] = ['fundamental', 'fifth', 'octave'];

export function normalizeReferenceToneMode(value: unknown): ReferenceToneMode {
  return value === 'continuous' || value === 'strike' || value === 'off' ? value : 'continuous';
}

export function createReferenceToneModesByRole(mode: ReferenceToneMode = 'continuous'): ReferenceToneModesByRole {
  return {
    fundamental: mode,
    fifth: mode,
    octave: mode,
  };
}

/**
 * Normalize persisted per-resonance modes. Missing entries inherit the old
 * global mode so existing preferences keep their previous behaviour.
 */
export function normalizeReferenceToneModesByRole(
  value: unknown,
  fallbackMode: ReferenceToneMode = 'continuous',
): ReferenceToneModesByRole {
  const fallback = normalizeReferenceToneMode(fallbackMode);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createReferenceToneModesByRole(fallback);
  }
  const record = value as Record<string, unknown>;
  return {
    fundamental: record.fundamental === 'continuous' || record.fundamental === 'strike' || record.fundamental === 'off'
      ? record.fundamental : fallback,
    fifth: record.fifth === 'continuous' || record.fifth === 'strike' || record.fifth === 'off'
      ? record.fifth : fallback,
    octave: record.octave === 'continuous' || record.octave === 'strike' || record.octave === 'off'
      ? record.octave : fallback,
  };
}

/** Strict validation for imported backups; partial maps must not silently lose settings. */
export function isValidReferenceToneModesByRole(value: unknown): value is ReferenceToneModesByRole {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return REFERENCE_TONE_ROLES.every((role) =>
    record[role] === 'continuous' || record[role] === 'strike' || record[role] === 'off',
  );
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
