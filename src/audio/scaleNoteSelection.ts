/** Validate locally persisted note-enable state; unknown ids are filtered when applied to a scale. */
export function normalizeDisabledToneNotes(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: Record<string, string[]> = {};
  for (const [scaleId, candidates] of Object.entries(value)) {
    if (!scaleId.trim() || scaleId.length > 120 || !Array.isArray(candidates)) continue;
    const unique = [...new Set(candidates.filter((item): item is string =>
      typeof item === 'string' && item.length > 0 && item.length <= 120
    ))].slice(0, 128);
    if (unique.length) normalized[scaleId] = unique;
  }
  return normalized;
}

/** Keep at least one target selectable even if old or corrupt settings disable every current note. */
export function getEnabledToneNotes<T extends { id: string }>(
  notes: T[],
  disabledIds: readonly string[],
): T[] {
  const disabled = new Set(disabledIds);
  const enabled = notes.filter((note) => !disabled.has(note.id));
  return enabled.length > 0 || notes.length === 0 ? enabled : [notes[0]];
}

/** True when a note can be disabled without removing the scale's final enabled target. */
export function canDisableToneNote(notes: readonly { id: string }[], disabledIds: readonly string[], noteId: string): boolean {
  if (disabledIds.includes(noteId)) return true;
  return getEnabledToneNotes(notes, disabledIds).length > 1;
}
