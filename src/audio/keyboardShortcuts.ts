export type HangoalKeyboardAction =
  | 'previous-note'
  | 'next-note'
  | 'previous-resonance'
  | 'next-resonance'
  | 'toggle-microphone'
  | 'cycle-detection'
  | 'toggle-reference-tone'
  | 'show-shortcuts';

export function isEditableKeyboardTarget(tagName: string | null | undefined, isContentEditable = false): boolean {
  if (isContentEditable) return true;
  const tag = (tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
    tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY';
}

export function resolveHangoalKeyboardAction(key: string, code = ''): HangoalKeyboardAction | null {
  if (key === 'ArrowLeft') return 'previous-note';
  if (key === 'ArrowRight') return 'next-note';
  if (key === 'ArrowUp') return 'previous-resonance';
  if (key === 'ArrowDown') return 'next-resonance';
  if (code === 'Space' || key === ' ') return 'toggle-microphone';
  const normalized = key.toLowerCase();
  if (normalized === 'd') return 'cycle-detection';
  if (normalized === 'r') return 'toggle-reference-tone';
  if (key === '?') return 'show-shortcuts';
  return null;
}
