export type AudioDeviceKind = 'audioinput' | 'audiooutput';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

/** Return a useful label even before the browser reveals device names after permission. */
export function formatAudioDeviceLabel(
  label: string,
  kind: AudioDeviceKind,
  index: number,
): string {
  const clean = typeof label === 'string' ? label.trim() : '';
  if (clean) return clean;
  return `${kind === 'audioinput' ? 'Mikrofon' : 'Hangkimenet'} ${index + 1}`;
}

/**
 * Only retry the default microphone when a chosen device disappeared or cannot
 * satisfy the exact device constraint. Permission and hardware errors must remain visible.
 */
export function shouldRetryDefaultAudioInput(
  errorName: string,
  preferredDeviceId?: string | null,
): boolean {
  return Boolean(preferredDeviceId) &&
    (errorName === 'OverconstrainedError' || errorName === 'NotFoundError');
}
