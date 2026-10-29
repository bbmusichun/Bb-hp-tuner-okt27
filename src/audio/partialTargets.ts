/**
 * Per-note offsets for handpan partial targets.
 *
 * Equal-tempered note frequency is a useful starting point, but real handpan
 * tone fields can have deliberately inharmonic partials. Store the fundamental,
 * octave and third-partial offsets independently in cents so makers can target the
 * actual instrument specification without changing the global A4 reference.
 */
export type PartialTargetOffsetField = 'fundamentalCents' | 'octaveCents' | 'thirdPartialCents';

export interface PartialTargetOffset {
  /** Per-note fundamental correction from the scale/profile target. */
  fundamentalCents?: number;
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
  multiplier: 2 | 3,
  offsetCents = 0,
): number {
  if (!Number.isFinite(fundamentalHz) || fundamentalHz <= 0) return Number.NaN;
  return fundamentalHz * multiplier * Math.pow(2, clampPartialTargetOffset(offsetCents) / 1200);
}

/** Validate persisted per-note target offsets, preserving compatibility with older two-offset profiles. */
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
      normalized[key] = {
        ...(fundamentalCents === 0 ? {} : { fundamentalCents }),
        octaveCents,
        thirdPartialCents,
      };
    }
  }
  return normalized;
}
/**
 * Calibrate an existing partial offset to an observed FFT frequency.
 *
 * targetHz must be the currently active target (including the existing offset).
 * The measured frequency is never changed; only the target offset is corrected.
 * Returns null for missing or invalid measurements so a stale/no-signal value
 * cannot silently turn into a calibration.
 */
export function calibratePartialTargetOffset(
  currentOffsetCents: number,
  targetHz: number,
  measuredHz: number,
): number | null {
  if (
    !Number.isFinite(currentOffsetCents) ||
    !Number.isFinite(targetHz) || targetHz <= 0 ||
    !Number.isFinite(measuredHz) || measuredHz <= 0
  ) return null;

  const deviationCents = 1200 * Math.log2(measuredHz / targetHz);
  if (!Number.isFinite(deviationCents)) return null;
  return clampPartialTargetOffset(currentOffsetCents + deviationCents);
}
