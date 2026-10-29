export const MIN_STROBE_SENSITIVITY = 0.25;
export const MAX_STROBE_SENSITIVITY = 2.5;
export const DEFAULT_STROBE_SENSITIVITY = 1;

/** Whether a persisted or imported roll-speed multiplier is within supported limits. */
export function isValidStrobeSensitivity(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_STROBE_SENSITIVITY &&
    value <= MAX_STROBE_SENSITIVITY;
}

/** Normalize legacy, missing, or manually edited values to the supported quarter-step scale. */
export function normalizeStrobeSensitivity(value: unknown): number {
  if (!isValidStrobeSensitivity(value)) return DEFAULT_STROBE_SENSITIVITY;
  return Math.round(value * 4) / 4;
}
