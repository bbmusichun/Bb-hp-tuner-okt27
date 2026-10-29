/**
 * Rotate a scale mode mask while keeping note pitches and the scale itself intact.
 * The enabled/disabled pattern is shifted cyclically across the currently displayed
 * scale-degree order, matching the mode-wheel gesture without transposing the scale.
 */
export function rotateEnabledMode(
  noteIds: readonly string[],
  enabledNoteIds: readonly string[],
  steps: number,
): string[] {
  if (noteIds.length === 0 || !Number.isFinite(steps)) return [];
  const enabled = new Set(enabledNoteIds);
  const count = noteIds.length;
  const shift = ((Math.trunc(steps) % count) + count) % count;
  return noteIds.filter((_id, index) => enabled.has(noteIds[((index - shift) % count + count) % count]));
}

/** Map an angular pointer movement to a discrete note-degree rotation. */
export function modeWheelRotationSteps(
  startAngleRadians: number,
  endAngleRadians: number,
  noteCount: number,
): number {
  if (!Number.isFinite(startAngleRadians) || !Number.isFinite(endAngleRadians) ||
      !Number.isInteger(noteCount) || noteCount < 1) return 0;
  let difference = endAngleRadians - startAngleRadians;
  while (difference > Math.PI) difference -= 2 * Math.PI;
  while (difference < -Math.PI) difference += 2 * Math.PI;
  if (Math.abs(difference) < 0.12) return 0;
  const steps = Math.round(-difference * noteCount / (2 * Math.PI));
  return steps === 0 ? (difference < 0 ? 1 : -1) : steps;
}
