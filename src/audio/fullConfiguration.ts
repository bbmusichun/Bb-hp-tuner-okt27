import type { TuningLogEntry } from '../types/tuner';
import { parseInstrumentProfileBackup, type InstrumentProfile } from './instrumentProfiles';
import { normalizeDisabledToneNotes } from './scaleNoteSelection';
import { normalizeStrobeBands, type StrobeBandConfig } from './strobeBands';
import type { AutoDetectionMode } from './detectionModes';
import type { TuningReadoutMode } from './readoutModes';
import type { ReferenceToneMode } from './referenceToneModes';
import { isValidTuningToleranceSetting, type TuningToleranceSetting } from './tuningTolerance';
import { isValidStrobeSensitivity, normalizeStrobeSensitivity } from './strobeSensitivity';

export interface HangoalFullConfiguration {
  schemaVersion: 2;
  exportedAt: string;
  settings: {
    autoDetect: boolean;
    autoDetectionMode: AutoDetectionMode;
    toleranceOverrideCents: TuningToleranceSetting;
    transposeSemitones: number;
    strobeSensitivity: number;
    readoutMode: TuningReadoutMode;
    referenceToneMode: ReferenceToneMode;
    activeInstrumentProfileId: string;
    instrumentProfiles: InstrumentProfile[];
  };
  disabledToneNotesByScale: Record<string, string[]>;
  customStrobeBands: StrobeBandConfig[];
  measurements: TuningLogEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidLogEntry(value: unknown): value is TuningLogEntry {
  if (!isRecord(value)) return false;
  const entry = value as Partial<TuningLogEntry>;
  return typeof entry.id === 'string' && entry.id.length > 0 &&
    typeof entry.noteName === 'string' &&
    typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp) && Number.isFinite(new Date(entry.timestamp).getTime()) &&
    typeof entry.fundamentalHz === 'number' && Number.isFinite(entry.fundamentalHz) && entry.fundamentalHz > 0 &&
    typeof entry.fundamentalCents === 'number' && Number.isFinite(entry.fundamentalCents) &&
    typeof entry.fifthHz === 'number' && Number.isFinite(entry.fifthHz) && entry.fifthHz > 0 &&
    typeof entry.fifthCents === 'number' && Number.isFinite(entry.fifthCents) &&
    typeof entry.octaveHz === 'number' && Number.isFinite(entry.octaveHz) && entry.octaveHz > 0 &&
    typeof entry.octaveCents === 'number' && Number.isFinite(entry.octaveCents) &&
    typeof entry.overallInTune === 'boolean' &&
    (entry.fundamentalTargetHz === undefined || (typeof entry.fundamentalTargetHz === 'number' && Number.isFinite(entry.fundamentalTargetHz) && entry.fundamentalTargetHz > 0)) &&
    (entry.fifthTargetHz === undefined || (typeof entry.fifthTargetHz === 'number' && Number.isFinite(entry.fifthTargetHz) && entry.fifthTargetHz > 0)) &&
    (entry.octaveTargetHz === undefined || (typeof entry.octaveTargetHz === 'number' && Number.isFinite(entry.octaveTargetHz) && entry.octaveTargetHz > 0)) &&
    (entry.audioSampleRateHz === undefined || (typeof entry.audioSampleRateHz === 'number' && Number.isFinite(entry.audioSampleRateHz) && entry.audioSampleRateHz > 0)) &&
    (entry.inputLevelDbfs === undefined || (typeof entry.inputLevelDbfs === 'number' && Number.isFinite(entry.inputLevelDbfs) && entry.inputLevelDbfs >= -160 && entry.inputLevelDbfs <= 0)) &&
    (entry.toleranceOverrideCents === undefined || isValidTuningToleranceSetting(entry.toleranceOverrideCents)) &&
    (entry.instrumentProfileId === undefined || typeof entry.instrumentProfileId === 'string') &&
    (entry.instrumentProfileName === undefined || typeof entry.instrumentProfileName === 'string');
}

/** Validate the whole bundle before applying any of it, so malformed backups cannot half-change the app. */
export function parseHangoalFullConfiguration(
  value: unknown,
  knownScaleIds: readonly string[],
  fallbackProfile: InstrumentProfile,
): HangoalFullConfiguration | null {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.settings)) return null;
  const settings = value.settings;
  if (!Array.isArray(settings.instrumentProfiles) || settings.instrumentProfiles.length < 1 || settings.instrumentProfiles.length > 100) return null;
  const profiles = parseInstrumentProfileBackup(
    { schemaVersion: 1, profiles: settings.instrumentProfiles },
    knownScaleIds,
    fallbackProfile,
  );
  if (!profiles || typeof settings.activeInstrumentProfileId !== 'string') return null;
  if (!profiles.some((profile) => profile.id === settings.activeInstrumentProfileId)) return null;

  if (typeof settings.autoDetect !== 'boolean') return null;
  if (settings.autoDetectionMode !== 'continuous' && settings.autoDetectionMode !== 'single-shot' && settings.autoDetectionMode !== 'off') return null;
  if (settings.autoDetect !== (settings.autoDetectionMode !== 'off')) return null;
  if (settings.readoutMode !== 'hz' && settings.readoutMode !== 'cents' && settings.readoutMode !== 'note' && settings.readoutMode !== 'ratio') return null;
  if (settings.referenceToneMode !== 'continuous' && settings.referenceToneMode !== 'strike' && settings.referenceToneMode !== 'off') return null;
  if (!isValidTuningToleranceSetting(settings.toleranceOverrideCents)) return null;
  if (typeof settings.transposeSemitones !== 'number' || !Number.isInteger(settings.transposeSemitones) ||
    settings.transposeSemitones < -12 || settings.transposeSemitones > 12) return null;
  if (settings.strobeSensitivity !== undefined && !isValidStrobeSensitivity(settings.strobeSensitivity)) return null;
  // Older schema-v2 backups predate this control; the normalizer supplies the 1.0× default.
  const strobeSensitivity = normalizeStrobeSensitivity(settings.strobeSensitivity);

  if (!isRecord(value.disabledToneNotesByScale)) return null;
  const disabledToneNotesByScale = normalizeDisabledToneNotes(value.disabledToneNotesByScale);
  if (!Array.isArray(value.customStrobeBands) || value.customStrobeBands.length > 8) return null;
  const customStrobeBands = normalizeStrobeBands(value.customStrobeBands);
  if (customStrobeBands.length !== value.customStrobeBands.length ||
    customStrobeBands.some((band) => band.source !== 'custom')) return null;
  if (!Array.isArray(value.measurements) || value.measurements.length > 5000 ||
    !value.measurements.every(isValidLogEntry)) return null;
  const ids = value.measurements.map((item) => (item as TuningLogEntry).id);
  if (new Set(ids).size !== ids.length) return null;

  const exportedAt = typeof value.exportedAt === 'string' && Number.isFinite(new Date(value.exportedAt).getTime())
    ? value.exportedAt
    : null;
  if (!exportedAt) return null;

  return {
    schemaVersion: 2,
    exportedAt,
    settings: {
      autoDetect: settings.autoDetect,
      autoDetectionMode: settings.autoDetectionMode,
      toleranceOverrideCents: settings.toleranceOverrideCents,
      transposeSemitones: settings.transposeSemitones,
      strobeSensitivity,
      readoutMode: settings.readoutMode,
      referenceToneMode: settings.referenceToneMode,
      activeInstrumentProfileId: settings.activeInstrumentProfileId,
      instrumentProfiles: profiles,
    },
    disabledToneNotesByScale,
    customStrobeBands,
    measurements: value.measurements as TuningLogEntry[],
  };
}
