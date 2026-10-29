export type StrobeBandSource = 'fundamental' | 'fifth' | 'octave' | 'custom';
export type StrobeBandTargetMode = 'absolute' | 'ratio' | 'cents';

export interface StrobeBandConfig {
  id: string;
  name: string;
  source: StrobeBandSource;
  /** Cached target frequency for legacy compatibility and display fallback. */
  targetHz: number;
  centsOffset: number;
  enabled: boolean;
  /** Ratio/cents modes remain relative to the currently selected fundamental. Omitted means legacy absolute Hz. */
  targetMode?: StrobeBandTargetMode;
  /** Multiplier for ratio mode, or cents offset for cents mode. */
  targetValue?: number;
}

export interface ParsedStrobeTargetExpression {
  mode: StrobeBandTargetMode;
  value: number;
}

export const DEFAULT_STROBE_BANDS: StrobeBandConfig[] = [
  { id: 'fundamental', name: 'Alaphang', source: 'fundamental', targetHz: 146.832384, centsOffset: 0, enabled: true },
  { id: 'third-partial', name: '3. parciális', source: 'fifth', targetHz: 440.497152, centsOffset: 0, enabled: true },
  { id: 'octave', name: 'Oktáv', source: 'octave', targetHz: 293.664768, centsOffset: 0, enabled: true },
];

const VALID_SOURCES = new Set<StrobeBandSource>(['fundamental', 'fifth', 'octave', 'custom']);
const VALID_TARGET_MODES = new Set<StrobeBandTargetMode>(['absolute', 'ratio', 'cents']);

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

    const targetMode = record.targetMode === undefined ? 'absolute' : record.targetMode;
    if (typeof targetMode !== 'string' || !VALID_TARGET_MODES.has(targetMode as StrobeBandTargetMode)) continue;
    let targetValue: number | undefined;
    if (targetMode === 'ratio' || targetMode === 'cents') {
      if (typeof record.targetValue !== 'number' || !Number.isFinite(record.targetValue)) continue;
      if (targetMode === 'ratio' && (record.targetValue <= 0 || record.targetValue > 100)) continue;
      if (targetMode === 'cents' && (record.targetValue < -1200 || record.targetValue > 1200)) continue;
      targetValue = record.targetValue;
    }

    ids.add(id);
    result.push({
      id,
      name: record.name.trim(),
      source: record.source as StrobeBandSource,
      targetHz: record.targetHz,
      centsOffset: record.centsOffset,
      enabled: record.enabled,
      targetMode: targetMode as StrobeBandTargetMode,
      ...(targetValue === undefined ? {} : { targetValue }),
    });
  }
  return result.length ? result : DEFAULT_STROBE_BANDS.map((band) => ({ ...band }));
}

/**
 * Resolve an absolute target, a ratio of the selected fundamental (3/2, x1.5),
 * or cents relative to that fundamental (700c). Legacy bands without a mode remain absolute Hz.
 */
export function getStrobeBandTargetHz(band: StrobeBandConfig, baseFrequencyHz = 440): number {
  let nominalHz = band.targetHz;
  if (Number.isFinite(baseFrequencyHz) && baseFrequencyHz >= 20 && baseFrequencyHz <= 20000) {
    if (band.targetMode === 'ratio' && Number.isFinite(band.targetValue) && (band.targetValue ?? 0) > 0) {
      nominalHz = baseFrequencyHz * (band.targetValue as number);
    } else if (band.targetMode === 'cents' && Number.isFinite(band.targetValue)) {
      nominalHz = baseFrequencyHz * Math.pow(2, (band.targetValue as number) / 1200);
    }
  }
  const calibratedHz = nominalHz * Math.pow(2, band.centsOffset / 1200);
  return Number.isFinite(calibratedHz) && calibratedHz >= 20 && calibratedHz <= 20000 ? calibratedHz : band.targetHz;
}

/** Apply user-entered expression formats while keeping ratio/cents expressions coupled to the current fundamental. */
export function parseStrobeTargetExpressionParts(expression: string): ParsedStrobeTargetExpression | null {
  const value = expression.trim().replace(',', '.');
  if (!value || value.length > 40) return null;

  const centsMatch = value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:c|¢)$/i);
  if (centsMatch) {
    const cents = Number(centsMatch[1]);
    return Number.isFinite(cents) && cents >= -1200 && cents <= 1200
      ? { mode: 'cents', value: cents }
      : null;
  }

  const ratioMatch = value.match(/^(?:x\s*)?(\d+(?:\.\d+)?|\.\d+)\s*\/\s*(\d+(?:\.\d+)?|\.\d+)$/i);
  const multiplierMatch = value.match(/^x\s*(\d+(?:\.\d+)?|\.\d+)$/i);
  if (ratioMatch || multiplierMatch) {
    const numerator = ratioMatch ? Number(ratioMatch[1]) : Number(multiplierMatch![1]);
    const denominator = ratioMatch ? Number(ratioMatch[2]) : 1;
    const ratio = numerator / denominator;
    return Number.isFinite(ratio) && ratio > 0 && ratio <= 100 ? { mode: 'ratio', value: ratio } : null;
  }

  const hz = Number(value);
  return Number.isFinite(hz) && hz >= 20 && hz <= 20000 ? { mode: 'absolute', value: hz } : null;
}

/** Resolve user-entered absolute Hz, ratio, or cent expression against a base frequency. */
export function parseStrobeTargetExpression(expression: string, baseFrequencyHz = 440): number | null {
  if (!Number.isFinite(baseFrequencyHz) || baseFrequencyHz < 20 || baseFrequencyHz > 20000) return null;
  const parsed = parseStrobeTargetExpressionParts(expression);
  if (!parsed) return null;
  const hz = parsed.mode === 'absolute'
    ? parsed.value
    : parsed.mode === 'ratio'
      ? baseFrequencyHz * parsed.value
      : baseFrequencyHz * Math.pow(2, parsed.value / 1200);
  return Number.isFinite(hz) && hz >= 20 && hz <= 20000 ? hz : null;
}

/** Retain a band's expression when reopening its editor, rather than showing only the resolved Hz. */
export function formatStrobeTargetExpression(band: StrobeBandConfig): string {
  if (band.targetMode === 'ratio' && Number.isFinite(band.targetValue)) return 'x' + Number(band.targetValue).toString();
  if (band.targetMode === 'cents' && Number.isFinite(band.targetValue)) return Number(band.targetValue).toString() + 'c';
  return String(band.targetHz);
}
