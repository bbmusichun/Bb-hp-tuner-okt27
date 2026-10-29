import type { ToneFieldNote, ResonanceRole } from '../types/tuner';
import type { TuningToleranceMode } from './tuningTolerance';

export type WindowSyncMode = 'off' | 'master' | 'slave';

export interface WindowSyncTargetState {
  id: string;
  noteName: string;
  sourceNoteName?: string;
  frequency: number;
  fifthFreq: number;
  octaveFreq: number;
  positionIndex: number;
}

export interface WindowSyncStateMessage {
  type: 'state';
  senderId: string;
  sequence: number;
  target: WindowSyncTargetState;
  a4Ref: number;
  transposeSemitones: number;
  selectedRole: ResonanceRole;
  toleranceOverrideCents: number | null;
  toleranceMode: TuningToleranceMode;
  strobeSensitivity: number;
}

export interface WindowSyncRequestMessage {
  type: 'request-state';
  senderId: string;
}

export type WindowSyncMessage = WindowSyncStateMessage | WindowSyncRequestMessage;

const VALID_ROLES = new Set<ResonanceRole>(['fundamental', 'fifth', 'octave']);
const VALID_TOLERANCE_MODES = new Set<TuningToleranceMode>(['auto', 'any', 'off']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFrequency(value: unknown, maximum = 20000): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= maximum;
}

export function createWindowSyncRequest(senderId: string): WindowSyncRequestMessage | null {
  const id = typeof senderId === 'string' ? senderId.trim() : '';
  return id.length > 0 && id.length <= 100 ? { type: 'request-state', senderId: id } : null;
}

/** Build the exact target state the master shares with follower windows. */
export function createWindowSyncState(
  senderId: string,
  sequence: number,
  state: {
    target: ToneFieldNote;
    a4Ref: number;
    transposeSemitones: number;
    selectedRole: ResonanceRole;
    toleranceOverrideCents: number | null;
    toleranceMode: TuningToleranceMode;
    strobeSensitivity: number;
  },
): WindowSyncStateMessage | null {
  return normalizeWindowSyncMessage({
    type: 'state',
    senderId,
    sequence,
    target: state.target,
    a4Ref: state.a4Ref,
    transposeSemitones: state.transposeSemitones,
    selectedRole: state.selectedRole,
    toleranceOverrideCents: state.toleranceOverrideCents,
    toleranceMode: state.toleranceMode,
    strobeSensitivity: state.strobeSensitivity,
  }) as WindowSyncStateMessage | null;
}

/** Validate every field received through BroadcastChannel before applying it to app state. */
export function normalizeWindowSyncMessage(value: unknown): WindowSyncMessage | null {
  if (!isRecord(value) || typeof value.senderId !== 'string' ||
      value.senderId.trim().length === 0 || value.senderId.length > 100) return null;

  if (value.type === 'request-state') {
    return { type: 'request-state', senderId: value.senderId.trim() };
  }

  if (value.type !== 'state' || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0 ||
      !isRecord(value.target)) return null;

  const target = value.target;
  if (typeof target.id !== 'string' || !target.id.trim() || target.id.length > 120 ||
      typeof target.noteName !== 'string' || !target.noteName.trim() || target.noteName.length > 80 ||
      (target.sourceNoteName !== undefined && (typeof target.sourceNoteName !== 'string' || target.sourceNoteName.length > 80)) ||
      !isFrequency(target.frequency, 2000) ||
      !isFrequency(target.fifthFreq) ||
      !isFrequency(target.octaveFreq) ||
      !Number.isInteger(target.positionIndex) || (target.positionIndex as number) < -1 || (target.positionIndex as number) > 256) return null;

  if (typeof value.a4Ref !== 'number' || !Number.isFinite(value.a4Ref) || value.a4Ref < 420 || value.a4Ref > 450 ||
      !Number.isInteger(value.transposeSemitones) || (value.transposeSemitones as number) < -12 || (value.transposeSemitones as number) > 12 ||
      typeof value.selectedRole !== 'string' || !VALID_ROLES.has(value.selectedRole as ResonanceRole) ||
      typeof value.toleranceMode !== 'string' || !VALID_TOLERANCE_MODES.has(value.toleranceMode as TuningToleranceMode) ||
      typeof value.strobeSensitivity !== 'number' || !Number.isFinite(value.strobeSensitivity) || value.strobeSensitivity < 0.25 || value.strobeSensitivity > 2.5) return null;

  const tolerance = value.toleranceOverrideCents;
  if (tolerance !== null && (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0.5 || tolerance > 20)) return null;

  return {
    type: 'state',
    senderId: value.senderId.trim(),
    sequence: value.sequence as number,
    target: {
      id: target.id,
      noteName: target.noteName,
      ...(typeof target.sourceNoteName === 'string' ? { sourceNoteName: target.sourceNoteName } : {}),
      frequency: target.frequency,
      fifthFreq: target.fifthFreq,
      octaveFreq: target.octaveFreq,
      positionIndex: target.positionIndex as number,
    },
    a4Ref: value.a4Ref,
    transposeSemitones: value.transposeSemitones as number,
    selectedRole: value.selectedRole as ResonanceRole,
    toleranceOverrideCents: tolerance as number | null,
    toleranceMode: value.toleranceMode as TuningToleranceMode,
    strobeSensitivity: value.strobeSensitivity,
  };
}
