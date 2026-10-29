export type StrobeBandSource = 'fundamental' | 'fifth' | 'octave' | 'custom';

export interface StrobeBandConfig {
  id: string;
  name: string;
  source: StrobeBandSource;
  targetHz: number;
  centsOffset: number;
  enabled: boolean;
}

export const DEFAULT_STROBE_BANDS: StrobeBandConfig[] = [
  { id: 'fundamental', name: 'Alaphang', source: 'fundamental', targetHz: 146.832384, centsOffset: 0, enabled: true },
  { id: 'third-partial', name: '3. parciális', source: 'fifth', targetHz: 440.497152, centsOffset: 0, enabled: true },
  { id: 'octave', name: 'Oktáv', source: 'octave', targetHz: 293.664768, centsOffset: 0, enabled: true },
];

const VALID_SOURCES = new Set<StrobeBandSource>(['fundamental', 'fifth', 'octave', 'custom']);

/** Validate user-editable strobe configuration without trusting localStorage. */
export function normalizeStrobeBands(value: unknown): StrobeBandConfig[] {
  if (!Array.isArray(value)) return DEFAULT_STROBE_BANDS.map((band) => ({ ...band }));
  if (value.length === 0) return [];
  const result: StrobeBandConfig[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 80) continue;
    const id = record.id.trim();
    if (ids.has(id)) continue;
    if (typeof record.name !== 'string' || !record.name.trim() || record.name.length > 48) continue;
    if (typeof record.source !== 'string' || !VALID_SOURCES.has(record.source as StrobeBandSource)) continue;
    if (typeof record.targetHz !== 'number' || !Number.isFinite(record.targetHz) || record.targetHz < 20 || record.targetHz > 20000) continue;
    if (typeof record.centsOffset !== 'number' || !Number.isFinite(record.centsOffset) || record.centsOffset < -1200 || record.centsOffset > 1200) continue;
    if (typeof record.enabled !== 'boolean') continue;
    ids.add(id);
    result.push({
      id,
      name: record.name.trim(),
      source: record.source as StrobeBandSource,
      targetHz: record.targetHz,
      centsOffset: record.centsOffset,
      enabled: record.enabled,
    });
  }
  return result.length ? result : DEFAULT_STROBE_BANDS.map((band) => ({ ...band }));
}

/** Apply a band's calibration offset to its nominal target frequency. */
export function getStrobeBandTargetHz(band: StrobeBandConfig): number {
  return band.targetHz * Math.pow(2, band.centsOffset / 1200);
}
