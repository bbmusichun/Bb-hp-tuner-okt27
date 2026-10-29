import { normalizePartialTargetOffsets, type PartialTargetOffsetMap } from './partialTargets';

export interface InstrumentProfile {
  id: string;
  name: string;
  scaleId: string;
  /** Concert pitch reference in Hz. */
  a4Ref: number;
  /** Per-tone partial target offsets belonging only to this physical instrument. */
  partialTargetOffsets: PartialTargetOffsetMap;
}

/**
 * Validate localStorage profiles defensively. Browser storage is user-editable
 * and older app versions may not contain profile data at all.
 */
export function normalizeInstrumentProfiles(
  value: unknown,
  knownScaleIds: readonly string[],
  fallback: InstrumentProfile,
): InstrumentProfile[] {
  const fallbackProfile: InstrumentProfile = {
    ...fallback,
    name: fallback.name.trim().slice(0, 80) || 'Saját handpan',
    partialTargetOffsets: normalizePartialTargetOffsets(fallback.partialTargetOffsets),
  };
  if (!Array.isArray(value)) return [fallbackProfile];

  const seenIds = new Set<string>();
  const result: InstrumentProfile[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 120) continue;
    const id = record.id.trim();
    if (seenIds.has(id)) continue;
    if (typeof record.name !== 'string' || !record.name.trim()) continue;
    if (typeof record.scaleId !== 'string' || !knownScaleIds.includes(record.scaleId)) continue;
    if (typeof record.a4Ref !== 'number' || !Number.isFinite(record.a4Ref) || record.a4Ref < 420 || record.a4Ref > 450) continue;
    seenIds.add(id);
    result.push({
      id,
      name: record.name.trim().slice(0, 80),
      scaleId: record.scaleId,
      a4Ref: record.a4Ref,
      partialTargetOffsets: normalizePartialTargetOffsets(record.partialTargetOffsets),
    });
  }
  return result.length > 0 ? result : [fallbackProfile];
}

export function resolveActiveInstrumentProfileId(
  value: unknown,
  profiles: readonly InstrumentProfile[],
): string {
  if (typeof value === 'string' && profiles.some((profile) => profile.id === value)) return value;
  return profiles[0]?.id ?? 'instrument-default';
}
