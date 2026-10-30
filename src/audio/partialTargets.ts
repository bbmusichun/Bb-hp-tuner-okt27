/**
 * Per-note offsets for handpan partial targets.
 *
 * Equal-tempered note frequency is a useful starting point, but real handpan
 * tone fields can have deliberately inharmonic partials. Store the octave and
 * third-partial offsets independently in cents so makers can target the actual
 * instrument specification without changing the global A4 reference.
 */
export type PartialTargetOffsetField = 'fundamentalCents' | 'octaveCents' | 'thirdPartialCents';

export interface PartialTargetOffset {
  /** Per-note correction to the 1× fundamental target. */
  fundamentalCents: number;
  octaveCents: number;
  thirdPartialCents: number;
}

export type PartialTargetOffsetMap = Record<string, PartialTargetOffset>;

export const DEFAULT_PARTIAL_TARGET_OFFSET: Readonly<PartialTargetOffset> = Object.freeze({
  fundamentalCents: 0,
  octaveCents: 0,
  thirdPartialCents: 0,
});

export const MAX_PARTIAL_TARGET_OFFSET_CENTS = 50;

export function clampPartialTargetOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_PARTIAL_TARGET_OFFSET_CENTS, Math.min(MAX_PARTIAL_TARGET_OFFSET_CENTS, value));
}

export function partialTargetOffsetKey(scaleId: string, noteName: string): string {
  return `${scaleId}:${noteName}`;
}

export function partialTargetFrequency(
  fundamentalHz: number,
  multiplier: 1 | 2 | 3,
  offsetCents = 0,
): number {
  if (!Number.isFinite(fundamentalHz) || fundamentalHz <= 0) return Number.NaN;
  return fundamentalHz * multiplier * Math.pow(2, clampPartialTargetOffset(offsetCents) / 1200);
}

/** Validate persisted custom offsets instead of trusting localStorage contents. */
export function normalizePartialTargetOffsets(value: unknown): PartialTargetOffsetMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: PartialTargetOffsetMap = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!key.trim() || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const fundamentalCents = typeof record.fundamentalCents === 'number' && Number.isFinite(record.fundamentalCents)
      ? clampPartialTargetOffset(record.fundamentalCents) : 0;
    const octaveCents = typeof record.octaveCents === 'number' && Number.isFinite(record.octaveCents)
      ? clampPartialTargetOffset(record.octaveCents) : 0;
    const thirdPartialCents = typeof record.thirdPartialCents === 'number' && Number.isFinite(record.thirdPartialCents)
      ? clampPartialTargetOffset(record.thirdPartialCents) : 0;
    if (fundamentalCents !== 0 || octaveCents !== 0 || thirdPartialCents !== 0) {
      normalized[key] = { fundamentalCents, octaveCents, thirdPartialCents };
    }
  }
  return normalized;
}


/**
 * Calibrate one of the three core resonance targets to a trusted live peak.
 * Only the selected per-note cents offset changes; invalid readings and
 * corrections outside the supported profile range are rejected.
 */
export function calibratePartialTargetOffset(
  offsets: PartialTargetOffset,
  field: PartialTargetOffsetField,
  measuredHz: number | null,
  targetHz: number | null,
): PartialTargetOffset | null {
  if (!Number.isFinite(measuredHz) || measuredHz === null || measuredHz < 20 || measuredHz > 20000 ||
      !Number.isFinite(targetHz) || targetHz === null || targetHz < 20 || targetHz > 20000) return null;
  const currentOffset = Number.isFinite(offsets[field]) ? offsets[field] : 0;
  const correction = 1200 * Math.log2(measuredHz / targetHz);
  const nextOffset = currentOffset + correction;
  if (!Number.isFinite(nextOffset) || nextOffset < -MAX_PARTIAL_TARGET_OFFSET_CENTS || nextOffset > MAX_PARTIAL_TARGET_OFFSET_CENTS) return null;
  return { ...DEFAULT_PARTIAL_TARGET_OFFSET, ...offsets, [field]: nextOffset };
}
