/**
 * Hangoal – Handpan hangoló és felhangelemző
 * Pixel-perfect implementation of the functional specification and visual design.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Menu,
  Settings,
  Mic,
  MicOff,
  BarChart2,
  Activity,
  Layers,
  BookOpen,
  ChevronDown,
  Volume2,
} from 'lucide-react';
import { bbAudioEngine } from './audio/audioEngine';
import { PRESET_SCALES, midiToFreq, freqToNoteAndCents } from './audio/scales';
import { isWithinTuningTolerance, normalizeTuningToleranceMode, type TuningToleranceMode } from './audio/tuningTolerance';
import { buildChromaticTargetNote, midiFromFrequency } from './audio/chromaticPitch';
import { transposeFrequencyBySemitones } from './audio/transposition';
import { normalizeTuningReadoutMode, type TuningReadoutMode } from './audio/readoutModes';
import { isDetectionArmed, nextAutoDetectionMode, normalizeAutoDetectionMode, type AutoDetectionMode } from './audio/detectionModes';
import { isEditableKeyboardTarget, resolveHangoalKeyboardAction } from './audio/keyboardShortcuts';
import { parseHangoalFullConfiguration } from './audio/fullConfiguration';
import { recordAnalysisFrame } from './audio/analysisRate';
import { getStrobeBandTargetHz, normalizeStrobeBands, type StrobeBandConfig } from './audio/strobeBands';
import { normalizeStrobeSensitivity } from './audio/strobeSensitivity';
import { normalizePitchPipeModes } from './audio/pitchPipeModes';
import { createWindowSyncRequest, createWindowSyncState, normalizeWindowSyncMessage, type WindowSyncMode } from './audio/windowSync';
import { normalizeReferenceToneMode, shouldTriggerStrikeReferenceTone, type ReferenceToneMode } from './audio/referenceToneModes';
import { getEnabledToneNotes, normalizeDisabledToneNotes } from './audio/scaleNoteSelection';
import {
  DEFAULT_PARTIAL_TARGET_OFFSET,
  calibratePartialTargetOffset,
  normalizePartialTargetOffsets,
  partialTargetFrequency,
  partialTargetOffsetKey,
  type PartialTargetOffset,
  type PartialTargetOffsetField,
  type PartialTargetOffsetMap,
} from './audio/partialTargets';
import { BBNavTab, HandpanScale, ResonanceMeasurement, ToneFieldNote, TuningLogEntry } from './types/tuner';
import { BBStrobeBands } from './components/BBStrobeBands';
import { BBSpectrum } from './components/BBSpectrum';
import { BBSpectrumDiagnostics } from './components/BBSpectrumDiagnostics';
import { BBPitchDial } from './components/BBPitchDial';
import { BBCards } from './components/BBCards';
import { BBStabilityGraph } from './components/BBStabilityGraph';
import { BBHangmezoView } from './components/BBHangmezoView';
import { BBScaleNoteEnablePanel } from './components/BBScaleNoteEnablePanel';
import { BBMeresekView } from './components/BBMeresekView';
import { BBSettingsModal } from './components/BBSettingsModal';
import { OwnDRecordingAnalysis } from './components/OwnDRecordingAnalysis';
import { BBSpectrumWaterfall } from './components/BBSpectrumWaterfall';
import {
  normalizeInstrumentProfiles,
  resolveActiveInstrumentProfileId,
  parseCustomScale,
  parseInstrumentProfileBackup,
  type InstrumentProfile,
} from './audio/instrumentProfiles';

function loadTuningPreferences(): {
  a4Ref: number;
  scaleId: string;
  autoDetect: boolean;
  autoDetectionMode: AutoDetectionMode;
  partialTargetOffsets: PartialTargetOffsetMap;
  instrumentProfiles: InstrumentProfile[];
  activeInstrumentProfileId: string;
  toleranceOverrideCents: number | null;
  transposeSemitones: number;
  strobeSensitivity: number;
  readoutMode: TuningReadoutMode;
  referenceToneMode: ReferenceToneMode;
  scale: HandpanScale;
} {
  const defaultProfile: InstrumentProfile = {
    id: 'instrument-default',
    name: 'Saját handpan',
    a4Ref: 440,
    scaleId: PRESET_SCALES[0].id,
    partialTargetOffsets: {},
  };
  const defaults = {
    a4Ref: defaultProfile.a4Ref,
    scaleId: defaultProfile.scaleId,
    autoDetect: true,
    autoDetectionMode: 'continuous' as AutoDetectionMode,
    partialTargetOffsets: defaultProfile.partialTargetOffsets,
    instrumentProfiles: [defaultProfile],
    activeInstrumentProfileId: defaultProfile.id,
    toleranceOverrideCents: null,
    transposeSemitones: 0,
    strobeSensitivity: 1,
    readoutMode: 'hz' as TuningReadoutMode,
    referenceToneMode: 'continuous' as ReferenceToneMode,
    scale: PRESET_SCALES[0],
  };
  try {
    const raw = localStorage.getItem('bb-tuner-preferences-v1');
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    const prefs = parsed as {
      a4Ref?: unknown;
      scaleId?: unknown;
      autoDetect?: unknown;
      autoDetectionMode?: unknown;
      partialTargetOffsets?: unknown;
      instrumentProfiles?: unknown;
      activeInstrumentProfileId?: unknown;
      toleranceOverrideCents?: unknown;
      transposeSemitones?: unknown;
      strobeSensitivity?: unknown;
      readoutMode?: unknown;
      referenceToneMode?: unknown;
    };
    const legacyA4 = typeof prefs.a4Ref === 'number' && Number.isFinite(prefs.a4Ref) && prefs.a4Ref >= 420 && prefs.a4Ref <= 450
      ? prefs.a4Ref : defaultProfile.a4Ref;
    const legacyScaleId = typeof prefs.scaleId === 'string' && PRESET_SCALES.some((scale) => scale.id === prefs.scaleId)
      ? prefs.scaleId : defaultProfile.scaleId;
    const fallbackProfile: InstrumentProfile = {
      id: defaultProfile.id,
      name: defaultProfile.name,
      a4Ref: legacyA4,
      scaleId: legacyScaleId,
      partialTargetOffsets: normalizePartialTargetOffsets(prefs.partialTargetOffsets),
    };
    const profiles = normalizeInstrumentProfiles(
      prefs.instrumentProfiles,
      PRESET_SCALES.map((scale) => scale.id),
      fallbackProfile,
    );
    const activeInstrumentProfileId = resolveActiveInstrumentProfileId(prefs.activeInstrumentProfileId, profiles);
    const activeProfile = profiles.find((profile) => profile.id === activeInstrumentProfileId) ?? profiles[0];
    return {
      a4Ref: activeProfile.a4Ref,
      scaleId: activeProfile.scaleId,
      autoDetect: typeof prefs.autoDetect === 'boolean' ? prefs.autoDetect : defaults.autoDetect,
      autoDetectionMode: normalizeAutoDetectionMode(prefs.autoDetectionMode, prefs.autoDetect),
      partialTargetOffsets: activeProfile.partialTargetOffsets,
      instrumentProfiles: profiles,
      activeInstrumentProfileId,
      toleranceOverrideCents: typeof prefs.toleranceOverrideCents === 'number' &&
        Number.isFinite(prefs.toleranceOverrideCents) && prefs.toleranceOverrideCents >= 0.5 && prefs.toleranceOverrideCents <= 20
        ? prefs.toleranceOverrideCents : null,
      transposeSemitones: typeof prefs.transposeSemitones === 'number' && Number.isInteger(prefs.transposeSemitones) && prefs.transposeSemitones >= -12 && prefs.transposeSemitones <= 12
        ? prefs.transposeSemitones : 0,
      strobeSensitivity: normalizeStrobeSensitivity(prefs.strobeSensitivity),
      readoutMode: normalizeTuningReadoutMode(prefs.readoutMode),
      referenceToneMode: normalizeReferenceToneMode(prefs.referenceToneMode),
      scale: activeProfile.customScale ?? PRESET_SCALES.find((scale) => scale.id === activeProfile.scaleId) ?? PRESET_SCALES[0],
    };
  } catch {
    return defaults;
  }
}
function loadOwnDVolumePreference(): number {
  try {
    const stored = localStorage.getItem('hangoal-own-d-volume-v1');
    if (stored === null) return 0.8;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
  } catch {
    return 0.8;
  }
}

function loadTuningToleranceMode(): TuningToleranceMode {
  try { return normalizeTuningToleranceMode(localStorage.getItem('hangoal-tolerance-mode-v1')); }
  catch { return 'auto'; }
}

function loadFreezeTargetsPreference(): boolean {
  try { return localStorage.getItem('hangoal-freeze-targets-v1') === 'true'; }
  catch { return false; }
}

function loadWindowSyncMode(): WindowSyncMode {
  try {
    const value = sessionStorage.getItem('hangoal-window-sync-mode-v1');
    return value === 'master' || value === 'slave' ? value : 'off';
  } catch { return 'off'; }
}

function createWindowSyncPeerId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* Fall through to a non-cryptographic tab identifier. */ }
  return 'hangoal-tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function loadCustomStrobeBandsForSpectrum(): StrobeBandConfig[] {
  try {
    const raw = localStorage.getItem('hangoal-custom-strobe-bands-v1');
    if (!raw) return [];
    return normalizeStrobeBands(JSON.parse(raw)).filter((band) => band.source === 'custom');
  } catch { return []; }
}

type AudioDeviceChoice = { deviceId: string; label: string };

function loadAudioDevicePreference(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

const TUNING_VIEW_PANELS = [
  { id: 'samplePlayback', label: 'Saját handpan-felvétel', description: '3 másodperces minta, loop és hangerő' },
  { id: 'recordingAnalysis', label: 'Felvétel-elemzés és kalibrálás', description: 'Hangfelismerés, felhangarány és kalibrálás' },
  { id: 'pitchReadout', label: 'Hangmagasság és eltérés', description: 'Hangnév, Hz és centeltérés' },
  { id: 'referenceTone', label: 'Referencia-szinusz', description: 'Célfrekvencia, lejátszás és ütésjelzés módja' },
  { id: 'pitchDial', label: 'Kromatikus pitch tárcsa', description: 'Közvetlen célhang-kiválasztás' },
  { id: 'transposition', label: 'Transzponálás', description: 'Skála eltolása félhangonként' },
  { id: 'stroboscope', label: 'Stroboszkóp · 1× / 2× / 3×', description: 'Alaphang, oktáv és 3. parciális' },
  { id: 'spectrum', label: 'Spektrum', description: 'Mért frekvencia-összetevők vizsgálata' },
  { id: 'diagnostics', label: 'Mérési diagnosztika', description: 'Jelszint, tranziensvédelem és mérési állapot' },
  { id: 'measurementCards', label: 'Mérési kártyák', description: 'Hz, cent, hangnév vagy frekvenciaarány' },
  { id: 'stabilityGraph', label: 'Stabilitásgrafikon', description: 'Hangmagasság-ingadozás' },
  { id: 'keyboardShortcuts', label: 'Billentyűzetes súgó', description: 'Gyorsbillentyűk és vezérlés' },
] as const;
type TuningViewPanelId = (typeof TUNING_VIEW_PANELS)[number]['id'];
const DEFAULT_TUNING_VIEW_PANELS: TuningViewPanelId[] = ['pitchReadout', 'referenceTone', 'stroboscope', 'measurementCards'];

function loadTuningViewPreferences(): { enabled: boolean; panels: TuningViewPanelId[] } {
  const defaults = { enabled: true, panels: [...DEFAULT_TUNING_VIEW_PANELS] };
  try {
    const raw = localStorage.getItem('hangoal-custom-tuning-view-v1');
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    const value = parsed as { enabled?: unknown; panels?: unknown };
    const panels = Array.isArray(value.panels)
      ? value.panels.filter((panel): panel is TuningViewPanelId =>
          typeof panel === 'string' && TUNING_VIEW_PANELS.some((item) => item.id === panel))
      : [...DEFAULT_TUNING_VIEW_PANELS];
    return { enabled: typeof value.enabled === 'boolean' ? value.enabled : true, panels };
  } catch { return defaults; }
}

function loadDisabledToneNotesByScale(): Record<string, string[]> {
  try {
    return normalizeDisabledToneNotes(JSON.parse(localStorage.getItem('hangoal-disabled-tone-notes-v1') ?? '{}'));
  } catch {
    return {};
  }
}

function isValidTuningLogEntry(value: unknown): value is TuningLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<TuningLogEntry>;
  return typeof entry.id === 'string' &&
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
    (entry.toleranceOverrideCents === undefined || entry.toleranceOverrideCents === null ||
      (typeof entry.toleranceOverrideCents === 'number' && Number.isFinite(entry.toleranceOverrideCents) && entry.toleranceOverrideCents >= 0.5 && entry.toleranceOverrideCents <= 20)) &&
    (entry.instrumentProfileId === undefined || typeof entry.instrumentProfileId === 'string') &&
    (entry.instrumentProfileName === undefined || typeof entry.instrumentProfileName === 'string');
}

export default function App() {
  const [activeTab, setActiveTab] = useState<BBNavTab>('hangolas');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState(false);
  const [customStrobeBands, setCustomStrobeBands] = useState<StrobeBandConfig[]>(loadCustomStrobeBandsForSpectrum);
  useEffect(() => {
    const refreshBands = () => setCustomStrobeBands(loadCustomStrobeBandsForSpectrum());
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'hangoal-custom-strobe-bands-v1') refreshBands();
    };
    window.addEventListener('hangoal-custom-strobe-bands-changed', refreshBands);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('hangoal-custom-strobe-bands-changed', refreshBands);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const [audioInputDevices, setAudioInputDevices] = useState<AudioDeviceChoice[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioDeviceChoice[]>([]);
  const [selectedAudioInputDeviceId, setSelectedAudioInputDeviceId] = useState(() => loadAudioDevicePreference('hangoal-audio-input-device-v1'));
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState(() => loadAudioDevicePreference('hangoal-audio-output-device-v1'));
  const [audioIoMessage, setAudioIoMessage] = useState('');
  const [isRefreshingAudioDevices, setIsRefreshingAudioDevices] = useState(false);
  const [audioOutputSelectionSupported, setAudioOutputSelectionSupported] = useState(false);

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      setAudioIoMessage('Ez a böngésző nem biztosít hangbemenet-listázást.');
      return;
    }
    setIsRefreshingAudioDevices(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputDevices(devices.filter((device) => device.kind === 'audioinput').map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || 'Mikrofon ' + (index + 1),
      })));
      setAudioOutputDevices(devices.filter((device) => device.kind === 'audiooutput').map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || 'Hangkimenet ' + (index + 1),
      })));
      setAudioOutputSelectionSupported(bbAudioEngine.supportsOutputDeviceSelection());
      setAudioIoMessage(devices.some((device) => device.kind.startsWith('audio') && !device.label)
        ? 'Az eszközneveket a böngésző a mikrofonengedély megadása után mutathatja meg.'
        : 'A hangbemenetek és -kimenetek listája frissült.');
    } catch (error) {
      setAudioIoMessage(error instanceof Error ? error.message : 'Nem sikerült felsorolni a hang-eszközöket.');
    } finally {
      setIsRefreshingAudioDevices(false);
    }
  }, []);
  useEffect(() => {
    void refreshAudioDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.addEventListener !== 'function') return;
    const onDeviceChange = () => { void refreshAudioDevices(); };
    mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, [refreshAudioDevices]);
  useEffect(() => {
    bbAudioEngine.setPreferredOutputDeviceId(selectedAudioOutputDeviceId || null);
    try {
      localStorage.setItem('hangoal-audio-input-device-v1', selectedAudioInputDeviceId);
      localStorage.setItem('hangoal-audio-output-device-v1', selectedAudioOutputDeviceId);
    } catch { /* Device choices remain active for this session. */ }
  }, [selectedAudioInputDeviceId, selectedAudioOutputDeviceId]);
  const [customTuningView, setCustomTuningView] = useState(loadTuningViewPreferences);
  const [isTuningPanelPickerOpen, setIsTuningPanelPickerOpen] = useState(false);
  const shouldShowTuningPanel = (panel: TuningViewPanelId) => !customTuningView.enabled || customTuningView.panels.includes(panel);
  const [autoDetectionMode, setAutoDetectionMode] = useState<AutoDetectionMode>(() => loadTuningPreferences().autoDetectionMode);
  const [singleShotCaptured, setSingleShotCaptured] = useState(false);
  const autoDetect = autoDetectionMode !== 'off';
  const [toleranceOverrideCents, setToleranceOverrideCents] = useState<number | null>(
    () => loadTuningPreferences().toleranceOverrideCents,
  );
  const [toleranceMode, setToleranceMode] = useState<TuningToleranceMode>(loadTuningToleranceMode);
  const [freezeTargets, setFreezeTargets] = useState<boolean>(loadFreezeTargetsPreference);
  useEffect(() => {
    try { localStorage.setItem('hangoal-freeze-targets-v1', String(freezeTargets)); }
    catch { /* Target locks remain available for this session. */ }
  }, [freezeTargets]);
  const [windowSyncMode, setWindowSyncMode] = useState<WindowSyncMode>(loadWindowSyncMode);
  const [windowSyncStatus, setWindowSyncStatus] = useState<'idle' | 'master' | 'waiting' | 'connected' | 'unsupported' | 'error'>('idle');
  useEffect(() => {
    try { sessionStorage.setItem('hangoal-window-sync-mode-v1', windowSyncMode); }
    catch { /* Sync mode remains available for the current tab. */ }
  }, [windowSyncMode]);
  useEffect(() => {
    try { localStorage.setItem('hangoal-tolerance-mode-v1', toleranceMode); }
    catch { /* The current session remains usable if storage is disabled. */ }
  }, [toleranceMode]);
  const autoDetectionRef = useRef<{ id: string; count: number } | null>(null);
  const [transposeSemitones, setTransposeSemitones] = useState<number>(() => loadTuningPreferences().transposeSemitones);
  const [strobeSensitivity, setStrobeSensitivity] = useState<number>(() => loadTuningPreferences().strobeSensitivity);
  const [readoutMode, setReadoutMode] = useState<TuningReadoutMode>(() => loadTuningPreferences().readoutMode);
  const [referenceToneMode, setReferenceToneMode] = useState<ReferenceToneMode>(() => loadTuningPreferences().referenceToneMode);

  // Calibration and Scale
  const [a4Ref, setA4Ref] = useState<number>(() => loadTuningPreferences().a4Ref);
  const [partialTargetOffsets, setPartialTargetOffsets] = useState<PartialTargetOffsetMap>(
    () => loadTuningPreferences().partialTargetOffsets,
  );
  const [currentScale, setCurrentScale] = useState<HandpanScale>(() => loadTuningPreferences().scale); // D Kurd 9 by default
  const [instrumentProfiles, setInstrumentProfiles] = useState<InstrumentProfile[]>(
    () => loadTuningPreferences().instrumentProfiles,
  );
  const [activeInstrumentProfileId, setActiveInstrumentProfileId] = useState(
    () => loadTuningPreferences().activeInstrumentProfileId,
  );
  const activeInstrumentProfile = instrumentProfiles.find((profile) => profile.id === activeInstrumentProfileId)
    ?? instrumentProfiles[0];

  // Selected resonance focus for the main display and stability graph
  const [selectedRole, setSelectedRole] = useState<'fundamental' | 'fifth' | 'octave'>('fundamental');
  const handleSelectResonanceRole = (role: 'fundamental' | 'fifth' | 'octave') => {
    if (windowSyncMode === 'slave') return;
    setSelectedRole(role);
  };
  const [spectrumZoomTargetHz, setSpectrumZoomTargetHz] = useState<number | null>(null);
  const [isReferenceTonePlaying, setIsReferenceTonePlaying] = useState(false);
  const ownDPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [ownDLoop, setOwnDLoop] = useState(() => {
    try {
      return localStorage.getItem('hangoal-own-d-loop-v1') === 'true';
    } catch {
      return false;
    }
  });
  const [isOwnDPlaying, setIsOwnDPlaying] = useState(false);
  const [ownDAudioError, setOwnDAudioError] = useState('');
  const [ownDVolume, setOwnDVolume] = useState<number>(loadOwnDVolumePreference);
  const [ownDAudioCurrentTime, setOwnDAudioCurrentTime] = useState(0);
  const [ownDAudioDuration, setOwnDAudioDuration] = useState(0);
  useEffect(() => {
    if (ownDPlayerRef.current) ownDPlayerRef.current.volume = ownDVolume;
  }, [ownDVolume]);

  const strikeToneTimerRef = useRef<number | null>(null);
  const previousTransientHoldoffRef = useRef(false);

  const [disabledToneNotesByScale, setDisabledToneNotesByScale] = useState<Record<string, string[]>>(loadDisabledToneNotesByScale);
  useEffect(() => {
    try { localStorage.setItem('hangoal-custom-tuning-view-v1', JSON.stringify(customTuningView)); }
    catch { /* Keep custom view usable when browser storage is unavailable. */ }
  }, [customTuningView]);

  // Compute tone field notes with current A4
  const toneNotes: ToneFieldNote[] = useMemo(() => {
    return currentScale.notes.map((n, idx) => {
      const sourceFrequency = typeof n.frequencyHz === 'number' && Number.isFinite(n.frequencyHz) && n.frequencyHz > 0
        ? n.frequencyHz
        : midiToFreq(n.midi, a4Ref);
      const transposedFrequency = transposeFrequencyBySemitones(sourceFrequency, transposeSemitones);
      // Handpan acoustic resonances:
      // Fundamental: 1x. Octave: 2x. Compound fifth: 3x (not the ordinary 1.5x fifth).
      // Each note has independently persisted base/partial offsets for real instrument calibration.
      const key = partialTargetOffsetKey(currentScale.id, n.name);
      const offsets = partialTargetOffsets[key] ?? DEFAULT_PARTIAL_TARGET_OFFSET;
      const f0 = transposedFrequency * Math.pow(2, (offsets.fundamentalCents ?? 0) / 1200);
      const displayNoteName = freqToNoteAndCents(f0, a4Ref).note;
      return {
        id: `note_${idx}_${n.name}`,
        noteName: displayNoteName,
        sourceNoteName: n.name,
        frequency: f0,
        fifthFreq: partialTargetFrequency(f0, 3, offsets.thirdPartialCents),
        octaveFreq: partialTargetFrequency(f0, 2, offsets.octaveCents),
        positionIndex: idx,
      };
    });
  }, [currentScale, a4Ref, partialTargetOffsets, transposeSemitones]);

  const disabledToneNoteIds = useMemo(
    () => new Set(disabledToneNotesByScale[currentScale.id] ?? []),
    [disabledToneNotesByScale, currentScale.id],
  );
  const enabledToneNotes = useMemo(
    () => getEnabledToneNotes(toneNotes, [...disabledToneNoteIds]),
    [toneNotes, disabledToneNoteIds],
  );
  const enabledToneNoteIds = useMemo(
    () => new Set(enabledToneNotes.map((note) => note.id)),
    [enabledToneNotes],
  );

  // Selected tone field note (default Ding D3)
  const [selectedNote, setSelectedNote] = useState<ToneFieldNote>(toneNotes[0]);
  const [chromaticTargetMidi, setChromaticTargetMidi] = useState<number | null>(null);
  const [isPitchDialOpen, setIsPitchDialOpen] = useState(false);
  const windowSyncPeerIdRef = useRef<string>('');
  if (!windowSyncPeerIdRef.current) windowSyncPeerIdRef.current = createWindowSyncPeerId();
  const windowSyncSequenceRef = useRef(0);
  const windowSyncChannelRef = useRef<BroadcastChannel | null>(null);
  const latestWindowSyncStateRef = useRef({
    target: selectedNote,
    a4Ref,
    transposeSemitones,
    selectedRole,
    toleranceOverrideCents,
    toleranceMode,
    strobeSensitivity,
  });
  latestWindowSyncStateRef.current = {
    target: selectedNote,
    a4Ref,
    transposeSemitones,
    selectedRole,
    toleranceOverrideCents,
    toleranceMode,
    strobeSensitivity,
  };

  useEffect(() => {
    // A zoom belongs to the previous target band; reset the view when the target note changes.
    setSpectrumZoomTargetHz(null);
  }, [selectedNote.id, selectedNote.frequency]);

  useEffect(() => {
    // A slave uses the master's exact target frequencies instead of re-deriving them from its local scale.
    if (windowSyncMode === 'slave') return;
    if (chromaticTargetMidi !== null) {
      const chromaticTarget = buildChromaticTargetNote(chromaticTargetMidi, a4Ref, currentScale.id, partialTargetOffsets);
      if (chromaticTarget) setSelectedNote(chromaticTarget);
      return;
    }
    if (toneNotes.length > 0) {
      setSelectedNote((previous) => enabledToneNotes.find((note) => note.id === previous.id) ?? enabledToneNotes[0] ?? toneNotes[0]);
    }
  }, [toneNotes, enabledToneNotes, chromaticTargetMidi, a4Ref, currentScale.id, partialTargetOffsets, windowSyncMode]);

  useEffect(() => {
    if (windowSyncMode === 'off') {
      setWindowSyncStatus('idle');
      return;
    }
    if (typeof BroadcastChannel === 'undefined') {
      setWindowSyncStatus('unsupported');
      return;
    }

    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel('hangoal-strobe-sync-v1');
    } catch {
      setWindowSyncStatus('unsupported');
      return;
    }
    windowSyncChannelRef.current = channel;
    let lastSenderId: string | null = null;
    let lastSequence = -1;

    const sendCurrentState = () => {
      const current = latestWindowSyncStateRef.current;
      const message = createWindowSyncState(windowSyncPeerIdRef.current, ++windowSyncSequenceRef.current, current);
      if (message) channel.postMessage(message);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      const message = normalizeWindowSyncMessage(event.data);
      if (!message || message.senderId === windowSyncPeerIdRef.current) return;

      if (windowSyncMode === 'master') {
        if (message.type === 'request-state') sendCurrentState();
        return;
      }

      if (message.type !== 'state') return;
      if (message.senderId === lastSenderId && message.sequence <= lastSequence) return;
      lastSenderId = message.senderId;
      lastSequence = message.sequence;
      setWindowSyncStatus('connected');
      setSelectedNote({ ...message.target });
      setChromaticTargetMidi(null);
      setA4Ref(message.a4Ref);
      setTransposeSemitones(message.transposeSemitones);
      setSelectedRole(message.selectedRole);
      setToleranceOverrideCents(message.toleranceOverrideCents);
      setToleranceMode(message.toleranceMode);
      setStrobeSensitivity(message.strobeSensitivity);
    };

    channel.addEventListener('message', onMessage);
    if (windowSyncMode === 'master') {
      setWindowSyncStatus('master');
      sendCurrentState();
    } else {
      setWindowSyncStatus('waiting');
      const request = createWindowSyncRequest(windowSyncPeerIdRef.current);
      if (request) channel.postMessage(request);
    }

    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
      if (windowSyncChannelRef.current === channel) windowSyncChannelRef.current = null;
    };
  }, [windowSyncMode]);

  useEffect(() => {
    if (windowSyncMode !== 'master') return;
    const channel = windowSyncChannelRef.current;
    if (!channel) return;
    const current = latestWindowSyncStateRef.current;
    const message = createWindowSyncState(windowSyncPeerIdRef.current, ++windowSyncSequenceRef.current, current);
    if (message) channel.postMessage(message);
  }, [windowSyncMode, selectedNote, a4Ref, transposeSemitones, selectedRole, toleranceOverrideCents, toleranceMode, strobeSensitivity]);

  const selectedMidi = useMemo(() => midiFromFrequency(selectedNote.frequency, a4Ref), [selectedNote.frequency, a4Ref]);

  const handleSetTranspose = (value: number) => {
    if (freezeTargets || windowSyncMode === 'slave') return;
    const next = Math.max(-12, Math.min(12, Math.round(value)));
    setTransposeSemitones(next);
    setChromaticTargetMidi(null);
    autoDetectionRef.current = null;
  };

  const handleSelectChromaticMidi = (midi: number) => {
    if (windowSyncMode === 'slave') return;
    const target = buildChromaticTargetNote(midi, a4Ref, currentScale.id, partialTargetOffsets);
    if (!target) return;
    autoDetectionRef.current = null;
    setAutoDetectionMode('off');
    setSingleShotCaptured(false);
    setChromaticTargetMidi(midi);
    setSelectedNote(target);
    setSelectedRole('fundamental');
  };

  const handleSelectToneFieldNote = (note: ToneFieldNote) => {
    if (windowSyncMode === 'slave') return;
    setChromaticTargetMidi(null);
    autoDetectionRef.current = null;
    setSelectedNote(note);
  };

  const handleToggleToneNote = (noteId: string) => {
    if (windowSyncMode === 'slave') return;
    const isCurrentlyDisabled = disabledToneNoteIds.has(noteId);
    if (!isCurrentlyDisabled && enabledToneNotes.length <= 1) return;

    if (!isCurrentlyDisabled && selectedNote.id === noteId) {
      const replacement = enabledToneNotes.find((note) => note.id !== noteId);
      if (replacement) {
        setChromaticTargetMidi(null);
        setSelectedNote(replacement);
        setSelectedRole('fundamental');
      }
    }

    setDisabledToneNotesByScale((previous) => {
      const disabled = new Set(previous[currentScale.id] ?? []);
      if (disabled.has(noteId)) disabled.delete(noteId);
      else {
        if (getEnabledToneNotes(toneNotes, [...disabled]).length <= 1) return previous;
        disabled.add(noteId);
      }
      const next = { ...previous };
      if (disabled.size > 0) next[currentScale.id] = [...disabled];
      else delete next[currentScale.id];
      return next;
    });
  };

  const selectedPartialOffsetKey = partialTargetOffsetKey(currentScale.id, selectedNote.sourceNoteName ?? selectedNote.noteName);
  const selectedPartialOffsets = partialTargetOffsets[selectedPartialOffsetKey] ?? DEFAULT_PARTIAL_TARGET_OFFSET;

  const updateSelectedPartialOffset = (field: PartialTargetOffsetField, value: number) => {
    if (freezeTargets || windowSyncMode === 'slave') return;
    setPartialTargetOffsets((previous) => {
      const current = previous[selectedPartialOffsetKey] ?? DEFAULT_PARTIAL_TARGET_OFFSET;
      const next: PartialTargetOffset = { ...current, [field]: value };
      if ((next.fundamentalCents ?? 0) === 0 && next.octaveCents === 0 && next.thirdPartialCents === 0) {
        const copy = { ...previous };
        delete copy[selectedPartialOffsetKey];
        return copy;
      }
      return { ...previous, [selectedPartialOffsetKey]: next };
    });
  };


  const handleCalibrateBuiltInRole = (role: 'fundamental' | 'fifth' | 'octave', targetHz: number, measuredHz: number) => {
    if (freezeTargets || windowSyncMode === 'slave') return;
    const field: PartialTargetOffsetField = role === 'fundamental'
      ? 'fundamentalCents'
      : role === 'fifth' ? 'thirdPartialCents' : 'octaveCents';
    const currentOffset = selectedPartialOffsets[field] ?? 0;
    const corrected = calibratePartialTargetOffset(currentOffset, targetHz, measuredHz);
    if (corrected !== null) updateSelectedPartialOffset(field, corrected);
  };

  const resetSelectedPartialOffsets = () => {
    if (freezeTargets || windowSyncMode === 'slave') return;
    setPartialTargetOffsets((previous) => {
      const copy = { ...previous };
      delete copy[selectedPartialOffsetKey];
      return copy;
    });
  };

  const saveActiveProfileSettings = (profile: InstrumentProfile): InstrumentProfile => ({
    ...profile,
    a4Ref,
    scaleId: currentScale.id,
    partialTargetOffsets,
    customScale: PRESET_SCALES.some((scale) => scale.id === currentScale.id) ? undefined : currentScale,
  });

  const handleSelectScale = (scale: HandpanScale) => {
    if (windowSyncMode === 'slave') return;
    setChromaticTargetMidi(null);
    setCurrentScale(scale);
    setInstrumentProfiles((previous) => previous.map((profile) => profile.id === activeInstrumentProfileId
      ? { ...profile, scaleId: scale.id, customScale: undefined }
      : profile));
  };

  const handleApplyCustomScale = (name: string, source: string): boolean => {
    if (windowSyncMode === 'slave' || !activeInstrumentProfile) return false;
    const scaleId = 'custom-' + activeInstrumentProfileId;
    const parsed = parseCustomScale(name, source, scaleId);
    if (!parsed) return false;
    setChromaticTargetMidi(null);
    setCurrentScale(parsed);
    setInstrumentProfiles((previous) => previous.map((profile) => profile.id === activeInstrumentProfileId
      ? { ...saveActiveProfileSettings(profile), scaleId: parsed.id, customScale: parsed }
      : profile));
    setSelectedRole('fundamental');
    return true;
  };

  const handleSelectInstrumentProfile = (profileId: string) => {
    if (windowSyncMode === 'slave') return;
    setChromaticTargetMidi(null);
    const profilesWithCurrentSettings = instrumentProfiles.map((profile) =>
      profile.id === activeInstrumentProfileId ? saveActiveProfileSettings(profile) : profile,
    );
    const nextProfile = profilesWithCurrentSettings.find((profile) => profile.id === profileId);
    if (!nextProfile) return;
    setInstrumentProfiles(profilesWithCurrentSettings);
    setActiveInstrumentProfileId(nextProfile.id);
    setA4Ref(nextProfile.a4Ref);
    setCurrentScale(nextProfile.customScale ?? PRESET_SCALES.find((scale) => scale.id === nextProfile.scaleId) ?? PRESET_SCALES[0]);
    setPartialTargetOffsets(nextProfile.partialTargetOffsets);
    setSelectedRole('fundamental');
  };

  const handleCreateInstrumentProfile = (name: string) => {
    if (windowSyncMode === 'slave') return;
    const trimmedName = name.trim().slice(0, 80);
    if (!trimmedName || !activeInstrumentProfile) return;
    const id = 'instrument-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const profilesWithCurrentSettings = instrumentProfiles.map((profile) =>
      profile.id === activeInstrumentProfileId ? saveActiveProfileSettings(profile) : profile,
    );
    const newProfile: InstrumentProfile = {
      id,
      name: trimmedName,
      a4Ref,
      scaleId: currentScale.id,
      partialTargetOffsets: { ...partialTargetOffsets },
      customScale: PRESET_SCALES.some((scale) => scale.id === currentScale.id) ? undefined : currentScale,
    };
    setInstrumentProfiles([...profilesWithCurrentSettings, newProfile]);
    setActiveInstrumentProfileId(id);
  };

  const handleImportInstrumentProfiles = (backup: unknown): boolean => {
    if (windowSyncMode === 'slave' || !activeInstrumentProfile) return false;
    const imported = parseInstrumentProfileBackup(
      backup,
      PRESET_SCALES.map((scale) => scale.id),
      { ...activeInstrumentProfile, id: '__bb_tuner_invalid_backup_fallback__', name: 'Import-validation fallback' },
    );
    if (!imported) return false;

    setChromaticTargetMidi(null);
    const currentProfiles = instrumentProfiles.map((profile) =>
      profile.id === activeInstrumentProfileId ? saveActiveProfileSettings(profile) : profile,
    );
    const importedById = new Map(imported.map((profile) => [profile.id, profile]));
    const currentIds = new Set(currentProfiles.map((profile) => profile.id));
    const merged = currentProfiles.map((profile) => importedById.get(profile.id) ?? profile);
    for (const profile of imported) {
      if (!currentIds.has(profile.id)) merged.push(profile);
    }

    const nextProfile = merged.find((profile) => profile.id === activeInstrumentProfileId) ?? merged[0];
    setInstrumentProfiles(merged);
    setActiveInstrumentProfileId(nextProfile.id);
    setA4Ref(nextProfile.a4Ref);
    setCurrentScale(nextProfile.customScale ?? PRESET_SCALES.find((scale) => scale.id === nextProfile.scaleId) ?? PRESET_SCALES[0]);
    setPartialTargetOffsets(nextProfile.partialTargetOffsets);
    setSelectedRole('fundamental');
    return true;
  };

  const handleExportFullConfiguration = (): boolean => {
    try {
      const currentProfiles = instrumentProfiles.map((profile) =>
        profile.id === activeInstrumentProfileId ? saveActiveProfileSettings(profile) : profile,
      );
      const rawBands = localStorage.getItem('hangoal-custom-strobe-bands-v1');
      let customStrobeBands: ReturnType<typeof normalizeStrobeBands> = [];
      if (rawBands) {
        const storedBands: unknown = JSON.parse(rawBands);
        if (!Array.isArray(storedBands)) throw new Error('Az egyedi sávbeállítás sérült.');
        const normalizedBands = normalizeStrobeBands(storedBands);
        customStrobeBands = normalizedBands.filter((band) => band.source === 'custom');
        if (customStrobeBands.length !== storedBands.length) {
          throw new Error('Egy vagy több egyedi sávbeállítás érvénytelen.');
        }
      }
      const rawPitchPipeModes = localStorage.getItem('hangoal-strobe-pitch-pipe-modes-v1');
      let pitchPipeModes: ReturnType<typeof normalizePitchPipeModes> = {};
      if (rawPitchPipeModes) {
        const storedPitchPipeModes: unknown = JSON.parse(rawPitchPipeModes);
        if (!storedPitchPipeModes || typeof storedPitchPipeModes !== 'object' || Array.isArray(storedPitchPipeModes)) {
          throw new Error('A sávonkénti referenciahang beállítás sérült.');
        }
        pitchPipeModes = normalizePitchPipeModes(storedPitchPipeModes);
        if (Object.keys(pitchPipeModes).length !== Object.keys(storedPitchPipeModes).length) {
          throw new Error('Egy vagy több sávonkénti referenciahang-beállítás érvénytelen.');
        }
      }
      const configuredPipeIds = new Set(['fundamental', 'fifth', 'octave', ...customStrobeBands.map((band) => band.id)]);
      pitchPipeModes = Object.fromEntries(Object.entries(pitchPipeModes).filter(([id]) => configuredPipeIds.has(id)));

      const backup = {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        settings: {
          autoDetect: autoDetectionMode !== 'off',
          autoDetectionMode,
          toleranceOverrideCents,
          toleranceMode,
          freezeTargets,
          transposeSemitones,
          strobeSensitivity,
          readoutMode,
          referenceToneMode,
          activeInstrumentProfileId,
          instrumentProfiles: currentProfiles,
        },
        disabledToneNotesByScale,
        customStrobeBands,
        pitchPipeModes,
        measurements: logs,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Hangoal_Configuration_' + Date.now() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (error) {
      console.warn('Nem sikerült exportálni a teljes Hangoal-konfigurációt:', error);
      return false;
    }
  };

  const handleImportConfiguration = (value: unknown): boolean => {
    if (windowSyncMode === 'slave') return false;
    if (value && typeof value === 'object' && !Array.isArray(value) &&
      (value as Record<string, unknown>).schemaVersion === 2) {
      const currentProfile = instrumentProfiles.find((profile) => profile.id === activeInstrumentProfileId);
      if (!currentProfile) return false;
      const parsed = parseHangoalFullConfiguration(
        value,
        PRESET_SCALES.map((scale) => scale.id),
        saveActiveProfileSettings(currentProfile),
      );
      if (!parsed) return false;

      const activeProfile = parsed.settings.instrumentProfiles.find(
        (profile) => profile.id === parsed.settings.activeInstrumentProfileId,
      );
      if (!activeProfile) return false;
      const selectedScale = activeProfile.customScale ??
        PRESET_SCALES.find((scale) => scale.id === activeProfile.scaleId);
      if (!selectedScale) return false;

      // Validate and persist every cross-panel preference before applying React state.
      const storageEntries: Array<[string, string]> = [
        ['hangoal-custom-strobe-bands-v1', JSON.stringify(parsed.customStrobeBands)],
        ['hangoal-strobe-pitch-pipe-modes-v1', JSON.stringify(parsed.pitchPipeModes)],
        ['hangoal-freeze-targets-v1', String(parsed.settings.freezeTargets)],
        ['hangoal-tolerance-mode-v1', parsed.settings.toleranceMode],
      ];
      let previousStorage: Array<[string, string | null]>;
      try {
        previousStorage = storageEntries.map(([key]) => [key, localStorage.getItem(key)]);
      } catch (error) {
        console.warn('Nem sikerült ellenőrizni a helyi konfigurációs tárhelyet:', error);
        return false;
      }
      try {
        storageEntries.forEach(([key, storedValue]) => localStorage.setItem(key, storedValue));
      } catch (error) {
        // Roll back every key when persistence is unavailable; do not leave a partly imported configuration.
        previousStorage.forEach(([key, previous]) => {
          try {
            if (previous === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous);
          } catch { /* Keep best-effort rollback silent; no React state has changed yet. */ }
        });
        console.warn('Nem sikerült menteni a teljes importált Hangoal-konfigurációt:', error);
        return false;
      }

      setChromaticTargetMidi(null);
      setInstrumentProfiles(parsed.settings.instrumentProfiles);
      setActiveInstrumentProfileId(parsed.settings.activeInstrumentProfileId);
      setA4Ref(activeProfile.a4Ref);
      setCurrentScale(selectedScale);
      setPartialTargetOffsets(activeProfile.partialTargetOffsets);
      setAutoDetectionMode(parsed.settings.autoDetectionMode);
      setSingleShotCaptured(false);
      setToleranceOverrideCents(parsed.settings.toleranceOverrideCents);
      setToleranceMode(parsed.settings.toleranceMode);
      setFreezeTargets(parsed.settings.freezeTargets);
      setTransposeSemitones(parsed.settings.transposeSemitones);
      setStrobeSensitivity(parsed.settings.strobeSensitivity);
      setReadoutMode(parsed.settings.readoutMode);
      setReferenceToneMode(parsed.settings.referenceToneMode);
      setDisabledToneNotesByScale(parsed.disabledToneNotesByScale);
      setLogs(parsed.measurements);
      setSelectedRole('fundamental');
      autoDetectionRef.current = null;
      window.dispatchEvent(new Event('hangoal-custom-strobe-bands-updated'));
      window.dispatchEvent(new Event('hangoal-custom-strobe-bands-changed'));
      window.dispatchEvent(new Event('hangoal-strobe-pitch-pipe-modes-updated'));
      return true;
    }

    // Backwards compatibility: schemaVersion 1 profile-only exports still import as before.
    return handleImportInstrumentProfiles(value);
  };

  const handleRenameInstrumentProfile = (profileId: string, name: string) => {
    if (windowSyncMode === 'slave') return;
    const trimmedName = name.trim().slice(0, 80);
    if (!trimmedName) return;
    setInstrumentProfiles((previous) => previous.map((profile) =>
      profile.id === profileId ? { ...profile, name: trimmedName } : profile,
    ));
  };

  const handleDeleteInstrumentProfile = (profileId: string) => {
    if (windowSyncMode === 'slave' || instrumentProfiles.length <= 1) return;
    const profilesWithCurrentSettings = instrumentProfiles.map((profile) =>
      profile.id === activeInstrumentProfileId ? saveActiveProfileSettings(profile) : profile,
    );
    const remaining = profilesWithCurrentSettings.filter((profile) => profile.id !== profileId);
    if (remaining.length === profilesWithCurrentSettings.length) return;
    setInstrumentProfiles(remaining);
    if (profileId === activeInstrumentProfileId) {
      setChromaticTargetMidi(null);
      const nextProfile = remaining[0];
      setActiveInstrumentProfileId(nextProfile.id);
      setA4Ref(nextProfile.a4Ref);
      setCurrentScale(nextProfile.customScale ?? PRESET_SCALES.find((scale) => scale.id === nextProfile.scaleId) ?? PRESET_SCALES[0]);
      setPartialTargetOffsets(nextProfile.partialTargetOffsets);
      setSelectedRole('fundamental');
    }
  };

  // Note names for the 3 resonances of the selected note
  const resonanceNoteNames = useMemo(() => {
    // If D3 is selected: Alap = D3, oktáv = D4, 3. parciális = A4
    // Otherwise calculate octave and fifth names
    return {
      fundamental: selectedNote.noteName,
      fifth: freqToNoteAndCents(selectedNote.fifthFreq, a4Ref).note,
      octave: freqToNoteAndCents(selectedNote.octaveFreq, a4Ref).note,
    };
  }, [selectedNote, a4Ref]);

  // The stability graph and dispersion readout use the same selected resonance.
  useEffect(() => {
    bbAudioEngine.setStabilityRole(selectedRole);
    setStandardDeviationCents(0);
  }, [selectedRole]);

  // Stability samples belong to a single selected note; don't mix different targets.
  const previousNoteIdRef = useRef(selectedNote.id);
  useEffect(() => {
    if (previousNoteIdRef.current !== selectedNote.id) {
      bbAudioEngine.resetStabilityHistory();
      setStandardDeviationCents(0);
      previousNoteIdRef.current = selectedNote.id;
    }
  }, [selectedNote.id]);

  // Live Audio Analysis State
  const [isListening, setIsListening] = useState(false);
  const [isFileInputActive, setIsFileInputActive] = useState(false);
  const [autoGainControlStatus, setAutoGainControlStatus] = useState<boolean | null>(null);
  const [micError, setMicError] = useState('');
  const [hasSignal, setHasSignal] = useState(false);
  const [inputLevelDb, setInputLevelDb] = useState(-100);
  const [transientHoldoff, setTransientHoldoff] = useState(false);
  const [highInputLevel, setHighInputLevel] = useState(false);
  const [inputNearClip, setInputNearClip] = useState(false);
  const [analysisFps, setAnalysisFps] = useState<number | null>(null);
  const analysisRateWindowRef = useRef({ startedAtMs: performance.now(), frameCount: 0 });
  const [sampleRateKhz, setSampleRateKhz] = useState<number | null>(null);
  const [standardDeviationCents, setStandardDeviationCents] = useState(0);
  const [yinFrequencyHz, setYinFrequencyHz] = useState<number | null>(null);
  const [yinClarity, setYinClarity] = useState(0);
  const [yinAgreementCents, setYinAgreementCents] = useState<number | null>(null);
  const isSignalInputActive = isListening || isFileInputActive || isReferenceTonePlaying;

  // The 3 resonance measurements
  const [alap, setAlap] = useState<ResonanceMeasurement>({
    role: 'fundamental',
    name: 'Alap',
    noteName: toneNotes[0].noteName,
    measuredHz: null,
    targetHz: toneNotes[0].frequency,
    deviationCents: null,
    amplitudeDb: null,
    confidence: 0,
    timestampMs: Date.now(),
    status: 'no-signal',
  });

  const [kvint, setKvint] = useState<ResonanceMeasurement>({
    role: 'fifth',
    name: '3. parciális',
    noteName: resonanceNoteNames.fifth,
    measuredHz: null,
    targetHz: toneNotes[0].fifthFreq,
    deviationCents: null,
    amplitudeDb: null,
    confidence: 0,
    timestampMs: Date.now(),
    status: 'no-signal',
  });

  const [oktav, setOktav] = useState<ResonanceMeasurement>({
    role: 'octave',
    name: 'Oktáv',
    noteName: resonanceNoteNames.octave,
    measuredHz: null,
    targetHz: toneNotes[0].octaveFreq,
    deviationCents: null,
    amplitudeDb: null,
    confidence: 0,
    timestampMs: Date.now(),
    status: 'no-signal',
  });

  // Measurements Log
  const [logs, setLogs] = useState<TuningLogEntry[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('bb-tuner-measurements-v1') || '[]');
      return Array.isArray(parsed) ? parsed.filter(isValidTuningLogEntry) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try { localStorage.setItem('bb-tuner-measurements-v1', JSON.stringify(logs)); } catch (error) { console.warn('Nem sikerült menteni a mérési naplót:', error); }
  }, [logs]);

  useEffect(() => {
    const currentProfile = instrumentProfiles.find((profile) => profile.id === activeInstrumentProfileId);
    const customScale = PRESET_SCALES.some((scale) => scale.id === currentScale.id) ? undefined : currentScale;
    const profileMatchesState = currentProfile &&
      currentProfile.a4Ref === a4Ref &&
      currentProfile.scaleId === currentScale.id &&
      JSON.stringify(currentProfile.partialTargetOffsets) === JSON.stringify(partialTargetOffsets) &&
      JSON.stringify(currentProfile.customScale) === JSON.stringify(customScale);
    const profilesToSave = profileMatchesState
      ? instrumentProfiles
      : instrumentProfiles.map((profile) => profile.id === activeInstrumentProfileId
        ? { ...profile, a4Ref, scaleId: currentScale.id, partialTargetOffsets, customScale }
        : profile);

    if (!profileMatchesState && currentProfile) setInstrumentProfiles(profilesToSave);
    try {
      localStorage.setItem('bb-tuner-preferences-v1', JSON.stringify({
        a4Ref,
        scaleId: currentScale.id,
        autoDetect,
        autoDetectionMode,
        toleranceOverrideCents,
        transposeSemitones,
        strobeSensitivity,
        readoutMode,
        referenceToneMode,
        partialTargetOffsets,
        instrumentProfiles: profilesToSave,
        activeInstrumentProfileId,
      }));
    } catch (error) {
      console.warn('Nem sikerült menteni a hangoló beállításait:', error);
    }
  }, [a4Ref, currentScale, autoDetect, autoDetectionMode, toleranceOverrideCents, transposeSemitones, strobeSensitivity, readoutMode, referenceToneMode, partialTargetOffsets, instrumentProfiles, activeInstrumentProfileId]);

  useEffect(() => {
    try {
      localStorage.setItem('hangoal-disabled-tone-notes-v1', JSON.stringify(disabledToneNotesByScale));
    } catch (error) {
      console.warn('Nem sikerült menteni az aktív hangmezőket:', error);
    }
  }, [disabledToneNotesByScale]);

  // Audio Analysis Loop (~30 Hz)
  useEffect(() => {
    let animId = 0;
    let lastTick = performance.now();

    function loop(now: number) {
      if (now - lastTick >= 33) {
        lastTick = now;
        const rateSample = recordAnalysisFrame(analysisRateWindowRef.current, now);
        analysisRateWindowRef.current = rateSample.window;
        if (rateSample.fps !== null) setAnalysisFps(rateSample.fps);

        if (windowSyncMode !== 'slave' && !isReferenceTonePlaying && isDetectionArmed(autoDetectionMode, singleShotCaptured) && chromaticTargetMidi === null) {
          const detected = bbAudioEngine.detectNote(
            enabledToneNotes.map((note) => ({ id: note.id, noteName: note.noteName, frequency: note.frequency }))
          );
          if (detected) {
            if (autoDetectionRef.current?.id === detected.id) {
              autoDetectionRef.current.count += 1;
            } else {
              autoDetectionRef.current = { id: detected.id, count: 1 };
            }
            const matched = enabledToneNotes.find((note) => note.id === detected.id);
            // Require three consecutive matching frames to avoid note changes from a single transient.
            if (matched && autoDetectionRef.current.count >= 3) {
              if (matched.id !== selectedNote.id) setSelectedNote(matched);
              if (autoDetectionMode === 'single-shot' && !singleShotCaptured) setSingleShotCaptured(true);
            }
          } else {
            autoDetectionRef.current = null;
          }
        } else {
          autoDetectionRef.current = null;
        }

        const result = bbAudioEngine.analyze(
          selectedNote.frequency,
          selectedNote.fifthFreq,
          selectedNote.octaveFreq,
          resonanceNoteNames
        );

        if (result) {
          setHasSignal(result.hasSignal);
          setInputLevelDb(result.inputLevelDb);
          setTransientHoldoff(result.transientHoldoff);
          setHighInputLevel(result.highInputLevel);
          setInputNearClip(result.clippingLikely);
          setSampleRateKhz(result.sampleRateKhz);
          setStandardDeviationCents(result.standardDeviationCents);
          setYinFrequencyHz(result.yinFrequencyHz);
          setYinClarity(result.yinClarity);
          setYinAgreementCents(result.yinAgreementCents);

          // Always propagate all three channels, including NO_SIGNAL/UNCERTAIN.
          // Never leave stale or demo values on screen after the sound disappears.
          setAlap(result.alap);
          setKvint(result.kvint);
          setOktav(result.oktav);
        }
      }

      if (isSignalInputActive) {
        animId = requestAnimationFrame(loop);
      }
    }

    if (isSignalInputActive) {
      animId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animId);
  }, [isSignalInputActive, isReferenceTonePlaying, selectedNote, resonanceNoteNames, autoDetect, autoDetectionMode, singleShotCaptured, toneNotes, enabledToneNotes, chromaticTargetMidi, windowSyncMode]);

  const handleSelectAudioInputDevice = useCallback(async (deviceId: string) => {
    setSelectedAudioInputDeviceId(deviceId);
    try { localStorage.setItem('hangoal-audio-input-device-v1', deviceId); } catch { /* Ignore storage failures. */ }
    if (!isListening) {
      setAudioIoMessage(deviceId ? 'A kiválasztott mikrofont a következő mérés indításakor használom.' : 'A mikrofonválasztás automatikus módra állítva.');
      return;
    }
    bbAudioEngine.stopMicrophone();
    setIsListening(false);
    setHasSignal(false);
    setInputLevelDb(-100);
    const ok = await bbAudioEngine.startMicrophone(deviceId || null);
    if (ok) {
      setAutoGainControlStatus(bbAudioEngine.getAutoGainControlStatus());
      setIsListening(true);
      setMicError('');
      setAudioIoMessage('A mikrofonváltás sikerült.');
      void refreshAudioDevices();
    } else {
      setAutoGainControlStatus(null);
      setMicError(bbAudioEngine.getErrorMessage() || 'A kiválasztott mikrofon nem indítható el.');
      setAudioIoMessage('A mikrofonváltás nem sikerült. Válassz másik bemenetet, vagy állítsd automatikusra.');
    }
  }, [isListening, refreshAudioDevices]);

  const handleSelectAudioOutputDevice = useCallback(async (deviceId: string) => {
    if (!audioOutputSelectionSupported) {
      setAudioIoMessage('A kimeneti eszköz külön választását ez a böngésző nem támogatja.');
      return;
    }
    setAudioIoMessage('Kimeneti eszköz beállítása…');
    const ok = await bbAudioEngine.setOutputDevice(deviceId || null);
    if (ok) {
      setSelectedAudioOutputDeviceId(deviceId);
      try { localStorage.setItem('hangoal-audio-output-device-v1', deviceId); } catch { /* Ignore storage failures. */ }
      setAudioIoMessage(deviceId ? 'A kiválasztott hangkimenet aktív.' : 'A rendszer alapértelmezett hangkimenete aktív.');
    } else {
      setAudioIoMessage(bbAudioEngine.getErrorMessage() || 'A kimeneti eszköz nem választható ki.');
      void refreshAudioDevices();
    }
  }, [audioOutputSelectionSupported, refreshAudioDevices]);

  // Toggle microphone
  const handleToggleMic = async () => {
    if (isListening) {
      bbAudioEngine.stopMicrophone();
      setIsListening(false);
      setAutoGainControlStatus(null);
      setMicError('');
      setHasSignal(false);
      setInputLevelDb(-100);
      setTransientHoldoff(false);
      setHighInputLevel(false);
      setInputNearClip(false);
      setAnalysisFps(null);
      analysisRateWindowRef.current = { startedAtMs: performance.now(), frameCount: 0 };
      const clearMeasurement = (m: ResonanceMeasurement, targetHz: number): ResonanceMeasurement => ({
        ...m, measuredHz: null, targetHz, deviationCents: null, amplitudeDb: null,
        confidence: 0, timestampMs: Date.now(), status: 'no-signal',
      });
      setAlap(clearMeasurement(alap, selectedNote.frequency));
      setKvint(clearMeasurement(kvint, selectedNote.fifthFreq));
      setOktav(clearMeasurement(oktav, selectedNote.octaveFreq));
    } else {
      setMicError('');
      // Stop the file-input analysis before opening the microphone.
      if (isFileInputActive) {
        bbAudioEngine.stopAudioElementInput();
        setIsFileInputActive(false);
      }
      // Stop the reference recording before opening the microphone to avoid speaker-to-mic feedback.
      if (ownDPlayerRef.current && !ownDPlayerRef.current.paused) {
        ownDPlayerRef.current.pause();
        ownDPlayerRef.current.currentTime = 0;
        setOwnDAudioCurrentTime(0);
        setIsOwnDPlaying(false);
      }
      if (selectedAudioOutputDeviceId && audioOutputSelectionSupported) await bbAudioEngine.setOutputDevice(selectedAudioOutputDeviceId);
      const ok = await bbAudioEngine.startMicrophone(selectedAudioInputDeviceId || null);
      if (ok) {
        analysisRateWindowRef.current = { startedAtMs: performance.now(), frameCount: 0 };
        setAnalysisFps(null);
        setAutoGainControlStatus(bbAudioEngine.getAutoGainControlStatus());
        setIsListening(true);
        void refreshAudioDevices();
      } else {
        setAutoGainControlStatus(null);
        setMicError(bbAudioEngine.getErrorMessage() || 'A mikrofon nem indítható el. Ellenőrizd az engedélyeket.');
      }
    }
  };

  // Capture measurement to logbook
  const handleCaptureSnapshot = () => {
    if (![alap, kvint, oktav].every((m) => m.status === 'valid' && m.measuredHz !== null && m.deviationCents !== null)) return;
    const newEntry: TuningLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: Date.now(),
      noteName: selectedNote.noteName,
      scaleId: currentScale.id,
      instrumentProfileId: activeInstrumentProfileId,
      instrumentProfileName: activeInstrumentProfile?.name ?? 'Handpan',
      audioSampleRateHz: bbAudioEngine.getSampleRate(),
      inputLevelDbfs: inputLevelDb,
      toleranceOverrideCents,
      fundamentalHz: alap.measuredHz!,
      fundamentalCents: alap.deviationCents!,
      fifthHz: kvint.measuredHz!,
      fifthCents: kvint.deviationCents!,
      octaveHz: oktav.measuredHz!,
      octaveCents: oktav.deviationCents!,
      fundamentalTargetHz: alap.targetHz ?? selectedNote.frequency,
      fifthTargetHz: kvint.targetHz ?? selectedNote.fifthFreq,
      octaveTargetHz: oktav.targetHz ?? selectedNote.octaveFreq,
      overallInTune:
        isWithinTuningTolerance(alap.deviationCents, alap.targetHz, toleranceOverrideCents) &&
        isWithinTuningTolerance(kvint.deviationCents, kvint.targetHz, toleranceOverrideCents) &&
        isWithinTuningTolerance(oktav.deviationCents, oktav.targetHz, toleranceOverrideCents),
    };
    setLogs((prev) => [newEntry, ...prev]);
  };

  // Determine active resonance details for Section B header
  const activeResonance = selectedRole === 'fundamental' ? alap : selectedRole === 'fifth' ? kvint : oktav;
  const referenceToneHz = activeResonance.targetHz ?? (
    selectedRole === 'fundamental' ? selectedNote.frequency
      : selectedRole === 'fifth' ? selectedNote.fifthFreq
      : selectedNote.octaveFreq
  );

  useEffect(() => {
    // Stop any manual/previous tone when its target or listening state changes.
    bbAudioEngine.stopTone();
    setIsReferenceTonePlaying(false);
    if (strikeToneTimerRef.current !== null) {
      window.clearTimeout(strikeToneTimerRef.current);
      strikeToneTimerRef.current = null;
    }
    previousTransientHoldoffRef.current = transientHoldoff;
    return () => {
      if (strikeToneTimerRef.current !== null) {
        window.clearTimeout(strikeToneTimerRef.current);
        strikeToneTimerRef.current = null;
      }
      bbAudioEngine.stopTone();
    };
  }, [selectedNote.id, selectedRole, activeInstrumentProfileId, referenceToneHz, isListening, referenceToneMode]);

  useEffect(() => {
    const shouldPlay = shouldTriggerStrikeReferenceTone(
      referenceToneMode,
      isListening,
      transientHoldoff,
      previousTransientHoldoffRef.current,
    );
    previousTransientHoldoffRef.current = transientHoldoff;
    if (!shouldPlay || !Number.isFinite(referenceToneHz) || referenceToneHz <= 0) return;

    if (strikeToneTimerRef.current !== null) window.clearTimeout(strikeToneTimerRef.current);
    bbAudioEngine.playTone(referenceToneHz);
    setIsReferenceTonePlaying(true);
    // The analyzer's transient guard holds tuning output during the attack; keep the cue brief.
    strikeToneTimerRef.current = window.setTimeout(() => {
      bbAudioEngine.stopTone();
      setIsReferenceTonePlaying(false);
      strikeToneTimerRef.current = null;
    }, 120);
  }, [referenceToneMode, isListening, transientHoldoff, referenceToneHz]);

  const handleSetReferenceToneMode = (mode: ReferenceToneMode) => {
    bbAudioEngine.stopTone();
    setIsReferenceTonePlaying(false);
    if (strikeToneTimerRef.current !== null) {
      window.clearTimeout(strikeToneTimerRef.current);
      strikeToneTimerRef.current = null;
    }
    previousTransientHoldoffRef.current = transientHoldoff;
    setReferenceToneMode(mode);
  };

  const handleToggleReferenceTone = () => {
    if (referenceToneMode !== 'continuous' || isListening || isFileInputActive) return;
    if (isReferenceTonePlaying) {
      bbAudioEngine.stopTone();
      setIsReferenceTonePlaying(false);
      return;
    }
    if (!Number.isFinite(referenceToneHz) || referenceToneHz <= 0) return;
    bbAudioEngine.playTone(referenceToneHz);
    setIsReferenceTonePlaying(true);
  };

  /**
   * One transport handler is shared by the Hangolás panel and the persistent
   * controls shown on the other tabs. The audio node itself stays mounted above
   * the tab switch, so changing views cannot break the analyser connection.
   */
  const handleToggleOwnDPlayback = () => {
    const player = ownDPlayerRef.current;
    if (!player) return;

    if (isOwnDPlaying) {
      player.pause();
      player.currentTime = 0;
      bbAudioEngine.stopAudioElementInput();
      setIsFileInputActive(false);
      setOwnDAudioCurrentTime(0);
      setIsOwnDPlaying(false);
      setHasSignal(false);
      return;
    }

    if (isListening || isReferenceTonePlaying) return;
    setOwnDAudioError('');

    const startPlayback = async () => {
      const playPromise = player.play();
      const inputPromise = bbAudioEngine.startAudioElementInput(player);
      const [, inputReady] = await Promise.all([playPromise, inputPromise]);
      if (!inputReady) throw new Error('A hangfájl nem kapcsolható az elemzőhöz.');
      analysisRateWindowRef.current = { startedAtMs: performance.now(), frameCount: 0 };
      setAnalysisFps(null);
      setIsFileInputActive(true);
      setIsOwnDPlaying(true);
    };

    void startPlayback().catch((cause) => {
      player.pause();
      bbAudioEngine.stopAudioElementInput();
      setIsFileInputActive(false);
      setIsOwnDPlaying(false);
      setHasSignal(false);
      setOwnDAudioError(cause instanceof Error
        ? cause.message
        : 'A lejátszás nem indult el. Érintsd meg újra a Lejátszás gombot.');
    });
  };

  const handleToggleOwnDLoop = () => {
    setOwnDLoop((previous) => {
      const next = !previous;
      try {
        localStorage.setItem('hangoal-own-d-loop-v1', String(next));
      } catch {
        // Keep playback usable when browser storage is unavailable.
      }
      return next;
    });
  };

  const activeCents = activeResonance.deviationCents;
  const isNearTune = activeResonance.status === 'valid' && isWithinTuningTolerance(activeCents, activeResonance.targetHz, toleranceOverrideCents, toleranceMode);

  // Textual assessment (e.g. "(kissé magas)", "(kissé mély)", "(pontos)")
  const isHeldReading = activeResonance.status === 'held' && activeCents !== null;
  const assessmentText = isHeldReading
    ? `(utolsó ütés · ${Math.max(0, (Date.now() - activeResonance.timestampMs) / 1000).toFixed(1)} s)`
    : !hasSignal
    ? ''
    : activeResonance.status !== 'valid' || activeCents === null
    ? '(nem mérhető biztosan)'
    : isNearTune
    ? '(pontos)'
    : activeCents !== null && activeCents > 0
    ? '(kissé magas)'
    : '(kissé mély)';

  const keyboardActionsRef = useRef({
    handleToggleMic,
    handleSelectToneFieldNote,
    handleToggleReferenceTone,
  });
  keyboardActionsRef.current = {
    handleToggleMic,
    handleSelectToneFieldNote,
    handleToggleReferenceTone,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.shiftKey && event.key !== '?') return;
      const target = event.target as HTMLElement | null;
      if (isEditableKeyboardTarget(target?.tagName, target?.isContentEditable)) return;
      if (isSettingsOpen) return;

      const action = resolveHangoalKeyboardAction(event.key, event.code);
      if (!action) return;
      event.preventDefault();

      switch (action) {
        case 'previous-note':
        case 'next-note': {
          if (enabledToneNotes.length === 0) return;
          const currentIndex = enabledToneNotes.findIndex((note) => note.id === selectedNote.id);
          const nextIndex = currentIndex < 0
            ? action === 'next-note' ? 0 : enabledToneNotes.length - 1
            : (currentIndex + (action === 'next-note' ? 1 : -1) + enabledToneNotes.length) % enabledToneNotes.length;
          keyboardActionsRef.current.handleSelectToneFieldNote(enabledToneNotes[nextIndex]);
          if (windowSyncMode !== 'slave') setSelectedRole('fundamental');
          return;
        }
        case 'previous-resonance':
        case 'next-resonance': {
          const roles = ['fundamental', 'fifth', 'octave'] as const;
          const index = roles.indexOf(selectedRole);
          const delta = action === 'next-resonance' ? 1 : -1;
          if (windowSyncMode !== 'slave') setSelectedRole(roles[(index + delta + roles.length) % roles.length]);
          return;
        }
        case 'toggle-microphone':
          void keyboardActionsRef.current.handleToggleMic();
          return;
        case 'cycle-detection': {
          if (windowSyncMode === 'slave') return;
          if (autoDetectionMode === 'single-shot' && singleShotCaptured) {
            setSingleShotCaptured(false);
            autoDetectionRef.current = null;
            return;
          }
          const next = nextAutoDetectionMode(autoDetectionMode);
          setAutoDetectionMode(next);
          setSingleShotCaptured(false);
          autoDetectionRef.current = null;
          if (next !== 'off' && chromaticTargetMidi !== null) setChromaticTargetMidi(null);
          return;
        }
        case 'toggle-reference-tone':
          if (referenceToneMode === 'continuous' && !isListening && !isFileInputActive) keyboardActionsRef.current.handleToggleReferenceTone();
          return;
        case 'show-shortcuts':
          setIsKeyboardHelpOpen((open) => !open);
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enabledToneNotes,
    selectedNote.id,
    selectedNote.frequency,
    referenceToneHz,
    selectedRole,
    isListening,
    isSettingsOpen,
    autoDetectionMode,
    singleShotCaptured,
    chromaticTargetMidi,
    referenceToneMode,
    windowSyncMode,
  ]);

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#f1f5f9] flex flex-col items-center justify-start antialiased selection:bg-[#f59e0b]/30">
      {/* Mobile container constrained to smartphone frame width */}
      <div className="w-full max-w-[420px] min-h-screen flex flex-col justify-between px-3.5 pt-2 pb-24 relative select-none">
        
        {/* ================= SECTION A: HEADER & MIKROFONÁLLAPOT ================= */}
        {micError && (
          <div role="alert" className="mx-1 mt-2 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {micError}
          </div>
        )}
        <div>
          {/* Header Bar */}
          <header className="flex items-center justify-between py-1.5 px-1">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 text-slate-300 hover:text-white transition"
              title="Menü"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Hangoal title */}
            <div className="text-center leading-none">
              <div className="text-lg font-black tracking-tight text-white">Hangoal</div>
              <div className="text-[10px] text-slate-400 font-normal tracking-wide mt-0.5">
                Handpan hangoló és felhangelemző
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (autoDetectionMode === 'single-shot' && singleShotCaptured) {
                    setSingleShotCaptured(false);
                    autoDetectionRef.current = null;
                    return;
                  }
                  const next = nextAutoDetectionMode(autoDetectionMode);
                  setAutoDetectionMode(next);
                  setSingleShotCaptured(false);
                  autoDetectionRef.current = null;
                  if (next !== 'off' && chromaticTargetMidi !== null) setChromaticTargetMidi(null);
                }}
                className={`px-2 py-1 rounded-full border text-[10px] font-semibold ${
                  autoDetectionMode === 'continuous'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : autoDetectionMode === 'single-shot'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                    : 'border-slate-700 text-slate-400'
                }`}
                title={autoDetectionMode === 'single-shot' && singleShotCaptured
                  ? 'Egyszeri felismerés újraélesítése'
                  : 'Módváltás: folyamatos → egyszeri → ki. Egyszeri módban az első stabil felismerés után kattintással újraélesíthető.'}
                aria-label={autoDetectionMode === 'single-shot' && singleShotCaptured ? 'Egyszeri felismerés újraélesítése' : 'Automatikus hangfelismerés módja'}
                disabled={windowSyncMode === 'slave'}
              >
                {autoDetectionMode === 'off'
                  ? 'AUTO KI'
                  : autoDetectionMode === 'continuous'
                  ? 'AUTO BE'
                  : singleShotCaptured
                  ? 'RÖGZÍTVE'
                  : 'AUTO 1×'}
              </button>
              <button onClick={() => setIsSettingsOpen(true)} className="p-1 text-slate-300 hover:text-white transition" title="Beállítások">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Microphone Status Bar */}
          <div className="flex items-center justify-between py-2 px-1 text-xs">
            {/* Left: Mic state dot & label */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  isSignalInputActive
                    ? 'bg-[#10b981] shadow-[0_0_8px_#10b981]'
                    : 'bg-slate-600'
                }`}
              />
              <span className={`text-[11px] font-medium ${isSignalInputActive ? 'text-slate-200' : 'text-slate-400'}`}>
                {isListening ? 'Mikrofon aktív' : isFileInputActive ? 'Hangfájl tesztelése' : isReferenceTonePlaying ? 'Szinuszjel aktív' : 'Mikrofon inaktív'}
              </span>
            </div>

            {/* Right: Sample rate, input level dB, and LED meter */}
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span title="A hangbemenet mintavételezési frekvenciája">{sampleRateKhz !== null ? `${sampleRateKhz} kHz` : '— kHz'}</span>
              <span className="text-slate-600">|</span>
              <span
                title="A fő elemzési ciklus mért frissítési üteme"
                aria-label={analysisFps !== null ? `Elemzési frissítés: ${analysisFps} képkocka másodpercenként` : 'Elemzési frissítési ütem még nem mérhető'}
                className={analysisFps !== null && analysisFps < 20 ? 'text-amber-300' : ''}
              >{isSignalInputActive && analysisFps !== null ? `${analysisFps} FPS` : '— FPS'}</span>
              <span className="text-slate-600">|</span>
              <span className={inputNearClip ? 'w-11 text-right text-red-300' : 'w-11 text-right'}>
                {isSignalInputActive && hasSignal ? `${inputLevelDb} dB` : '-∞ dB'}
              </span>

              {/* 8-segment LED VU meter matching screenshot */}
              <div className="flex items-center gap-[2px] ml-1">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((barIdx) => {
                  // Thresholds: -60, -50, -40, -30, -20, -12, -6, -2 dB
                  const thresholds = [-60, -50, -40, -30, -22, -14, -8, -3];
                  const isLit = isSignalInputActive && hasSignal && inputLevelDb >= thresholds[barIdx];

                  let colorClass = 'bg-[#10b981]'; // Green (bars 0-4)
                  if (barIdx >= 5 && barIdx <= 6) colorClass = 'bg-[#f59e0b]'; // Yellow/Amber
                  if (barIdx === 7) colorClass = 'bg-[#f43f5e]'; // Red peak

                  return (
                    <div
                      key={barIdx}
                      className={`w-[3px] h-3 rounded-[1px] transition-opacity duration-75 ${
                        isLit ? `${colorClass} opacity-100 shadow-[0_0_4px_currentColor]` : 'bg-slate-800 opacity-40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {isListening && autoGainControlStatus === false && (
          <div
            role="status"
            aria-live="polite"
            className="mx-1 mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200"
          >
            A böngésző nem aktiválta az automatikus mikrofonerősítést. Halk ütéseknél a hangfelismerés bizonytalanabb lehet.
          </div>
        )}
        {isListening && (transientHoldoff || highInputLevel || inputNearClip) && (
          <div
            role="status"
            aria-live="polite"
            className={`mx-1 mb-2 rounded-md border px-2 py-1.5 text-[11px] ${highInputLevel || inputNearClip ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}
          >
            {inputNearClip
              ? 'A bemeneti jel csúcsa közel van a digitális maximumhoz – a torzítás lehetséges; csökkentsd a mikrofon erősítését vagy távolítsd a mikrofont.'
              : highInputLevel
              ? 'Magas bemeneti RMS-szint – a tranziens torzulhat; csökkentsd a mikrofon erősítését vagy üss finomabban.'
              : 'Ütés tranziensének kiszűrése – várj a zengő sustain szakaszra.'}
          </div>
        )}

        {activeTab !== 'hangolas' && (
          <section
            aria-label="Közös hangforrás-vezérlés"
            className="mb-3 rounded-xl border border-cyan-400/20 bg-cyan-950/20 px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">Közös hangforrás</div>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {isOwnDPlaying ? 'A handpan-minta szól · az elemző aktív' : isReferenceTonePlaying ? 'A szinuszreferencia szól · az elemző aktív' : 'Indíts mintát: a minta minden fülön a közös elemzőt táplálja.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleOwnDPlayback}
                  disabled={isListening || isReferenceTonePlaying}
                  className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-200 disabled:opacity-40"
                >
                  {isOwnDPlaying ? 'Minta leállítása' : 'Minta lejátszása'}
                </button>
                <label className="flex items-center gap-1.5 text-[10px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={ownDLoop}
                    onChange={handleToggleOwnDLoop}
                    className="h-4 w-4 accent-amber-400"
                  />
                  Loop
                </label>
                {isReferenceTonePlaying && (
                  <button
                    type="button"
                    onClick={() => {
                      bbAudioEngine.stopTone();
                      setIsReferenceTonePlaying(false);
                    }}
                    className="rounded-full border border-rose-400/30 px-3 py-2 text-[11px] font-semibold text-rose-200"
                  >
                    Szinusz leállítása
                  </button>
                )}
              </div>
            </div>
            {ownDAudioError && <p role="alert" className="mt-2 text-[10px] text-rose-300">{ownDAudioError}</p>}
          </section>
        )}

              <audio
                className="hidden"
                aria-hidden="true"
                ref={ownDPlayerRef}
                src="/audio/sajat-d-handpan.mp3"
                loop={false}
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  setOwnDAudioDuration(Number.isFinite(duration) ? Math.min(duration, 3) : 0);
                }}
                onDurationChange={(event) => {
                  const duration = event.currentTarget.duration;
                  setOwnDAudioDuration(Number.isFinite(duration) ? Math.min(duration, 3) : 0);
                }}
                onTimeUpdate={(event) => {
                  const player = event.currentTarget;
                  if (player.currentTime >= 3) {
                    if (ownDLoop) {
                      player.currentTime = 0;
                      setOwnDAudioCurrentTime(0);
                    } else {
                      player.pause();
                      player.currentTime = 0;
                      bbAudioEngine.stopAudioElementInput();
                      setIsFileInputActive(false);
                      setIsOwnDPlaying(false);
                      setOwnDAudioCurrentTime(0);
                    }
                  } else {
                    setOwnDAudioCurrentTime(player.currentTime);
                  }
                }}
                onCanPlay={() => setOwnDAudioError('')}
                onError={() => {
                  bbAudioEngine.stopAudioElementInput();
                  setIsFileInputActive(false);
                  setHasSignal(false);
                  setIsOwnDPlaying(false);
                  setOwnDAudioDuration(0);
                  setOwnDAudioCurrentTime(0);
                  setOwnDAudioError('A saját D-felvétel nem tölthető be. Frissítsd az oldalt, és próbáld újra.');
                }}
                onEnded={() => { bbAudioEngine.stopAudioElementInput(); setIsFileInputActive(false); setIsOwnDPlaying(false); setOwnDAudioCurrentTime(0); }}
                onPause={(event) => { if (event.currentTarget.paused) { bbAudioEngine.stopAudioElementInput(); setIsFileInputActive(false); setIsOwnDPlaying(false); setHasSignal(false); setInputLevelDb(-100); setTransientHoldoff(false); } }}
                onPlay={() => { setOwnDAudioError(''); setIsOwnDPlaying(true); }}
              />

        {/* ================= TAB 1: MAIN TUNING SCREEN ================= */}
        {activeTab === 'hangolas' && (
          <div className="flex flex-col gap-1.5 flex-1 justify-between">
            <section aria-label="Egyéni hangoló munkanézet" className="mx-1 mb-2 rounded-xl border border-cyan-400/25 bg-slate-900/70 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-white">
                  <input type="checkbox" checked={customTuningView.enabled} onChange={(event) => setCustomTuningView((previous) => ({ ...previous, enabled: event.target.checked }))} className="h-4 w-4 shrink-0 accent-cyan-400" />
                  <span>Egyéni nézet</span>
                </label>
                <button type="button" onClick={() => setIsTuningPanelPickerOpen((open) => !open)} aria-expanded={isTuningPanelPickerOpen} className="shrink-0 rounded-full border border-cyan-400/30 px-3 py-2 text-[10px] font-semibold text-cyan-200">
                  Panelek · {customTuningView.panels.length}/{TUNING_VIEW_PANELS.length} {isTuningPanelPickerOpen ? '−' : '+'}
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                {customTuningView.enabled ? 'Csak a kipipált elemek jelennek meg a Hangolás fülön. A választásod automatikusan mentődik.' : 'Egyéni nézet kikapcsolva: minden panel megjelenik. A kijelölésed megmarad, ha újra bekapcsolod.'}
              </p>
              {customTuningView.enabled && customTuningView.panels.length === 0 && (
                <p role="status" className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2 text-[10px] leading-relaxed text-amber-200">
                  Nincs kijelölt panel. Nyisd meg a „Panelek” listát, és jelöld be a szükséges eszközöket, vagy válaszd a „Kompakt alapnézet” lehetőséget.
                </p>
              )}
              {isTuningPanelPickerOpen && (
                <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                  <div className="grid max-h-[45vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {TUNING_VIEW_PANELS.map((panel) => (
                      <label key={panel.id} className="flex min-w-0 items-start gap-2 rounded-lg border border-white/5 bg-black/15 px-2.5 py-2">
                        <input type="checkbox" checked={customTuningView.panels.includes(panel.id)} onChange={(event) => setCustomTuningView((previous) => ({
                          ...previous,
                          panels: event.target.checked ? [...previous.panels.filter((item) => item !== panel.id), panel.id] : previous.panels.filter((item) => item !== panel.id),
                        }))} className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold leading-tight text-slate-200">{panel.label}</span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{panel.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => setCustomTuningView({ enabled: true, panels: [...DEFAULT_TUNING_VIEW_PANELS] })} className="rounded-lg border border-cyan-400/25 px-3 py-2 text-[10px] font-semibold text-cyan-200">Kompakt alapnézet</button>
                    <button type="button" onClick={() => setCustomTuningView({ enabled: true, panels: TUNING_VIEW_PANELS.map((panel) => panel.id) })} className="rounded-lg border border-slate-600 px-3 py-2 text-[10px] font-semibold text-slate-300">Mind kijelölése</button>
                    <button type="button" onClick={() => setCustomTuningView((previous) => ({ ...previous, enabled: false }))} className="rounded-lg border border-slate-600 px-3 py-2 text-[10px] font-semibold text-slate-300">Minden panel megjelenítése</button>
                  </div>
                </div>
              )}
            </section>
            {shouldShowTuningPanel('samplePlayback') && (
<section aria-label="Saját D handpan felvétele" className="mx-1 mb-2 rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-slate-900 px-3 py-3">

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Saját D lejátszása</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">A saját D Kurd handpan-felvétel első 3 másodperce fut át a teljes hangolóelemzésen.</p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleOwnDPlayback}
                  className="shrink-0 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/20"
                  aria-label={isOwnDPlaying ? "Saját D leállítása" : "Saját D lejátszása"}
                  disabled={isListening || isReferenceTonePlaying}
                  title={isListening ? 'A saját felvétel lejátszásához előbb állítsd le a mikrofonmérést.' : isReferenceTonePlaying ? 'Előbb állítsd le a szinuszreferenciát.' : undefined}
                >
                  <Volume2 className="h-4 w-4" />
                  {isOwnDPlaying ? "Leállítás" : "Lejátszás"}
                </button>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <label htmlFor="hangoal-own-d-position">Felvétel pozíciója</label>
                  <span className="font-mono tabular-nums">{formatAudioTime(ownDAudioCurrentTime)} / {formatAudioTime(ownDAudioDuration)}</span>
                </div>
                <input
                  id="hangoal-own-d-position"
                  type="range"
                  min={0}
                  max={Math.max(ownDAudioDuration, 0.1)}
                  step={0.05}
                  value={Math.min(ownDAudioCurrentTime, ownDAudioDuration || 0)}
                  onChange={(event) => {
                    const nextTime = Number(event.target.value);
                    if (ownDPlayerRef.current && Number.isFinite(nextTime)) {
                      ownDPlayerRef.current.currentTime = nextTime;
                      setOwnDAudioCurrentTime(nextTime);
                    }
                  }}
                  disabled={!ownDAudioDuration}
                  aria-label="Lejátszási pozíció"
                  className="w-full accent-amber-400 disabled:opacity-40"
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="hangoal-own-d-volume" className="shrink-0 text-xs text-slate-300">Hangerő</label>
                <input
                  id="hangoal-own-d-volume"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(ownDVolume * 100)}
                  onChange={(event) => {
                    const nextVolume = Math.max(0, Math.min(1, Number(event.target.value) / 100));
                    setOwnDVolume(nextVolume);
                    try {
                      localStorage.setItem('hangoal-own-d-volume-v1', String(nextVolume));
                    } catch {
                      // Keep volume control usable when browser storage is unavailable.
                    }
                  }}
                  aria-label="Saját D hangerő"
                  className="min-w-0 flex-1 accent-amber-400"
                />
                <span className="w-9 text-right text-xs tabular-nums text-slate-400">{Math.round(ownDVolume * 100)}%</span>
              </div>
              {isListening && <p className="mt-2 text-[11px] text-amber-200/80">A mikrofonmérés aktív; a felvétel lejátszása ilyenkor le van tiltva, hogy a hangszóró ne zavarja a mérést.</p>}
              {ownDAudioError && <p role="alert" className="mt-2 text-[11px] text-rose-300">{ownDAudioError}</p>}
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={ownDLoop}
                  onChange={handleToggleOwnDLoop}
                  className="h-4 w-4 accent-amber-400"
                />
                Loopolva (folyamatos ismétlés)
              </label>
            </section>
              )}
{shouldShowTuningPanel('recordingAnalysis') && (
            <OwnDRecordingAnalysis
              audioRef={ownDPlayerRef}
              noteCandidates={enabledToneNotes.map((note) => ({
                id: note.id,
                noteName: note.noteName,
                frequency: note.frequency,
              }))}
              targetFrequencyHz={selectedNote.frequency}
              onApplyPartialOffsets={(octaveCents, thirdPartialCents) => {
                updateSelectedPartialOffset('octaveCents', octaveCents);
                updateSelectedPartialOffset('thirdPartialCents', thirdPartialCents);
              }}
            />
              )}
            {/* ================= SECTION B: MAIN PITCH & STROBE BANDS ================= */}
            <div>
              {/* Main Pitch Row (Large D3, +2.3 cent, Alaphang dropdown) */}
{shouldShowTuningPanel('pitchReadout') && (
              <div className="flex items-start justify-between px-1 pt-1 pb-1">
                {/* Note Name & Frequency */}
                <div className="flex flex-col">
                  <span className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-none">
                    {selectedNote.noteName}
                  </span>
                  <span className="text-sm font-mono text-slate-300 font-semibold mt-1">
                    {alap.measuredHz ? `${alap.measuredHz.toFixed(2)} Hz` : `${selectedNote.frequency.toFixed(2)} Hz`}
                  </span>
                </div>

                {/* Deviation Cents & Assessment */}
                <div className="flex flex-col items-center justify-center pt-0.5">
                  <div
                    className={`text-xl sm:text-2xl font-mono font-bold tracking-tight ${
                      activeCents !== null && isNearTune ? 'text-[#10b981]' : activeCents !== null && Math.abs(activeCents) > 10 ? 'text-[#f43f5e]' : 'text-[#f59e0b]'
                    }`}
                  >
                    {activeCents !== null && (activeResonance.status === 'valid' || isHeldReading) ? `${activeCents > 0 ? '+' : ''}${activeCents.toFixed(1)} cent` : '— cent'}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {assessmentText}
                  </div>
                </div>

                {/* Resonance Role Selector Pill */}
                <button
                  onClick={() => {
                    if (windowSyncMode === 'slave') return;
                    const roles: ('fundamental' | 'fifth' | 'octave')[] = ['fundamental', 'fifth', 'octave'];
                    const nextIdx = (roles.indexOf(selectedRole) + 1) % roles.length;
                    setSelectedRole(roles[nextIdx]);
                  }}
                  disabled={windowSyncMode === 'slave'}
                  className="px-2.5 py-1.5 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-medium flex items-center gap-1 hover:bg-[#f59e0b]/20 transition"
                >
                  <span>{selectedRole === 'fundamental' ? 'Alaphang' : selectedRole === 'fifth' ? '3. parciális' : 'Oktáv'}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>


              )}{shouldShowTuningPanel('referenceTone') && (
              <>
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <span className="text-[10px] text-slate-500">
                  Célreferencia · {referenceToneHz.toFixed(3)} Hz
                </span>
                <button
                  type="button"
                  onClick={handleToggleReferenceTone}
                  disabled={referenceToneMode !== 'continuous' || isListening || isFileInputActive || !Number.isFinite(referenceToneHz) || referenceToneHz <= 0}
                  aria-pressed={referenceToneMode === 'continuous' && isReferenceTonePlaying}
                  aria-label={isReferenceTonePlaying ? 'Referenciahang leállítása' : 'Referenciahang lejátszása'}
                  title={referenceToneMode === 'off' ? 'A referenciahang ki van kapcsolva.' : referenceToneMode === 'strike' ? 'Minden érzékelt ütés kezdetén rövid referenciahang szól.' : isListening ? 'Mikrofonmérés közben a folyamatos referenciahang ki van kapcsolva.' : 'A kiválasztott rezonancia célfrekvenciájának lejátszása'}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    isReferenceTonePlaying
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-[#f59e0b]/50 hover:text-[#f59e0b]'
                  }`}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  {referenceToneMode === 'off' ? 'Referenciahang: ki' : referenceToneMode === 'strike' ? 'Ütésjelzés aktív' : isReferenceTonePlaying ? 'Hang leállítása' : 'Referenciahang'}
                </button>
              </div>

              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <label htmlFor="hangoal-reference-tone-mode" className="text-[10px] text-slate-500">Referenciahang módja</label>
                <select
                  id="hangoal-reference-tone-mode"
                  value={referenceToneMode}
                  onChange={(event) => handleSetReferenceToneMode(normalizeReferenceToneMode(event.target.value))}
                  className="max-w-[190px] rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-amber-400"
                >
                  <option value="continuous">Folyamatos (kézi indítás)</option>
                  <option value="strike">Ütésre rövid hang</option>
                  <option value="off">Kikapcsolva</option>
                </select>
              </div>
              {referenceToneMode === 'strike' && (
                <p className="mb-2 px-1 text-[10px] leading-relaxed text-slate-500">
                  A rövid hang a tranziensvédelmi ablak elején szól. A készülék hangszórójából visszajutó hang hibát okozhat; mérési átvételhez fejhallgatós és hangszórós teszt is szükséges.
                </p>
              )}


              </>
              )}{shouldShowTuningPanel('pitchDial') && (
              <>
              <div className="mb-1 flex justify-end px-1">
                <button
                  type="button"
                  onClick={() => setIsPitchDialOpen((open) => !open)}
                  aria-expanded={isPitchDialOpen}
                  className="rounded-full border border-cyan-400/30 bg-cyan-400/5 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-400/10"
                >
                  {isPitchDialOpen ? 'Pitch tárcsa elrejtése' : 'Kromatikus pitch tárcsa'}
                </button>
              </div>
              {isPitchDialOpen && <BBPitchDial selectedMidi={selectedMidi} onSelectMidi={handleSelectChromaticMidi} />}
              </>
              )}

{shouldShowTuningPanel('transposition') && (
              <section className="my-2 rounded-xl border border-white/10 bg-[#0b111b] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Skála transzponálása</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">Félhangok · a kromatikus tárcsa közvetlen célhangját nem módosítja</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" aria-label="Transzponálás egy félhanggal lejjebb" onClick={() => handleSetTranspose(transposeSemitones - 1)} disabled={freezeTargets || transposeSemitones <= -12} className="h-8 w-8 rounded-lg border border-slate-700 bg-slate-900 text-lg text-white disabled:opacity-30">−</button>
                    <span className="min-w-[54px] text-center font-mono text-xs font-semibold text-amber-200">{transposeSemitones > 0 ? '+' : ''}{transposeSemitones} st</span>
                    <button type="button" aria-label="Transzponálás egy félhanggal feljebb" onClick={() => handleSetTranspose(transposeSemitones + 1)} disabled={freezeTargets || transposeSemitones >= 12} className="h-8 w-8 rounded-lg border border-slate-700 bg-slate-900 text-lg text-white disabled:opacity-30">+</button>
                    <button type="button" onClick={() => handleSetTranspose(0)} disabled={freezeTargets || windowSyncMode === 'slave' || transposeSemitones === 0} className="rounded-lg border border-slate-700 px-2 py-2 text-[10px] text-slate-400 disabled:opacity-30">Nullázás</button>
                  </div>
                </div>
              </section>
              )}

              {/* Three Stroboscope Bands (Alap, Kvint, Oktáv) */}
              <section aria-label="Hangolási toleranciamód" className="my-2 rounded-xl border border-white/10 bg-[#0b111b] px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Stroboszkóp toleranciája</div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">Csak a színjelzést módosítja, a mért Hz- és centértékeket nem.</p>
                  </div>
                  <select aria-label="Stroboszkóp tolerancia módja" value={toleranceMode} onChange={(event) => setToleranceMode(normalizeTuningToleranceMode(event.target.value))} disabled={windowSyncMode === 'slave'} className="max-w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] text-white">
                    <option value="auto">Automatikus / rögzített cent</option>
                    <option value="any">Mindig elfogadott (mindig zöld)</option>
                    <option value="off">Soha ne legyen zöld</option>
                  </select>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
                  <input type="checkbox" checked={freezeTargets} onChange={(event) => setFreezeTargets(event.target.checked)} className="h-4 w-4 accent-cyan-400" />
                  <span>{freezeTargets ? 'Célértékek befagyasztva: referenciafrekvencia, transzponálás és felhangkorrekció' : 'Célértékek befagyasztása (freeze)'}</span>
                </label>
              </section>

              <section aria-label="Master/slave hangolóablak-szinkron" className="my-2 rounded-xl border border-white/10 bg-[#0b111b] px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Többablakos Master / Slave</div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">Azonos eredetű Hangoal-ablakok között szinkronizálja a hangot, az A4-referenciát, a transzponálást és az 1×/2×/3× célfrekvenciákat.</p>
                  </div>
                  <select
                    aria-label="Master/slave szinkronmód"
                    value={windowSyncMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as WindowSyncMode;
                      if (nextMode !== 'off' && typeof BroadcastChannel === 'undefined') {
                        setWindowSyncStatus('unsupported');
                        return;
                      }
                      setWindowSyncMode(nextMode);
                    }}
                    className="max-w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] text-white"
                  >
                    <option value="off">Kikapcsolva</option>
                    <option value="master">Master · vezérlő</option>
                    <option value="slave">Slave · követő</option>
                  </select>
                </div>
                {(windowSyncMode !== 'off' || windowSyncStatus === 'unsupported') && (
                  <p role="status" className={'mt-2 text-[10px] ' + (windowSyncStatus === 'connected' || windowSyncStatus === 'master' ? 'text-emerald-300' : windowSyncStatus === 'unsupported' || windowSyncStatus === 'error' ? 'text-rose-300' : 'text-amber-200')}>
                    {windowSyncStatus === 'master'
                      ? 'Ez az ablak a Master; a követő ablakok kérésre megkapják az aktuális célhangot.'
                      : windowSyncStatus === 'connected'
                        ? 'Kapcsolódva a Masterhez; a célhang és a mérési beállítások szinkronban vannak.'
                        : windowSyncStatus === 'unsupported'
                          ? 'Ez a böngésző nem támogatja a többablakos szinkront; válaszd a Kikapcsolva módot.'
                          : windowSyncStatus === 'error'
                            ? 'A szinkroncsatorna nem indítható el ebben az ablakban.'
                            : 'Master ablak keresése… nyisd meg egy másik Hangoal-ablakban a Master módot.'}
                  </p>
                )}
              </section>

{shouldShowTuningPanel('stroboscope') && (
              <BBStrobeBands
                alap={alap}
                kvint={kvint}
                oktav={oktav}
                hasSignal={hasSignal}
                active={isSignalInputActive}
                transientHoldoff={transientHoldoff}
                freezeTargetSettings={freezeTargets || windowSyncMode === 'slave'}
                baseFrequencyHz={selectedNote.frequency}
                selectedRole={selectedRole}
                onSelectRole={handleSelectResonanceRole}
                toleranceOverrideCents={toleranceOverrideCents}
                toleranceMode={toleranceMode}
                strobeSensitivity={strobeSensitivity}
                onChangeStrobeSensitivity={(value) => { if (windowSyncMode !== 'slave') setStrobeSensitivity(value); }}
                onZoomTargetHz={setSpectrumZoomTargetHz}
                onCalibrateBuiltInRole={handleCalibrateBuiltInRole}
              />
              )}
            </div>

            {/* ================= SECTION C: FREQUENCY SPECTRUM ================= */}
{shouldShowTuningPanel('spectrum') && (
            <BBSpectrum
              alap={alap}
              kvint={kvint}
              oktav={oktav}
              hasSignal={hasSignal}
              toleranceOverrideCents={toleranceOverrideCents}
              toleranceMode={toleranceMode}
              onSelectPeak={handleSelectResonanceRole}
              onZoomTargetHz={setSpectrumZoomTargetHz}
              zoomTargetHz={spectrumZoomTargetHz}
              customStrobeBands={customStrobeBands}
              onClearZoom={() => setSpectrumZoomTargetHz(null)}
            />
              )}

{shouldShowTuningPanel('diagnostics') && (
            <BBSpectrumDiagnostics
              active={isSignalInputActive}
              hasSignal={hasSignal}
              transientHoldoff={transientHoldoff}
              alap={alap}
              oktav={oktav}
              kvint={kvint}
            />
              )}

{shouldShowTuningPanel('measurementCards') && (
              <>
            <div className="my-1 flex items-center justify-between gap-3 px-1">
              <label htmlFor="hangoal-readout-mode" className="text-[11px] text-slate-400">Mérési kártyák kijelzése</label>
              <select
                id="hangoal-readout-mode"
                value={readoutMode}
                onChange={(event) => setReadoutMode(normalizeTuningReadoutMode(event.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-amber-400"
              >
                <option value="hz">Frekvencia (Hz)</option>
                <option value="cents">Eltérés (cent)</option>
                <option value="note">Hangnév</option>
                <option value="ratio">Arány az alaphanghoz</option>
              </select>
            </div>

            {/* ================= SECTION D: THREE MEASUREMENT CARDS ================= */}
            <BBCards
              alap={alap}
              kvint={kvint}
              oktav={oktav}
              hasSignal={hasSignal}
              selectedRole={selectedRole}
              onSelectRole={setSelectedRole}
              toleranceOverrideCents={toleranceOverrideCents}
              toleranceMode={toleranceMode}
              readoutMode={readoutMode}
              a4Ref={a4Ref}
            />


              </>
              )}            {/* ================= SECTION E: FREQUENCY STABILITY GRAPH ================= */}
{shouldShowTuningPanel('stabilityGraph') && (
            <BBStabilityGraph
              roleName={selectedRole === 'fundamental' ? 'Alaphang' : selectedRole === 'fifth' ? '3. parciális' : 'Oktáv'}
              hasSignal={hasSignal}
              currentCents={activeCents ?? 0}
              targetHz={activeResonance.targetHz}
              toleranceOverrideCents={toleranceOverrideCents}
              standardDeviationCents={standardDeviationCents}
            />
              )}

{shouldShowTuningPanel('keyboardShortcuts') && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setIsKeyboardHelpOpen((open) => !open)}
                aria-expanded={isKeyboardHelpOpen}
                className="w-full rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-left text-[11px] font-semibold text-slate-300 hover:border-amber-400/30 hover:text-white"
              >
                Billentyűzetes vezérlés · ? {isKeyboardHelpOpen ? '−' : '+'}
              </button>
              {isKeyboardHelpOpen && (
                <div className="mt-2 rounded-xl border border-white/10 bg-[#0b111b] p-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                    <div><kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-amber-200">← / →</kbd><p className="mt-1 text-slate-400">Előző/következő aktív hangmező</p></div>
                    <div><kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-amber-200">↑ / ↓</kbd><p className="mt-1 text-slate-400">Rezonanciacsatorna váltása</p></div>
                    <div><kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-amber-200">Space</kbd><p className="mt-1 text-slate-400">Mikrofonmérés indítása/leállítása</p></div>
                    <div><kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-amber-200">D</kbd><p className="mt-1 text-slate-400">Detektálási mód váltása/újraélesítés</p></div>
                    <div><kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-amber-200">R</kbd><p className="mt-1 text-slate-400">Referenciahang (folyamatos mód, mikrofon leállítva)</p></div>
                    <div><kbd className="rounded border border-slate-600 bg-slate-900 px-1.5 py-1 font-mono text-amber-200">Shift + /</kbd><p className="mt-1 text-slate-400">Súgó megjelenítése/elrejtése</p></div>
                  </div>
                  <p className="mt-3 border-t border-white/5 pt-2 text-[10px] leading-relaxed text-slate-500">
                    A gyorsbillentyűk nem aktívak a beállításablakban, illetve szövegmezőre, gombra vagy más interaktív elemre fókuszálva.
                  </p>
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: DETAILED SPECTRUM VIEW ================= */}
        {activeTab === 'spektrum' && (
          <div className="flex-1 flex flex-col gap-2 py-1 min-h-0">
            <BBSpectrumWaterfall active={isSignalInputActive} alap={alap} oktav={oktav} kvint={kvint} yinFrequencyHz={yinFrequencyHz} yinClarity={yinClarity} yinAgreementCents={yinAgreementCents} />
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <button disabled={windowSyncMode === 'slave'} onClick={() => handleSelectResonanceRole('fundamental')} className={`rounded-lg border p-2 text-left disabled:opacity-70 ${selectedRole === 'fundamental' ? 'border-amber-400/60 bg-amber-400/10' : 'border-white/10 bg-slate-900/50'}`}>
                <div className="font-sans font-semibold text-amber-400">1× Alaphang</div>
                <div className="text-white">{alap.measuredHz !== null ? alap.measuredHz.toFixed(2) + ' Hz' : '--'}</div>
                <div className="text-slate-400">{alap.deviationCents !== null ? (alap.deviationCents > 0 ? '+' : '') + alap.deviationCents.toFixed(1) + ' cent' : '--'}</div>
              </button>
              <button disabled={windowSyncMode === 'slave'} onClick={() => handleSelectResonanceRole('octave')} className={`rounded-lg border p-2 text-left disabled:opacity-70 ${selectedRole === 'octave' ? 'border-cyan-400/60 bg-cyan-400/10' : 'border-white/10 bg-slate-900/50'}`}>
                <div className="font-sans font-semibold text-cyan-400">2× Oktáv</div>
                <div className="text-white">{oktav.measuredHz !== null ? oktav.measuredHz.toFixed(2) + ' Hz' : '--'}</div>
                <div className="text-slate-400">{oktav.deviationCents !== null ? (oktav.deviationCents > 0 ? '+' : '') + oktav.deviationCents.toFixed(1) + ' cent' : '--'}</div>
              </button>
              <button disabled={windowSyncMode === 'slave'} onClick={() => handleSelectResonanceRole('fifth')} className={`rounded-lg border p-2 text-left disabled:opacity-70 ${selectedRole === 'fifth' ? 'border-purple-400/60 bg-purple-400/10' : 'border-white/10 bg-slate-900/50'}`}>
                <div className="font-sans font-semibold text-purple-400">3× Kvint</div>
                <div className="text-white">{kvint.measuredHz !== null ? kvint.measuredHz.toFixed(2) + ' Hz' : '--'}</div>
                <div className="text-slate-400">{kvint.deviationCents !== null ? (kvint.deviationCents > 0 ? '+' : '') + kvint.deviationCents.toFixed(1) + ' cent' : '--'}</div>
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 3: HANGMEZŐ (TONE FIELD MAP) ================= */}
        {activeTab === 'hangmezo' && (
          <div className="flex-1 flex flex-col justify-center">
            <BBHangmezoView
              notes={enabledToneNotes}
              totalNoteCount={toneNotes.length}
              allowReferenceTonePreview={referenceToneMode === 'continuous' && !isListening && !isFileInputActive && !isReferenceTonePlaying}
              selectedNote={selectedNote}
              onSelectNote={handleSelectToneFieldNote}
              hasSignal={hasSignal}
              alapCents={alap.deviationCents}
            />
            <BBScaleNoteEnablePanel
              notes={toneNotes}
              enabledNoteIds={enabledToneNoteIds}
              onToggleNote={handleToggleToneNote}
            />
          </div>
        )}

        {/* ================= TAB 4: MÉRÉSEK (LOGBOOK & EXPORT) ================= */}
        {activeTab === 'meresek' && (
          <div className="flex-1 flex flex-col">
            <BBMeresekView
              logs={logs}
              selectedScaleId={currentScale.id}
              selectedNoteName={selectedNote.noteName}
              selectedInstrumentProfileId={activeInstrumentProfileId}
              selectedInstrumentProfileName={activeInstrumentProfile?.name ?? 'Handpan'}
              onClearLogs={() => setLogs([])}
              onCapture={handleCaptureSnapshot}
              canCapture={[alap, kvint, oktav].every((m) => m.status === 'valid' && m.measuredHz !== null && m.deviationCents !== null)}
              hasSignal={hasSignal}
            />
          </div>
        )}

        {/* ================= SECTION 8: BOTTOM NAVIGATION DOCK & GOLDEN MIC BUTTON ================= */}
        <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-[400px] rounded-2xl bg-[#0d121a]/95 border border-white/10 px-3 py-2 flex items-center justify-between text-slate-400 shadow-2xl backdrop-blur-md">
          {/* Tab 1: Hangolás */}
          <button
            onClick={() => setActiveTab('hangolas')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'hangolas' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Hangolás</span>
            {activeTab === 'hangolas' && (
              <span className="w-3 h-0.5 bg-[#f59e0b] rounded-full mt-0.5" />
            )}
          </button>

          {/* Tab 2: Spektrum */}
          <button
            onClick={() => setActiveTab('spektrum')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'spektrum' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Spektrum</span>
          </button>

          {/* Center Floating Golden Mic Button (Exact match to screenshot!) */}
          <div className="relative -mt-6">
            <button
              onClick={handleToggleMic}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.35)] transition-transform active:scale-95 border-2 ${
                isListening
                  ? 'bg-gradient-to-br from-[#f59e0b] via-[#fbbf24] to-[#d97706] text-slate-950 border-white/40 ring-4 ring-[#f59e0b]/20'
                  : 'bg-gradient-to-br from-[#d97706] to-[#b45309] text-slate-950 border-[#f59e0b]/40 hover:opacity-95'
              }`}
              title={isListening ? 'Mérés Leállítása' : isReferenceTonePlaying ? 'A szinuszjel mérése aktív' : 'Mérés Indítása'}
            >
              {isListening ? (
                <Mic className="w-6 h-6 text-slate-950" />
              ) : (
                <MicOff className="w-6 h-6 text-slate-950" />
              )}
            </button>
          </div>

          {/* Tab 3: Hangmező */}
          <button
            onClick={() => setActiveTab('hangmezo')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'hangmezo' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Hangmező</span>
          </button>

          {/* Tab 4: Mérések */}
          <button
            onClick={() => setActiveTab('meresek')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'meresek' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Mérések</span>
          </button>
        </nav>

        {/* Settings & Scale Modal */}
        <BBSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          instrumentProfiles={instrumentProfiles}
          activeInstrumentProfileId={activeInstrumentProfileId}
          onSelectInstrumentProfile={handleSelectInstrumentProfile}
          onCreateInstrumentProfile={handleCreateInstrumentProfile}
          onRenameInstrumentProfile={handleRenameInstrumentProfile}
          onDeleteInstrumentProfile={handleDeleteInstrumentProfile}
          onImportInstrumentProfiles={handleImportConfiguration}
          onExportFullConfiguration={handleExportFullConfiguration}
          a4Ref={a4Ref}
          toleranceOverrideCents={toleranceOverrideCents}
          onChangeToleranceOverrideCents={(value) => { if (windowSyncMode !== 'slave') setToleranceOverrideCents(value); }}
          freezeTargetSettings={freezeTargets || windowSyncMode === 'slave'}
          audioInputDevices={audioInputDevices}
          selectedAudioInputDeviceId={selectedAudioInputDeviceId}
          onSelectAudioInputDevice={(deviceId) => { void handleSelectAudioInputDevice(deviceId); }}
          audioOutputDevices={audioOutputDevices}
          selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
          onSelectAudioOutputDevice={(deviceId) => { void handleSelectAudioOutputDevice(deviceId); }}
          onRefreshAudioDevices={() => { void refreshAudioDevices(); }}
          isRefreshingAudioDevices={isRefreshingAudioDevices}
          audioOutputSelectionSupported={audioOutputSelectionSupported}
          audioIoMessage={audioIoMessage}
          onChangeA4={(value) => {
            if (!freezeTargets && windowSyncMode !== 'slave' && Number.isFinite(value) && value >= 420 && value <= 450) setA4Ref(value);
          }}
          selectedScaleId={currentScale.id}
          onSelectScale={handleSelectScale}
          onApplyCustomScale={handleApplyCustomScale}
          selectedNoteName={selectedNote.noteName}
          selectedNoteFundamentalHz={selectedNote.frequency}
          partialTargetOffsets={selectedPartialOffsets}
          onChangePartialTargetOffset={updateSelectedPartialOffset}
          onResetPartialTargetOffsets={resetSelectedPartialOffsets}
          sampleRateKhz={sampleRateKhz}
          fftSize={bbAudioEngine.getFFTSize()}
          autoGainControlStatus={autoGainControlStatus}
          isListening={isListening}
        />
      </div>
    </div>
  );
}
