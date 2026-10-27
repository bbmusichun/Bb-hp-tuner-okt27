import { HandpanScale } from '../types/tuner';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note to frequency with custom A4
 */
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert frequency to closest MIDI note and cent offset
 */
export function freqToNoteAndCents(freq: number, a4 = 440): { note: string; midi: number; cents: number; exactFreq: number } {
  if (freq <= 0) return { note: '--', midi: 0, cents: 0, exactFreq: 0 };
  const fractionalMidi = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(fractionalMidi);
  const cents = (fractionalMidi - midi) * 100;
  const exactFreq = midiToFreq(midi, a4);

  const noteName = NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  return { note: noteName, midi, cents, exactFreq };
}

/**
 * Calculate cents difference between detected frequency and target frequency
 */
export function calculateCents(measured: number, target: number): number {
  if (measured <= 0 || target <= 0) return 0;
  return 1200 * Math.log2(measured / target);
}

export const PRESET_SCALES: HandpanScale[] = [
  {
    id: 'd-kurd-9',
    name: 'D Kurd 9 (Classic)',
    root: 'D3',
    noteCount: 9,
    notes: [
      { name: 'D3', midi: 50 }, // Ding
      { name: 'A3', midi: 57 },
      { name: 'Bb3', midi: 58 },
      { name: 'C4', midi: 60 },
      { name: 'D4', midi: 62 },
      { name: 'E4', midi: 64 },
      { name: 'F4', midi: 65 },
      { name: 'G4', midi: 67 },
      { name: 'A4', midi: 69 },
    ],
  },
  {
    id: 'd-celtic-minor',
    name: 'D Celtic Minor 9 (Amara)',
    root: 'D3',
    noteCount: 9,
    notes: [
      { name: 'D3', midi: 50 }, // Ding
      { name: 'A3', midi: 57 },
      { name: 'C4', midi: 60 },
      { name: 'D4', midi: 62 },
      { name: 'E4', midi: 64 },
      { name: 'F4', midi: 65 },
      { name: 'G4', midi: 67 },
      { name: 'A4', midi: 69 },
      { name: 'C5', midi: 72 },
    ],
  },
  {
    id: 'd-integral-8',
    name: 'D Integral 8',
    root: 'D3',
    noteCount: 8,
    notes: [
      { name: 'D3', midi: 50 }, // Ding
      { name: 'A3', midi: 57 },
      { name: 'Bb3', midi: 58 },
      { name: 'C4', midi: 60 },
      { name: 'D4', midi: 62 },
      { name: 'E4', midi: 64 },
      { name: 'F4', midi: 65 },
      { name: 'A4', midi: 69 },
    ],
  },
  {
    id: 'e-pygmy-9',
    name: 'E Pygmy 9',
    root: 'E3',
    noteCount: 9,
    notes: [
      { name: 'E3', midi: 52 }, // Ding
      { name: 'B3', midi: 59 },
      { name: 'C4', midi: 60 },
      { name: 'E4', midi: 64 },
      { name: 'G4', midi: 67 },
      { name: 'A4', midi: 69 },
      { name: 'B4', midi: 71 },
      { name: 'D5', midi: 74 },
      { name: 'E5', midi: 76 },
    ],
  },
  {
    id: 'fs-hijaz-9',
    name: 'F# Hijaz 9 (Middle Eastern)',
    root: 'F#3',
    noteCount: 9,
    notes: [
      { name: 'F#3', midi: 54 }, // Ding
      { name: 'C#4', midi: 61 },
      { name: 'D4', midi: 62 },
      { name: 'F#4', midi: 66 },
      { name: 'G#4', midi: 68 },
      { name: 'A4', midi: 69 },
      { name: 'C#5', midi: 73 },
      { name: 'D5', midi: 74 },
      { name: 'F#5', midi: 78 },
    ],
  },
  {
    id: 'b-celtic-minor',
    name: 'B Celtic Minor 9',
    root: 'B2',
    noteCount: 9,
    notes: [
      { name: 'B2', midi: 47 }, // Ding
      { name: 'F#3', midi: 54 },
      { name: 'A3', midi: 57 },
      { name: 'B3', midi: 59 },
      { name: 'C#4', midi: 61 },
      { name: 'D4', midi: 62 },
      { name: 'E4', midi: 64 },
      { name: 'F#4', midi: 66 },
      { name: 'A4', midi: 69 },
    ],
  },
  {
    id: 'c-sharp-amara-9',
    name: 'C# Amara 9 (Annaziska)',
    root: 'C#3',
    noteCount: 9,
    notes: [
      { name: 'C#3', midi: 49 }, // Ding
      { name: 'G#3', midi: 56 },
      { name: 'B3', midi: 59 },
      { name: 'C#4', midi: 61 },
      { name: 'D#4', midi: 63 },
      { name: 'E4', midi: 64 },
      { name: 'F#4', midi: 66 },
      { name: 'G#4', midi: 68 },
      { name: 'B4', midi: 71 },
    ],
  },
];
