import React from 'react';
import { X, Sliders, Music, ShieldCheck } from 'lucide-react';
import { HandpanScale } from '../types/tuner';
import { freqToNoteAndCents, PRESET_SCALES } from '../audio/scales';
import { MAX_PARTIAL_TARGET_OFFSET_CENTS, partialTargetFrequency } from '../audio/partialTargets';
import type { PartialTargetOffset, PartialTargetOffsetField } from '../audio/partialTargets';
import type { InstrumentProfile } from '../audio/instrumentProfiles';
import { formatTuningToleranceSetting, type TuningToleranceSetting } from '../audio/tuningTolerance';
import { parseScalaScl, resolveScalaReferenceAnchor, scalaToCustomScaleText, type ParsedScalaScale } from '../audio/scala';
import type { AudioDeviceOption } from '../audio/deviceSelection';

function scalaImportSuccessMessage(parsed: ParsedScalaScale | null, message: string): string {
  const reference = parsed?.reference;
  if (!reference) return message;

  const label = reference.label
    ? reference.label.charAt(0).toUpperCase() + reference.label.slice(1)
    : `fok ${reference.degreeIndex}`;
  const referenceName = `${label}${reference.octave}`;
  const frequency = reference.frequencyHz === undefined
    ? ''
    : ` (${reference.frequencyHz.toFixed(3)} Hz)`;

  return `${message} Scala referencia-metaadat: ${referenceName}${frequency}. Alapértelmezésben a kiválasztott hang marad a skála alaphangja; a referenciahorgony külön, kifejezett választással alkalmazható.`;
}


interface Props {
  isOpen: boolean;
  onClose: () => void;
  a4Ref: number;
  onChangeA4: (a4: number) => void;
  toleranceOverrideCents: TuningToleranceSetting;
  onChangeToleranceOverrideCents: (value: TuningToleranceSetting) => void;
  selectedScaleId: string;
  onSelectScale: (scale: HandpanScale) => void;
  selectedNoteName: string;
  selectedNoteFundamentalHz: number;
  partialTargetOffsets: PartialTargetOffset;
  onChangePartialTargetOffset: (field: PartialTargetOffsetField, value: number) => void;
  onResetPartialTargetOffsets: () => void;
  sampleRateKhz: number | null;
  isListening: boolean;
  autoGainControlStatus: boolean | null;
  audioInputDevices: AudioDeviceOption[];
  audioOutputDevices: AudioDeviceOption[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  outputDeviceSelectionSupported: boolean;
  audioDeviceNotice: string;
  onRefreshAudioDevices: () => void;
  onChangeAudioInputDevice: (deviceId: string) => void;
  onChangeAudioOutputDevice: (deviceId: string) => void;
  instrumentProfiles: InstrumentProfile[];
  activeInstrumentProfileId: string;
  onSelectInstrumentProfile: (profileId: string) => void;
  onCreateInstrumentProfile: (name: string) => void;
  onRenameInstrumentProfile: (profileId: string, name: string) => void;
  onDeleteInstrumentProfile: (profileId: string) => void;
  onApplyCustomScale: (name: string, source: string) => boolean;
  onImportInstrumentProfiles: (backup: unknown) => boolean;
  onExportFullConfiguration: () => boolean;
}

export const BBSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  a4Ref,
  onChangeA4,
  toleranceOverrideCents,
  onChangeToleranceOverrideCents,
  selectedScaleId,
  onSelectScale,
  selectedNoteName,
  selectedNoteFundamentalHz,
  partialTargetOffsets,
  onChangePartialTargetOffset,
  onResetPartialTargetOffsets,
  sampleRateKhz,
  isListening,
  autoGainControlStatus,
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSelectionSupported,
  audioDeviceNotice,
  onRefreshAudioDevices,
  onChangeAudioInputDevice,
  onChangeAudioOutputDevice,
  instrumentProfiles,
  activeInstrumentProfileId,
  onSelectInstrumentProfile,
  onCreateInstrumentProfile,
  onRenameInstrumentProfile,
  onDeleteInstrumentProfile,
  onApplyCustomScale,
  onImportInstrumentProfiles,
  onExportFullConfiguration,
}) => {
  const activeProfile = instrumentProfiles.find((profile) => profile.id === activeInstrumentProfileId);
  const [newProfileName, setNewProfileName] = React.useState('');
  const [renameProfileDraft, setRenameProfileDraft] = React.useState(activeProfile?.name ?? '');
  const [customScaleNameDraft, setCustomScaleNameDraft] = React.useState(activeProfile?.customScale?.name ?? '');
  const [customScaleTextDraft, setCustomScaleTextDraft] = React.useState(
    activeProfile?.customScale?.notes.map((note) => `${note.name}, ${note.frequencyHz?.toFixed(3) ?? ''}`).join('\n') ?? '',
  );
  const [customScaleMessage, setCustomScaleMessage] = React.useState('');
  const [pendingScalaImport, setPendingScalaImport] = React.useState<{ parsed: ParsedScalaScale; name: string } | null>(null);
  const [useScalaReferenceAnchor, setUseScalaReferenceAnchor] = React.useState(false);
  const [bundledScalaAssets, setBundledScalaAssets] = React.useState<Array<{ path: string; category: string; name: string }>>([]);
  const [selectedBundledScalaPath, setSelectedBundledScalaPath] = React.useState('');
  const [isLoadingBundledScala, setIsLoadingBundledScala] = React.useState(false);
  const pendingScalaAnchor = pendingScalaImport ? resolveScalaReferenceAnchor(pendingScalaImport.parsed, a4Ref) : null;

  React.useEffect(() => {
    if (!isOpen || bundledScalaAssets.length > 0) return;
    let cancelled = false;
    fetch('/scales/catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error('Scala catalog unavailable');
        return response.json();
      })
      .then((value: unknown) => {
        if (cancelled || !Array.isArray(value)) return;
        const assets = value.filter((item): item is { path: string; category: string; name: string } =>
          !!item && typeof item === 'object' &&
          typeof (item as { path?: unknown }).path === 'string' &&
          typeof (item as { category?: unknown }).category === 'string' &&
          typeof (item as { name?: unknown }).name === 'string'
        );
        setBundledScalaAssets(assets);
        if (assets.length) setSelectedBundledScalaPath(assets[0].path);
      })
      .catch(() => {
        if (!cancelled) setCustomScaleMessage('A beépített Scala-könyvtár nem tölthető be.');
      });
    return () => { cancelled = true; };
  }, [isOpen, bundledScalaAssets.length]);

  const loadBundledScala = async () => {
    const asset = bundledScalaAssets.find((item) => item.path === selectedBundledScalaPath);
    if (!asset) return;
    setIsLoadingBundledScala(true);
    try {
      const response = await fetch(asset.path);
      if (!response.ok) throw new Error('Scala asset unavailable');
      const source = await response.text();
      const parsed = parseScalaScl(source, { preserveSourceOrder: true });
      const converted = parsed
        ? scalaToCustomScaleText(parsed, selectedNoteName, selectedNoteFundamentalHz, a4Ref)
        : null;
      if (!parsed || !converted) {
        setCustomScaleMessage('Ez a Scala-fájl nem alakítható át biztonságosan a kiválasztott hanghoz.');
        return;
      }
      setPendingScalaImport({ parsed, name: asset.name });
      setUseScalaReferenceAnchor(false);
      setCustomScaleNameDraft(asset.name);
      setCustomScaleTextDraft(converted);
      setCustomScaleMessage(scalaImportSuccessMessage(parsed, 'A beépített skála betöltve. Ellenőrizd, majd alkalmazd az egyedi hangmezőt.'));
    } catch {
      setCustomScaleMessage('A beépített Scala-fájl nem olvasható.');
    } finally {
      setIsLoadingBundledScala(false);
    }
  };
  const [backupMessage, setBackupMessage] = React.useState('');
  const [octaveDraft, setOctaveDraft] = React.useState(String(partialTargetOffsets.octaveCents));
  const [thirdPartialDraft, setThirdPartialDraft] = React.useState(String(partialTargetOffsets.thirdPartialCents));

  React.useEffect(() => {
    setOctaveDraft(String(partialTargetOffsets.octaveCents));
    setThirdPartialDraft(String(partialTargetOffsets.thirdPartialCents));
  }, [selectedNoteName, partialTargetOffsets.octaveCents, partialTargetOffsets.thirdPartialCents]);

  React.useEffect(() => {
    setRenameProfileDraft(activeProfile?.name ?? '');
    setCustomScaleNameDraft(activeProfile?.customScale?.name ?? '');
    setCustomScaleTextDraft(
      activeProfile?.customScale?.notes.map((note) => `${note.name}, ${note.frequencyHz?.toFixed(3) ?? ''}`).join('\n') ?? '',
    );
    setCustomScaleMessage('');
    setPendingScalaImport(null);
    setUseScalaReferenceAnchor(false);
  }, [activeInstrumentProfileId, activeProfile?.name, activeProfile?.customScale]);

  const commitOffset = (field: PartialTargetOffsetField, draft: string) => {
    const parsed = draft.trim() === '' ? 0 : Number(draft);
    if (Number.isFinite(parsed)) {
      const value = Math.max(-MAX_PARTIAL_TARGET_OFFSET_CENTS, Math.min(MAX_PARTIAL_TARGET_OFFSET_CENTS, parsed));
      onChangePartialTargetOffset(field, value);
      if (field === 'octaveCents') setOctaveDraft(String(value));
      else setThirdPartialDraft(String(value));
    } else {
      if (field === 'octaveCents') setOctaveDraft(String(partialTargetOffsets.octaveCents));
      else setThirdPartialDraft(String(partialTargetOffsets.thirdPartialCents));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-[#0e131b] border border-white/10 p-5 shadow-2xl relative text-white flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#f59e0b]" />
            <h3 className="font-bold text-sm">Beállítások & Akusztikai Profil</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-4 pr-1 flex-1 text-xs">
          {/* Physical instrument profiles */}
          <section className="p-3 rounded-xl bg-[#080b0f] border border-white/5 space-y-2.5">
            <div className="font-semibold text-slate-200">Fizikai hangszerprofil</div>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Minden handpan saját referenciahangot, hangolási profilt és felhangcélokat kap. A mérési napló megőrzi, melyik hangszerrel készült.
            </p>
            <select
              aria-label="Aktív hangszerprofil"
              value={activeInstrumentProfileId}
              onChange={(event) => onSelectInstrumentProfile(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white"
            >
              {instrumentProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                aria-label="Aktív hangszerprofil neve"
                value={renameProfileDraft}
                maxLength={80}
                onChange={(event) => setRenameProfileDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && activeProfile && renameProfileDraft.trim()) {
                    onRenameInstrumentProfile(activeProfile.id, renameProfileDraft);
                  }
                }}
                className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => activeProfile && onRenameInstrumentProfile(activeProfile.id, renameProfileDraft)}
                disabled={!activeProfile || !renameProfileDraft.trim() || renameProfileDraft.trim() === activeProfile.name}
                className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-[10px] font-semibold text-slate-200 disabled:opacity-40"
              >
                Név mentése
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                aria-label="Új hangszerprofil neve"
                value={newProfileName}
                maxLength={80}
                placeholder="Pl. D Kurd · 2026-os hangszer"
                onChange={(event) => setNewProfileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newProfileName.trim()) {
                    onCreateInstrumentProfile(newProfileName);
                    setNewProfileName('');
                  }
                }}
                className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => {
                  onCreateInstrumentProfile(newProfileName);
                  setNewProfileName('');
                }}
                disabled={!newProfileName.trim()}
                className="rounded-lg bg-[#f59e0b] px-3 py-2 text-[10px] font-bold text-slate-950 disabled:opacity-40"
              >
                + Új
              </button>
            </div>
            {instrumentProfiles.length > 1 && (
              <button
                type="button"
                onClick={() => activeProfile && onDeleteInstrumentProfile(activeProfile.id)}
                className="w-full rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-[10px] text-rose-300 hover:bg-rose-950/60"
              >
                Aktív hangszerprofil törlése
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setBackupMessage(onExportFullConfiguration()
                    ? 'A teljes Hangoal-konfiguráció mentésének letöltése elindult.'
                    : 'Nem sikerült elkészíteni a mentést.');
                }}
                className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-[10px] font-semibold text-slate-200 hover:bg-slate-700"
              >
                Teljes konfiguráció exportja
              </button>
              <label className="cursor-pointer rounded-lg border border-white/10 bg-slate-800 px-2 py-2 text-center text-[10px] font-semibold text-slate-200 hover:bg-slate-700">
                Konfiguráció importja
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  aria-label="Profilbiztonsági mentés importálása"
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    input.value = '';
                    if (!file) return;
                    try {
                      const backup: unknown = JSON.parse(await file.text());
                      const imported = onImportInstrumentProfiles(backup);
                      setBackupMessage(imported
                        ? 'A konfigurációt vagy a régebbi profilmentést beolvastam és érvényesítettem.'
                        : 'A mentés formátuma vagy valamelyik profil hibás. A meglévő profilok megmaradtak.');
                    } catch {
                      setBackupMessage('A fájl nem olvasható JSON-formátumú. A meglévő profilok megmaradtak.');
                    }
                  }}
                />
              </label>
            </div>
            {backupMessage && <p role="status" className="text-[10px] leading-relaxed text-slate-400">{backupMessage}</p>}
          </section>

          {/* A4 Reference */}
          <div className="p-3 rounded-xl bg-[#080b0f] border border-white/5">
            <div className="flex items-center justify-between font-semibold mb-2">
              <span className="text-slate-300">A4 Kamarahang Referencia:</span>
              <span className="font-mono text-[#f59e0b] font-bold text-sm">{a4Ref.toFixed(1)} Hz</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-2.5">
              {[432, 440, 442, 444].map((f) => (
                <button
                  key={f}
                  onClick={() => onChangeA4(f)}
                  className={`py-1.5 rounded-lg font-mono text-xs font-semibold border transition ${
                    a4Ref === f
                      ? 'bg-[#f59e0b] text-slate-950 border-[#f59e0b]'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f} Hz
                </button>
              ))}
            </div>

            <input
              type="range"
              min="420"
              max="450"
              step="0.5"
              value={a4Ref}
              onChange={(e) => onChangeA4(parseFloat(e.target.value))}
              className="w-full accent-[#f59e0b] h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Adjustable in-tune threshold */}
          <section className="p-3 rounded-xl bg-[#080b0f] border border-white/5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-300">Pontossági tűrés</div>
              <div className="font-mono text-[10px] text-[#f59e0b]">
                {formatTuningToleranceSetting(toleranceOverrideCents, selectedNoteFundamentalHz)}
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Csak az elfogadási jelzést állítja. A mért frekvencia és centeltérés egyik módban sem változik. A két szélső mód a referenciaalkalmazás „mindig elfogadott” és „soha nem zöld” beállítását követi.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {([
                { label: 'Auto', value: null },
                { label: '±1', value: 1 },
                { label: '±2', value: 2 },
                { label: '±5', value: 5 },
                { label: '±10', value: 10 },
                { label: 'Mindig elfogadott', value: 'always' },
                { label: 'Soha ne legyen zöld', value: 'never' },
              ] as const).map((option) => {
                const selected = toleranceOverrideCents === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChangeToleranceOverrideCents(option.value)}
                    className={`rounded-lg border px-1 py-2 text-[10px] font-semibold transition ${
                      selected
                        ? 'border-[#f59e0b] bg-[#f59e0b] text-slate-950'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Scale Selection */}
          <div className="p-3 rounded-xl bg-[#080b0f] border border-white/5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-300 mb-2">
              <Music className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Handpan Hangolási Profil:</span>
            </div>

            <div className="space-y-1.5">
              {PRESET_SCALES.map((scale) => {
                const isSelected = scale.id === selectedScaleId;
                return (
                  <button
                    key={scale.id}
                    onClick={() => onSelectScale(scale)}
                    className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-[#f59e0b]/15 border-[#f59e0b]/50 text-[#f59e0b] font-bold'
                        : 'bg-slate-900/60 border-white/5 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="text-xs">{scale.name}</div>
                      <div className="text-[10px] font-mono opacity-70 mt-0.5">
                        {scale.notes.map((n) => n.name).join(' ')}
                      </div>
                    </div>
                    {isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b] text-slate-950 font-black">AKTÍV</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exact custom targets for makers */}
          <section className="p-3 rounded-xl bg-[#080b0f] border border-white/5 space-y-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Music className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Egyedi hangmező · pontos célfrekvenciák</span>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Készítői méréshez itt minden hang saját Hz-célértéket kap. Soronként egy hang: hangnév, frekvencia Hz-ben. 2–24 sor, 20–2000 Hz.
            </p>
            <div className="space-y-2 rounded-lg border border-white/5 bg-slate-900/60 p-3">
              {pendingScalaImport?.parsed.reference && (
              <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 space-y-2">
                <label className={`flex items-start gap-2 text-[11px] font-semibold ${pendingScalaAnchor ? 'text-amber-100' : 'text-slate-400'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-amber-400"
                    checked={useScalaReferenceAnchor}
                    disabled={!pendingScalaAnchor}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      if (enabled && !pendingScalaAnchor) return;
                      const rootHz = enabled ? pendingScalaAnchor!.rootFrequencyHz : selectedNoteFundamentalHz;
                      const rootPitch = freqToNoteAndCents(rootHz, a4Ref);
                      const rootCents = Math.round(rootPitch.cents);
                      const rootLabel = enabled
                        ? rootPitch.note + (rootCents === 0 ? '' : (rootCents > 0 ? '+' : '') + rootCents + 'c')
                        : selectedNoteName;
                      const converted = scalaToCustomScaleText(pendingScalaImport.parsed, rootLabel, rootHz, a4Ref);
                      if (!converted) {
                        setCustomScaleMessage('A referenciahorgonyból számított skála kívül esik a használható frekvenciatartományon.');
                        return;
                      }
                      setUseScalaReferenceAnchor(enabled);
                      setCustomScaleTextDraft(converted);
                      setCustomScaleMessage(enabled
                        ? `A !!reference horgony aktív: ${pendingScalaAnchor!.referenceName} = ${pendingScalaAnchor!.referenceHz.toFixed(3)} Hz. A skála gyökérfrekvenciája ${rootHz.toFixed(3)} Hz; a globális A4 beállítás nem módosult.`
                        : 'A Scala-előnézet visszaállt a kiválasztott hanghoz igazított alaphangra.');
                    }}
                  />
                  <span>!!reference használata skálahorgonyként</span>
                </label>
                {pendingScalaAnchor ? (
                  <p className="text-[10px] leading-relaxed text-slate-300">
                    Referencia: <span className="font-mono text-white">{pendingScalaAnchor.referenceName} = {pendingScalaAnchor.referenceHz.toFixed(3)} Hz</span>.
                    Ebből számított skálagyökér: <span className="font-mono text-white">{pendingScalaAnchor.rootFrequencyHz.toFixed(3)} Hz</span>.
                    A jelölőnél szereplő hangot és oktávot a Scala-fájl explicit Hz értékével, vagy ennek hiányában az aktuális A4-kalibrációval oldjuk fel. A globális A4 nem íródik át.
                  </p>
                ) : (
                  <p className="text-[10px] leading-relaxed text-amber-200">
                    A referenciahorgony nem számítható ki. A jelölt fokhoz explicit Hz érték vagy szabványos hangnév szükséges; például a „Mi” címke önmagában nem határoz meg hangmagasságot.
                  </p>
                )}
                <p className="text-[9px] text-slate-500">A kapcsoló újragenerálja a skála előnézeti hanglistáját. Alkalmazás előtt ellenőrizd a frekvenciákat.</p>
              </div>
            )}
            <label className="block text-xs font-semibold text-slate-200" htmlFor="bundled-scala-select">Beépített Scala-könyvtár · {bundledScalaAssets.length} skála</label>
              <select
                id="bundled-scala-select"
                value={selectedBundledScalaPath}
                onChange={(event) => setSelectedBundledScalaPath(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
              >
                {Object.entries(bundledScalaAssets.reduce<Record<string, typeof bundledScalaAssets>>((groups, asset) => {
                  (groups[asset.category] ??= []).push(asset);
                  return groups;
                }, {})).map(([category, assets]) => (
                  <optgroup key={category} label={category}>
                    {assets.map((asset) => <option key={asset.path} value={asset.path}>{asset.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={loadBundledScala}
                disabled={!selectedBundledScalaPath || isLoadingBundledScala}
                className="w-full rounded-lg border border-[#f59e0b]/50 px-3 py-2 text-[11px] font-bold text-[#fbbf24] disabled:opacity-40"
              >
                {isLoadingBundledScala ? 'Betöltés…' : 'Beépített skála betöltése'}
              </button>
            </div>
            <label className="block rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-300 cursor-pointer hover:border-[#f59e0b]">
              Scala .scl importálása
              <span className="block text-[10px] text-slate-500 mt-1">A kiválasztott hang ({selectedNoteName}, {selectedNoteFundamentalHz.toFixed(2)} Hz) lesz az alaphang. A Scala-fájl hangközeit pontos frekvenciákká alakítja.</span>
              <input
                type="file"
                accept=".scl,text/plain"
                className="block w-full mt-2 text-[10px]"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const parsed = parseScalaScl(await file.text(), { preserveSourceOrder: true });
                    const converted = parsed
                      ? scalaToCustomScaleText(parsed, selectedNoteName, selectedNoteFundamentalHz, a4Ref)
                      : null;
                    if (!parsed || !converted) {
                      setCustomScaleMessage('A Scala-fájl hibás, vagy a skála több mint 24 használható hangot tartalmaz.');
                      return;
                    }
                    setPendingScalaImport({ parsed, name: file.name.replace(/\.scl$/i, '') });
                    setUseScalaReferenceAnchor(false);
                    setCustomScaleNameDraft(file.name.replace(/\.scl$/i, ''));
                    setCustomScaleTextDraft(converted);
                    setCustomScaleMessage(scalaImportSuccessMessage(parsed, 'A Scala-skála beolvasva. Ellenőrizd a hanglistát, majd alkalmazd az egyedi hangmezőt.'));
                  } catch {
                    setCustomScaleMessage('A Scala-fájl nem olvasható.');
                  } finally {
                    event.target.value = '';
                  }
                }}
              />
            </label>
            <input
              aria-label="Egyedi hangmező neve"
              value={customScaleNameDraft}
              maxLength={80}
              onChange={(event) => setCustomScaleNameDraft(event.target.value)}
              placeholder="Pl. Saját D Kurd"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white placeholder:text-slate-600"
            />
            <textarea
              aria-label="Egyedi hangmező frekvencia-lista"
              value={customScaleTextDraft}
              onChange={(event) => setCustomScaleTextDraft(event.target.value)}
              placeholder={"D3, 146.832\nA3, 220.000\nBb3, 233.082"}
              rows={5}
              spellCheck={false}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 font-mono text-xs leading-relaxed text-white placeholder:text-slate-600"
            />
            <button
              type="button"
              onClick={() => {
                const applied = onApplyCustomScale(customScaleNameDraft, customScaleTextDraft);
                if (applied) {
                  setPendingScalaImport(null);
                  setUseScalaReferenceAnchor(false);
                }
                setCustomScaleMessage(applied
                  ? 'Az egyedi hangmező alkalmazva és a hangszerprofilhoz mentve.'
                  : 'Hibás adatok. Ellenőrizd a hangneveket, a duplikációkat és a 20–2000 Hz közötti célfrekvenciákat.');
              }}
              disabled={!customScaleNameDraft.trim() || !customScaleTextDraft.trim()}
              className="w-full rounded-lg bg-[#f59e0b] px-3 py-2.5 text-[11px] font-bold text-slate-950 disabled:opacity-40"
            >
              Egyedi hangmező alkalmazása
            </button>
            {activeProfile?.customScale && (
              <p className="text-[10px] text-emerald-300">Aktív egyedi mező: {activeProfile.customScale.name} · {activeProfile.customScale.noteCount} hang</p>
            )}
            {customScaleMessage && (
              <p role="status" className={(['Az egyedi', 'A beépített skála betöltve', 'A Scala-skála beolvasva'].some((prefix) => customScaleMessage.startsWith(prefix))) ? 'text-[10px] text-emerald-300' : 'text-[10px] text-amber-300'}>
                {customScaleMessage}
              </p>
            )}
          </section>

          {/* Independent partial targets */}
          <div className="p-3 rounded-xl bg-[#080b0f] border border-white/5 space-y-3">
            <div>
              <div className="font-semibold text-slate-300">Egyedi felhangcélok</div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                A(z) {selectedNoteName} hang mezőjének felhangjai külön is hangolhatók.
                Az eltérések az ideális 2× és 3× frekvenciához képest értendők, és csak erre a hangra érvényesek.
              </p>
            </div>
            {([
              { field: 'octaveCents', label: 'Oktáv (2×)', multiplier: 2 as const },
              { field: 'thirdPartialCents', label: '3. parciális (3×)', multiplier: 3 as const },
            ] as const).map(({ field, label, multiplier }) => {
              const offset = partialTargetOffsets[field];
              const targetHz = partialTargetFrequency(selectedNoteFundamentalHz, multiplier, offset);
              return (
                <div key={field} className="grid grid-cols-[1fr_88px] gap-2 items-center">
                  <div>
                    <label htmlFor={field} className="block text-[11px] text-slate-300">{label}</label>
                    <div className="font-mono text-[10px] text-slate-500 mt-0.5">{targetHz.toFixed(3)} Hz célfrekvencia</div>
                  </div>
                  <div className="relative">
                    <input
                      id={field}
                      type="number"
                      min={-MAX_PARTIAL_TARGET_OFFSET_CENTS}
                      max={MAX_PARTIAL_TARGET_OFFSET_CENTS}
                      step="0.1"
                      value={field === 'octaveCents' ? octaveDraft : thirdPartialDraft}
                      onChange={(event) => {
                        if (field === 'octaveCents') setOctaveDraft(event.target.value);
                        else setThirdPartialDraft(event.target.value);
                      }}
                      onBlur={(event) => commitOffset(field, event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-right font-mono text-xs text-white"
                    />
                    <span className="absolute right-2 -bottom-3 text-[9px] text-slate-500">cent</span>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={onResetPartialTargetOffsets}
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-300 hover:bg-slate-800"
            >
              Felhangcélok visszaállítása (2× / 3×)
            </button>
          </div>

          {/* Audio device routing */}
          <section className="p-3 rounded-xl bg-[#080b0f] border border-white/5 space-y-3">
            <div>
              <div className="font-semibold text-slate-200">Hangbemenet és hangkimenet</div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                A bemenet a mikrofonméréshez, a kimenet a referenciahanghoz és a lejátszáshoz tartozik. A lista a mikrofonengedély megadása után mutatja a legtöbb eszköz nevét.
              </p>
            </div>
            <label className="block text-[10px] font-semibold text-slate-300">
              Mikrofonbemenet
              <select
                aria-label="Mikrofonbemenet kiválasztása"
                value={selectedInputDeviceId}
                disabled={isListening}
                onChange={(event) => onChangeAudioInputDevice(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white disabled:opacity-50"
              >
                <option value="">Alapértelmezett mikrofon</option>
                {audioInputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
              {isListening && (
                <span className="mt-1 block text-[10px] font-normal text-amber-300">
                  A bemenetet mérés közben nem lehet átállítani. Állítsd le a mérést a váltáshoz.
                </span>
              )}
            </label>
            <label className="block text-[10px] font-semibold text-slate-300">
              Hangkimenet
              {outputDeviceSelectionSupported ? (
                <select
                  aria-label="Hangkimenet kiválasztása"
                  value={selectedOutputDeviceId}
                  onChange={(event) => onChangeAudioOutputDevice(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white"
                >
                  <option value="">Rendszer alapértelmezett kimenete</option>
                  {audioOutputDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                  ))}
                </select>
              ) : (
                <span className="mt-1.5 block rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[10px] font-normal leading-relaxed text-slate-400">
                  A böngésző nem támogatja a programozott hangkimenet-választást. A rendszer hangútvonalát használd (például iPhone-on a Vezérlőközpontban).
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={onRefreshAudioDevices}
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:bg-slate-800"
            >
              Eszközlista frissítése
            </button>
            {audioDeviceNotice && (
              <p role="status" className="text-[10px] leading-relaxed text-amber-200">{audioDeviceNotice}</p>
            )}
          </section>

          {/* Audio Engine Info */}
          <div className="p-3 rounded-xl bg-[#080b0f] border border-white/5 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1 text-slate-300 font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
              <span>Akusztikai Mérési Környezet</span>
            </div>
            <div>{isListening ? 'Aktuális mintavételezés' : 'Legutóbbi mintavételezés'}: <span className="font-mono text-white">{sampleRateKhz !== null ? `${sampleRateKhz} kHz (Web Audio API)` : '— (a mérés indításakor jelenik meg)'}</span></div>
            <div>FFT felbontás: <span className="font-mono text-white">16384 pont + parabolikus csúcsinterpoláció</span></div>
            <div>Zajcsökkentés / visszhangszűrés: <span className="font-mono text-white">Kikapcsolva</span></div>
            <div>Automatikus erősítés (AGC): <span className="font-mono text-white">{autoGainControlStatus === null ? 'A böngésző nem közölt állapotot' : autoGainControlStatus ? 'Bekapcsolva' : 'Kikapcsolva'}</span></div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl bg-[#f59e0b] text-slate-950 font-bold text-xs hover:bg-[#d97706] transition shadow-md"
        >
          Kész / Alkalmazás
        </button>
      </div>
    </div>
  );
};
