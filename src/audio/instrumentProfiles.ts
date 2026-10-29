import { normalizePartialTargetOffsets, type PartialTargetOffsetMap } from './partialTargets';
import type { HandpanScale } from '../types/tuner';

export interface InstrumentProfile {
  id: string;
  name: string;
  scaleId: string;
  /** Concert pitch reference in Hz. */
  a4Ref: number;
  /** Per-tone partial target offsets belonging only to this physical instrument. */
  partialTargetOffsets: PartialTargetOffsetMap;
  /** Custom exact-frequency scale, if this profile does not use a built-in preset. */
  customScale?: HandpanScale;
}


/**
 * Parse a maker-supplied scale in "note name, frequency Hz" format.
 * Each non-empty row is one target. Do not quantize these targets to equal temperament.
 */
export function parseCustomScale(name: string, source: string, id: string): HandpanScale | null {
  const scaleName = name.trim().slice(0, 80);
  if (!scaleName || !id.trim() || id.length > 120 || typeof source !== 'string') return null;
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > 24) return null;
  const seenNames = new Set<string>();
  const notes: HandpanScale['notes'] = [];
  for (const line of lines) {
    const fields = line.split(/[,\t;]/).map((field) => field.trim());
    if (fields.length !== 2) return null;
    const [noteName, rawFrequency] = fields;
    if (!/^[A-Ga-g](?:#|b)?-?\d{1,2}$/.test(noteName)) return null;
    const uniquenessKey = noteName.toLowerCase();
    if (seenNames.has(uniquenessKey)) return null;
    const frequencyHz = Number(rawFrequency);
    if (!Number.isFinite(frequencyHz) || frequencyHz < 20 || frequencyHz > 2000) return null;
    seenNames.add(uniquenessKey);
    notes.push({ name: noteName, midi: Math.round(69 + 12 * Math.log2(frequencyHz / 440)), frequencyHz });
  }
  return { id: id.trim(), name: scaleName, root: notes[0].name, noteCount: notes.length, notes };
}

function normalizePersistedCustomScale(value: unknown, expectedId: string): HandpanScale | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.id !== expectedId || typeof record.name !== 'string' || !Array.isArray(record.notes)) return undefined;
  const sourceLines: string[] = [];
  for (const note of record.notes) {
    if (!note || typeof note !== 'object' || Array.isArray(note)) return undefined;
    const candidate = note as Record<string, unknown>;
    if (typeof candidate.name !== 'string' || typeof candidate.frequencyHz !== 'number') return undefined;
    sourceLines.push(candidate.name + ', ' + String(candidate.frequencyHz));
  }
  return parseCustomScale(record.name, sourceLines.join('\n'), expectedId) ?? undefined;
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
    if (typeof record.scaleId !== 'string') continue;
    const customScale = normalizePersistedCustomScale(record.customScale, record.scaleId);
    if (!knownScaleIds.includes(record.scaleId) && !customScale) continue;
    if (typeof record.a4Ref !== 'number' || !Number.isFinite(record.a4Ref) || record.a4Ref < 420 || record.a4Ref > 450) continue;
    seenIds.add(id);
    result.push({
      id,
      name: record.name.trim().slice(0, 80),
      scaleId: record.scaleId,
      a4Ref: record.a4Ref,
      partialTargetOffsets: normalizePartialTargetOffsets(record.partialTargetOffsets),
      ...(customScale ? { customScale } : {}),
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

/** Parse and fully validate an exported profile backup before the UI changes state. */
export function parseInstrumentProfileBackup(
  value: unknown,
  knownScaleIds: readonly string[],
  fallback: InstrumentProfile,
): InstrumentProfile[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const backup = value as Record<string, unknown>;
  if (backup.schemaVersion !== 1 || !Array.isArray(backup.profiles) || backup.profiles.length < 1 || backup.profiles.length > 100) {
    return null;
  }
  const rawProfiles = backup.profiles;
  const sentinelId = '__bb_tuner_invalid_backup_fallback__';
  if (rawProfiles.some((item) => !item || typeof item !== 'object' || Array.isArray(item) ||
    typeof (item as Record<string, unknown>).id !== 'string' ||
    (item as Record<string, unknown>).id === sentinelId)) return null;

  const normalized = normalizeInstrumentProfiles(rawProfiles, knownScaleIds, {
    ...fallback,
    id: sentinelId,
    name: 'Import-validation fallback',
  });
  if (normalized.length !== rawProfiles.length) return null;
  for (let index = 0; index < normalized.length; index += 1) {
    const raw = rawProfiles[index] as Record<string, unknown>;
    if (normalized[index].id !== raw.id) return null;
  }
  return normalized;
}
