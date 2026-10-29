import { freqToNoteAndCents } from './scales';

export interface ScalaReference {
  /** Zero-based degree index in the interval list; -1 means the tonic. */
  degreeIndex: number;
  octave: number;
  frequencyHz: number | null;
  explicit: boolean;
}

export interface ParsedScalaScale {
  name: string;
  count: number;
  intervalsCents: number[];
  periodCents: number;
  /** Explicit Linotune-style note names, aligned to intervalsCents. */
  degreeLabels: Array<string | null>;
  /** Optional per-file reference pitch specification. */
  reference: ScalaReference;
}

interface ScalaPitchEntry {
  cents: number;
  label: string | null;
  reference: { octave: number; frequencyHz: number | null } | null;
}

function parseScalaPitchValue(token: string): number | null {
  let cents: number;
  if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(token)) {
    const [numerator, denominator] = token.split('/').map(Number);
    if (numerator <= 0 || denominator <= 0) return null;
    cents = 1200 * Math.log2(numerator / denominator);
  } else {
    cents = Number(token);
  }
  return Number.isFinite(cents) && cents > 0 && cents <= 9600 ? cents : null;
}

/** Translate Linotune's accidental suffixes while keeping unknown ^c suffixes as literal c. */
export function normalizeScalaNoteLabel(source: string): string {
  const symbols: Record<string, string> = {
    B: '𝄫',
    b: '↓',
    d: '♭',
    '+': '↑',
    '#': '♯',
    x: '𝄪',
  };
  return source.replace(/\^([A-Za-z+#])/g, (_match, accidental: string) => symbols[accidental] ?? accidental);
}

/**
 * Parse standard Scala .scl pitch lists with Linotune's documented note-name
 * and !!reference extensions. This is an independent parser implementation;
 * no Linotune executable code is read or copied.
 */
export function parseScalaScl(source: string, options: { preserveSourceOrder?: boolean } = {}): ParsedScalaScale | null {
  if (typeof source !== 'string' || source.length > 200_000) return null;
  const lines = source.split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith('!')) return '';
      if (line.includes('!!reference')) return line;
      return line.replace(/!.*/, '').trim();
    })
    .filter(Boolean);
  if (lines.length < 3) return null;
  const name = lines[0].slice(0, 80).trim();
  const count = Number(lines[1]);
  if (!name || !Number.isInteger(count) || count < 1 || count > 128 || lines.length < count + 2) return null;

  const entries: ScalaPitchEntry[] = [];
  for (const line of lines.slice(2, count + 2)) {
    const markerIndex = line.indexOf('!!reference');
    const pitchText = (markerIndex >= 0 ? line.slice(0, markerIndex) : line).trim();
    const fields = pitchText.split(/\s+/);
    const token = fields[0];
    const cents = parseScalaPitchValue(token);
    if (cents === null) return null;
    if (!options.preserveSourceOrder && entries.length > 0 && cents <= entries[entries.length - 1].cents) return null;

    const colonIndex = pitchText.indexOf(':');
    const label = colonIndex >= 0
      ? normalizeScalaNoteLabel(pitchText.slice(colonIndex + 1).trim().slice(0, 64)) || null
      : null;
    let reference: ScalaPitchEntry['reference'] = null;
    if (markerIndex >= 0) {
      const marker = line.slice(markerIndex + '!!reference'.length).trim();
      const parts = marker ? marker.split(/\s+/) : [];
      const octave = parts[0] !== undefined && /^\d{1,2}$/.test(parts[0]) ? Number(parts[0]) : 4;
      const frequencyText = parts[0] !== undefined && /^\d{1,2}$/.test(parts[0]) ? parts[1] : parts[0];
      const frequencyHz = frequencyText !== undefined && Number.isFinite(Number(frequencyText)) && Number(frequencyText) >= 1 && Number(frequencyText) <= 20000
        ? Number(frequencyText)
        : null;
      if (entries.some((entry) => entry.reference !== null)) return null;
      reference = { octave: Math.max(0, Math.min(9, octave)), frequencyHz };
    }
    entries.push({ cents, label, reference });
  }

  const periodCents = entries[entries.length - 1].cents;
  if (!Number.isFinite(periodCents) || periodCents <= 0) return null;
  const intervals = entries.slice(0, -1);
  const explicitReferenceIndex = entries.findIndex((entry) => entry.reference !== null);
  const explicitReference = explicitReferenceIndex >= 0 ? entries[explicitReferenceIndex].reference : null;
  const isTwelveTone = count === 12 && Math.abs(periodCents - 1200) < 0.5;
  const reference: ScalaReference = explicitReference && explicitReferenceIndex >= 0
    ? {
        degreeIndex: explicitReferenceIndex === entries.length - 1 ? -1 : explicitReferenceIndex,
        octave: explicitReference.octave,
        frequencyHz: explicitReference.frequencyHz,
        explicit: true,
      }
    : {
        // Linotune's guide: A4 (pitch 10) by default for 12-tone scales, tonic otherwise.
        degreeIndex: isTwelveTone ? 8 : -1,
        octave: 4,
        frequencyHz: null,
        explicit: false,
      };

  return {
    name,
    count,
    intervalsCents: intervals.map((entry) => entry.cents),
    periodCents,
    degreeLabels: intervals.map((entry) => entry.label),
    reference,
  };
}

/**
 * Convert Scala intervals to the app's exact-frequency custom-scale input.
 * The user-selected root note/frequency anchors the scale. Explicit degree labels
 * are preserved; unlabelled notes receive a generated pitch name and degree ID.
 */
export function scalaToCustomScaleText(
  parsed: ParsedScalaScale,
  rootNote: string,
  rootFrequencyHz: number,
): string | null {
  if (!Number.isFinite(rootFrequencyHz) || rootFrequencyHz < 20 || rootFrequencyHz > 2000 ||
      !/^[A-Ga-g](?:#|b)?-?\d{1,2}$/.test(rootNote)) return null;
  const notes: { name: string; frequency: number }[] = [{ name: rootNote, frequency: rootFrequencyHz }];
  for (let i = 0; i < parsed.intervalsCents.length; i += 1) {
    const cents = parsed.intervalsCents[i];
    const frequency = rootFrequencyHz * Math.pow(2, cents / 1200);
    if (!Number.isFinite(frequency) || frequency > 2000) continue;
    const pitch = freqToNoteAndCents(frequency);
    const relativeCents = Math.round(pitch.cents);
    const generatedName = relativeCents === 0
      ? pitch.note
      : pitch.note + (relativeCents > 0 ? '+' : '') + relativeCents + 'c';
    const label = parsed.degreeLabels?.[i]?.trim();
    notes.push({ name: label || generatedName, frequency });
  }
  if (notes.length < 2 || notes.length > 24) return null;
  // Custom profile text requires distinct labels; preserve the supplied label and
  // disambiguate repeats deterministically rather than silently dropping a degree.
  const seen = new Map<string, number>();
  for (let i = 1; i < notes.length; i += 1) {
    const original = notes[i].name;
    const count = seen.get(original) ?? 0;
    seen.set(original, count + 1);
    if (count > 0) notes[i].name = original + ' (' + (i + 1) + ')';
  }
  return notes.map((note) => note.name + ', ' + note.frequency.toFixed(3)).join('\n');
}
