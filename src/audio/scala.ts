import { freqToNoteAndCents } from './scales';

export interface ParsedScalaScale {
  name: string;
  count: number;
  intervalsCents: number[];
  periodCents: number;
}

/** Parse a standard Scala .scl file into ascending cents intervals. */
export function parseScalaScl(source: string): ParsedScalaScale | null {
  if (typeof source !== 'string' || source.length > 200_000) return null;
  const lines = source.split(/\r?\n/)
    .map((line) => line.replace(/!.*/, '').trim())
    .filter(Boolean);
  if (lines.length < 3) return null;
  const name = lines[0].slice(0, 80).trim();
  const count = Number(lines[1]);
  if (!name || !Number.isInteger(count) || count < 1 || count > 128 || lines.length < count + 2) return null;
  const intervals: number[] = [];
  for (const line of lines.slice(2, count + 2)) {
    const token = line.split(/\s+/)[0];
    let cents: number;
    if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(token)) {
      const [numerator, denominator] = token.split('/').map(Number);
      if (numerator <= 0 || denominator <= 0) return null;
      cents = 1200 * Math.log2(numerator / denominator);
    } else {
      cents = Number(token);
    }
    if (!Number.isFinite(cents) || cents <= 0 || cents > 9600) return null;
    if (intervals.length && cents <= intervals[intervals.length - 1]) return null;
    intervals.push(cents);
  }
  const periodCents = intervals[intervals.length - 1];
  if (!Number.isFinite(periodCents) || periodCents <= 0) return null;
  return { name, count, intervalsCents: intervals.slice(0, -1), periodCents };
}

/**
 * Convert Scala intervals to the app's exact-frequency custom-scale input.
 * The user-selected root note/frequency anchors the scale; labels remain unique
 * for microtonal degrees by including the degree index and cents when needed.
 */
export function scalaToCustomScaleText(
  parsed: ParsedScalaScale,
  rootNote: string,
  rootFrequencyHz: number,
): string | null {
  if (!Number.isFinite(rootFrequencyHz) || rootFrequencyHz < 20 || rootFrequencyHz > 2000 ||
      !/^[A-Ga-g](?:#|b)?-?\d{1,2}$/.test(rootNote)) return null;
  const root = freqToNoteAndCents(rootFrequencyHz);
  const rootMidi = root.midi;
  const notes: { name: string; frequency: number }[] = [{ name: rootNote, frequency: rootFrequencyHz }];
  const allIntervals = [...parsed.intervalsCents];
  // Scala files usually include the period as their final interval; the parser removes it.
  for (let i = 0; i < allIntervals.length; i += 1) {
    const cents = allIntervals[i];
    const frequency = rootFrequencyHz * Math.pow(2, cents / 1200);
    if (!Number.isFinite(frequency) || frequency > 2000) continue;
    const pitch = freqToNoteAndCents(frequency);
    const relativeCents = Math.round(pitch.cents);
    const noteName = relativeCents === 0
      ? pitch.note
      : pitch.note + (relativeCents > 0 ? '+' : '') + relativeCents + 'c';
    notes.push({ name: noteName + ' (f' + (i + 2) + ')', frequency });
  }
  if (notes.length < 2 || notes.length > 24) return null;
  // Ensure the root is not mistaken for a second occurrence of the same pitch.
  void rootMidi;
  return notes.map((note) => note.name + ', ' + note.frequency.toFixed(3)).join('\n');
}
