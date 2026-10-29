import type { ToneFieldNote } from '../types/tuner';
import { DEFAULT_PARTIAL_TARGET_OFFSET, partialTargetFrequency, partialTargetOffsetKey, type PartialTargetOffsetMap } from './partialTargets';
import { freqToNoteAndCents, midiToFreq } from './scales';

export const CHROMATIC_MIN_MIDI = 24; // C1
export const CHROMATIC_MAX_MIDI = 95; // B6

/** Build a selectable chromatic target while keeping the instrument's configured partial offsets. */
export function buildChromaticTargetNote(
  midi: number,
  a4Ref: number,
  scaleId: string,
  partialTargetOffsets: PartialTargetOffsetMap,
): ToneFieldNote | null {
  if (!Number.isInteger(midi) || midi < CHROMATIC_MIN_MIDI || midi > CHROMATIC_MAX_MIDI) return null;
  const frequency = midiToFreq(midi, a4Ref);
  if (!Number.isFinite(frequency) || frequency <= 0) return null;

  const note = freqToNoteAndCents(frequency, a4Ref);
  const key = partialTargetOffsetKey(scaleId, note.note);
  const offsets = partialTargetOffsets[key] ?? DEFAULT_PARTIAL_TARGET_OFFSET;
  return {
    id: 'chromatic-' + midi,
    noteName: note.note,
    frequency,
    fifthFreq: partialTargetFrequency(frequency, 3, offsets.thirdPartialCents),
    octaveFreq: partialTargetFrequency(frequency, 2, offsets.octaveCents),
    positionIndex: -1,
  };
}

export function midiFromFrequency(frequency: number, a4Ref: number): number {
  return freqToNoteAndCents(frequency, a4Ref).midi;
}
