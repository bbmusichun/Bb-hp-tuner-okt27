export type AutoDetectionMode = 'continuous' | 'single-shot' | 'off';

export function normalizeAutoDetectionMode(value: unknown, legacyAutoDetect?: unknown): AutoDetectionMode {
  if (value === 'continuous' || value === 'single-shot' || value === 'off') return value;
  return legacyAutoDetect === false ? 'off' : 'continuous';
}

export function isDetectionArmed(mode: AutoDetectionMode, singleShotCaptured: boolean): boolean {
  return mode === 'continuous' || (mode === 'single-shot' && !singleShotCaptured);
}

export function nextAutoDetectionMode(mode: AutoDetectionMode): AutoDetectionMode {
  if (mode === 'continuous') return 'single-shot';
  if (mode === 'single-shot') return 'off';
  return 'continuous';
}
