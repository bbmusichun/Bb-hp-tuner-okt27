import { freqToNoteAndCents } from './scales';

export interface ScalaReferenceMetadata {
  /** One-based data-row index in the source .scl file. */
  degreeIndex: number;
  /** Octave named by the source application's !!reference extension. */
  octave: number;
  /** Optional explicit reference frequency in Hz. */
  frequencyHz?: number;
  /** Optional source note label, e.g. A or Mi. */
  label?: string;
}

export interface ParsedScalaScale {
  name: string;
  count: number;
  intervalsCents: number[];
  periodCents: number;
  /** Source labels aligned with intervalsCents; the period row is excluded. */
  degreeLabels: Array<string | null>;
  /** Label on the final period row, if the source provides one. */
  periodLabel?: string;
  /** Non-standard but commonly encountered Scala application extension. */
  reference?: ScalaReferenceMetadata;
}

interface PitchClassLabel {
  pitchClass: number;
  prefersFlats: boolean;
}

const NATURAL_PITCH_CLASSES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Convert common Scala note labels (including F^# and B^b) into a pitch class. */
function parsePitchClassLabel(label: string | null | undefined): PitchClassLabel | null {
  if (!label) return null;
  const normalized = label.trim().replace(/\^#/g, '#').replace(/\^b/g, 'b');
  const match = normalized.match(/^([A-Ga-g])([#b]?)$/);
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const pitchClass = (
    NATURAL_PITCH_CLASSES[letter] +
    (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) +
    12
  ) % 12;
  return { pitchClass, prefersFlats: accidental === 'b' };
}

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Parse a Scala .scl pitch list. Strict ascending order is the default. */
export function parseScalaScl(
  source: string,
  options: { preserveSourceOrder?: boolean } = {},
): ParsedScalaScale | null {
  if (typeof source !== 'string' || source.length > 200_000) return null;

  // Keep inline text on pitch rows: :note labels and !!reference are useful
  // application extensions. Only full-line comments are discarded.
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('!'));
  if (lines.length < 3) return null;

  const name = lines[0].slice(0, 80).trim();
  const count = Number(lines[1]);
  if (!name || !Number.isInteger(count) || count < 1 || count > 128 || lines.length < count + 2) return null;

  const intervals: number[] = [];
  const labels: Array<string | null> = [];
  let reference: ScalaReferenceMetadata | undefined;

  for (let index = 0; index < count; index += 1) {
    const line = lines[index + 2];
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
    if (!options.preserveSourceOrder && intervals.length > 0 && cents <= intervals[intervals.length - 1]) return null;

    const labelMatch = line.match(/:([A-Za-z][A-Za-z0-9^#+-]{0,23})(?=\s|$)/);
    const label = labelMatch?.[1] ?? null;
    const hasReferenceMarker = /!!reference/i.test(line);
    const referenceMatch = line.match(/!!reference\s+(\d+)(?:\s+(\d+(?:\.\d+)?))?/i);

    if (hasReferenceMarker) {
      if (!referenceMatch || reference) return null;
      const octave = Number(referenceMatch[1]);
      const rawFrequency = referenceMatch[2];
      const frequencyHz = rawFrequency === undefined ? undefined : Number(rawFrequency);
      if (!Number.isInteger(octave) || octave < 0 || octave > 10 ||
          (frequencyHz !== undefined && (!Number.isFinite(frequencyHz) || frequencyHz < 20 || frequencyHz > 2000))) {
        return null;
      }
      reference = {
        degreeIndex: index + 1,
        octave,
        ...(frequencyHz === undefined ? {} : { frequencyHz }),
        ...(label === null ? {} : { label }),
      };
    }

    intervals.push(cents);
    labels.push(label);
  }

  const periodCents = intervals[intervals.length - 1];
  if (!Number.isFinite(periodCents) || periodCents <= 0) return null;

  return {
    name,
    count,
    intervalsCents: intervals.slice(0, -1),
    periodCents,
    degreeLabels: labels.slice(0, -1),
    ...(labels[labels.length - 1] ? { periodLabel: labels[labels.length - 1]! } : {}),
    ...(reference ? { reference } : {}),
  };
}

/**
 * Convert Scala intervals to exact-frequency custom-scale rows.
 * The chosen note/frequency remains the tonic anchor. Familiar note labels in
 * the SCL file are transposed to that tonic for clearer enharmonic spelling;
 * explicit !!reference metadata is retained separately and never silently
 * overrides the user's selected target or global A4 calibration.
 */
export function scalaToCustomScaleText(
  parsed: ParsedScalaScale,
  rootNote: string,
  rootFrequencyHz: number,
): string | null {
  if (!Number.isFinite(rootFrequencyHz) || rootFrequencyHz < 20 || rootFrequencyHz > 2000 ||
      !/^[A-Ga-g](?:#|b)?-?\d{1,2}$/.test(rootNote)) return null;

  const root = freqToNoteAndCents(rootFrequencyHz);
  const tonicLabel = parsePitchClassLabel(parsed.periodLabel);
  const rootPitchClass = ((root.midi % 12) + 12) % 12;
  const labelShift = tonicLabel ? (rootPitchClass - tonicLabel.pitchClass + 12) % 12 : null;
  const notes: { name: string; frequency: number }[] = [{ name: rootNote, frequency: rootFrequencyHz }];

  // Scala files normally include the period as their final interval; the parser
  // removes that period from the list of added tone fields.
  for (let i = 0; i < parsed.intervalsCents.length; i += 1) {
    const cents = parsed.intervalsCents[i];
    const frequency = rootFrequencyHz * Math.pow(2, cents / 1200);
    if (!Number.isFinite(frequency) || frequency > 2000) continue;

    const semitoneOffset = Math.round(cents / 100);
    const targetMidi = root.midi + semitoneOffset;
    const targetEqualTemperamentHz = 440 * Math.pow(2, (targetMidi - 69) / 12);
    const centsFromSemitone = 1200 * Math.log2(frequency / targetEqualTemperamentHz);
    const sourceLabel = parsed.degreeLabels[i];
    const sourcePitchClass = parsePitchClassLabel(sourceLabel);

    let noteName: string;
    if (labelShift !== null && sourcePitchClass) {
      const targetPitchClass = (sourcePitchClass.pitchClass + labelShift) % 12;
      const labelNames = sourcePitchClass.prefersFlats ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES;
      const octave = Math.floor(targetMidi / 12) - 1;
      const note = labelNames[targetPitchClass] + octave;
      const roundedCents = Math.round(centsFromSemitone);
      noteName = Math.abs(roundedCents) < 1
        ? note
        : note + (roundedCents > 0 ? '+' : '') + roundedCents + 'c';
    } else {
      const pitch = freqToNoteAndCents(frequency);
      const roundedCents = Math.round(pitch.cents);
      noteName = roundedCents === 0
        ? pitch.note
        : pitch.note + (roundedCents > 0 ? '+' : '') + roundedCents + 'c';
    }

    notes.push({ name: noteName + ' (f' + (i + 2) + ')', frequency });
  }

  if (notes.length < 2 || notes.length > 24) return null;
  return notes.map((note) => note.name + ', ' + note.frequency.toFixed(3)).join('\n');
}
