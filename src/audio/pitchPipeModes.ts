export type PitchPipeMode = 'continuous' | 'strike' | 'off';

export function nextPitchPipeMode(mode: PitchPipeMode): PitchPipeMode {
  return mode === 'off' ? 'continuous' : mode === 'continuous' ? 'strike' : 'off';
}

export function pitchPipeModeLabel(mode: PitchPipeMode): string {
  return mode === 'continuous' ? 'Folyamatos hang' : mode === 'strike' ? 'Ütésre rövid hang' : 'Kikapcsolva';
}

/** Sanitize localStorage configuration so stale/edited browser values cannot start voices. */
export function normalizePitchPipeModes(value: unknown): Record<string, PitchPipeMode> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, PitchPipeMode] =>
        entry[0].length > 0 && entry[0].length <= 80 &&
        (entry[1] === 'continuous' || entry[1] === 'strike' || entry[1] === 'off')),
  );
}

/** Distinct deterministic voice ids let every strobe band be started/stopped independently. */
export function pitchPipeVoiceId(id: string): string {
  return 'strobe:' + id;
}

/** Resolve every configured strike cue for one detected attack; bad targets are ignored. */
export function getStrikePitchPipeTargets(
  modes: Record<string, PitchPipeMode>,
  resolveTargetHz: (id: string) => number | null,
): Array<{ id: string; frequencyHz: number }> {
  const targets: Array<{ id: string; frequencyHz: number }> = [];
  for (const [id, mode] of Object.entries(modes)) {
    if (mode !== 'strike') continue;
    const frequencyHz = resolveTargetHz(id);
    if (!Number.isFinite(frequencyHz) || frequencyHz === null || frequencyHz <= 0 || frequencyHz > 20000) continue;
    targets.push({ id, frequencyHz });
  }
  return targets;
}
