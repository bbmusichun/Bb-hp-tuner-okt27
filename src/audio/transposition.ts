/** Shift a positive frequency by an integer number of semitones without losing its tuning ratio. */
export function transposeFrequencyBySemitones(frequencyHz: number, semitones: number): number {
  if (
    !Number.isFinite(frequencyHz) || frequencyHz <= 0 ||
    !Number.isInteger(semitones) || semitones < -12 || semitones > 12
  ) return Number.NaN;
  return frequencyHz * Math.pow(2, semitones / 12);
}
