import React, { useEffect, useRef, useState } from 'react';
import { bbAudioEngine } from '../audio/audioEngine';
import { findSpectralPeakInWindow } from '../audio/spectralPeak';
import { formatStrobeTargetExpression, getStrobeBandTargetHz, normalizeStrobeBands, parseStrobeTargetExpression, parseStrobeTargetExpressionParts, type StrobeBandConfig } from '../audio/strobeBands';
import { isWithinTuningTolerance, type TuningToleranceSetting } from '../audio/tuningTolerance';
import type { ReferenceToneMode } from '../audio/referenceToneModes';
import { strobeContrastFromDb, strobeSharpnessFromCents } from '../audio/strobeVisualMetrics';
import { MAX_STROBE_SENSITIVITY, MIN_STROBE_SENSITIVITY } from '../audio/strobeSensitivity';
import type { ResonanceMeasurement } from '../types/tuner';

const STORAGE_KEY = 'hangoal-custom-strobe-bands-v1';
const MAX_CUSTOM_BANDS = 8;
const ROW_HEIGHT = 38;
const BAND_COLORS = ['#f59e0b', '#22d3ee', '#c084fc', '#34d399', '#fb7185', '#60a5fa', '#eab308', '#a3e635'];

interface Props {
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  hasSignal: boolean;
  active?: boolean;
  transientHoldoff?: boolean;
  baseFrequencyHz?: number;
  toleranceOverrideCents?: TuningToleranceSetting;
  selectedRole?: string;
  onSelectRole?: (role: 'fundamental' | 'fifth' | 'octave') => void;
  strobeSensitivity?: number;
  onChangeStrobeSensitivity?: (value: number) => void;
  isMicrophoneListening?: boolean;
  selectedOutputDeviceId?: string;
  onCustomReferenceTonePlaying?: (playing: boolean) => void;
  onAudioDeviceNotice?: (message: string) => void;
}
interface Reading { measuredHz: number | null; deviationCents: number | null; amplitudeDb: number | null; }
interface Row {
  id: string; name: string; note: string; targetHz: number;
  measuredHz: number | null; cents: number | null; db: number | null;
  timestamp: number; stripeWidth: number; valid: boolean; role?: 'fundamental' | 'fifth' | 'octave';
}

function loadCustomBands(): StrobeBandConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeStrobeBands(JSON.parse(raw)).filter((band) => band.source === 'custom').slice(0, MAX_CUSTOM_BANDS);
  } catch { return []; }
}
function createBandId(): string {
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function formatCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return '— cent';
  return (cents > 0 ? '+' : '') + cents.toFixed(1) + ' cent';
}

export const BBStrobeBands: React.FC<Props> = ({
  alap, kvint, oktav, hasSignal, active = false, transientHoldoff = false,
  baseFrequencyHz = 146.832384,
  toleranceOverrideCents = null, selectedRole, onSelectRole,
  strobeSensitivity = 1, onChangeStrobeSensitivity,
  isMicrophoneListening = false,
  selectedOutputDeviceId = '',
  onCustomReferenceTonePlaying,
  onAudioDeviceNotice,
}) => {
  const [customBands, setCustomBands] = useState<StrobeBandConfig[]>(loadCustomBands);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isVisualPaused, setIsVisualPaused] = useState(false);
  const [playingCustomToneBandId, setPlayingCustomToneBandId] = useState<string | null>(null);
  const playingCustomToneBandIdRef = useRef<string | null>(null);
  const onCustomReferenceTonePlayingRef = useRef(onCustomReferenceTonePlaying);
  onCustomReferenceTonePlayingRef.current = onCustomReferenceTonePlaying;
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const lastPersistedBandsRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ alap, kvint, oktav, hasSignal, active, transientHoldoff, toleranceOverrideCents, strobeSensitivity, baseFrequencyHz, customBands, isMicrophoneListening });
  latestRef.current = { alap, kvint, oktav, hasSignal, active, transientHoldoff, toleranceOverrideCents, strobeSensitivity, baseFrequencyHz, customBands, isMicrophoneListening };
  const phasesRef = useRef<Record<string, number>>({});
  const smoothRef = useRef<Record<string, number>>({});
  const lastValidRef = useRef<Record<string, number>>({});
  const sampleRef = useRef<Record<string, number[]>>({});
  const greenSinceRef = useRef<Record<string, number | null>>({});
  const lastTickRef = useRef(performance.now());
  const lastReadoutRef = useRef(0);
  const canvasHeight = ROW_HEIGHT * (3 + customBands.length);
  const hasCustomSignal = active && hasSignal && !transientHoldoff;

  useEffect(() => {
    const reload = () => setCustomBands(loadCustomBands());
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) reload(); };
    window.addEventListener('hangoal-custom-strobe-bands-updated', reload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('hangoal-custom-strobe-bands-updated', reload);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const stopCustomReferenceTone = () => {
    if (playingCustomToneBandIdRef.current === null) return;
    playingCustomToneBandIdRef.current = null;
    setPlayingCustomToneBandId(null);
    bbAudioEngine.stopTone();
    onCustomReferenceTonePlaying?.(false);
  };

  useEffect(() => {
    try {
      const serialized = JSON.stringify(customBands);
      localStorage.setItem(STORAGE_KEY, serialized);
      if (lastPersistedBandsRef.current !== serialized) {
        lastPersistedBandsRef.current = serialized;
        window.dispatchEvent(new Event('hangoal-custom-strobe-bands-updated'));
      }
    } catch (error) { console.warn('Nem sikerült menteni az egyedi stroboszkópsávokat:', error); }
  }, [customBands]);

  useEffect(() => {
    const playingBand = customBands.find((band) => band.id === playingCustomToneBandId);
    if (playingCustomToneBandId !== null && (isMicrophoneListening || !playingBand || !playingBand.enabled || playingBand.referenceToneMode !== 'continuous')) {
      stopCustomReferenceTone();
    }
  }, [customBands, isMicrophoneListening, baseFrequencyHz, playingCustomToneBandId]);

  useEffect(() => {
    const stopFromParent = () => stopCustomReferenceTone();
    window.addEventListener('hangoal-stop-custom-reference-tone', stopFromParent);
    return () => window.removeEventListener('hangoal-stop-custom-reference-tone', stopFromParent);
  }, []);

  useEffect(() => () => {
    if (playingCustomToneBandIdRef.current !== null) {
      playingCustomToneBandIdRef.current = null;
      bbAudioEngine.stopTone();
      onCustomReferenceTonePlayingRef.current?.(false);
    }
  }, []);

  useEffect(() => {
    if (isVisualPaused) return;
    let animationId = 0;
    lastTickRef.current = performance.now();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const render = (now: number) => {
      const current = latestRef.current;
      const dt = Math.min(0.1, Math.max(0, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      const width = canvas.width;
      const rowHeight = canvas.height / Math.max(1, 3 + current.customBands.length);
      const spectrum = current.active && current.hasSignal && !current.transientHoldoff ? bbAudioEngine.getFloatFrequencyData() : null;
      const sampleRate = bbAudioEngine.getSampleRate();
      const builtIns: Row[] = [
        { id: 'fifth', name: 'Kvint · 3×', note: current.kvint.noteName || 'A4', targetHz: current.kvint.targetHz ?? current.baseFrequencyHz * 3, measuredHz: current.kvint.measuredHz, cents: current.kvint.deviationCents, db: current.kvint.amplitudeDb, timestamp: current.kvint.timestampMs, stripeWidth: 34, valid: current.hasSignal && current.kvint.status === 'valid', role: 'fifth' },
        { id: 'octave', name: 'Oktáv · 2×', note: current.oktav.noteName || 'D4', targetHz: current.oktav.targetHz ?? current.baseFrequencyHz * 2, measuredHz: current.oktav.measuredHz, cents: current.oktav.deviationCents, db: current.oktav.amplitudeDb, timestamp: current.oktav.timestampMs, stripeWidth: 54, valid: current.hasSignal && current.oktav.status === 'valid', role: 'octave' },
        { id: 'fundamental', name: 'Alap · 1×', note: current.alap.noteName || 'D3', targetHz: current.alap.targetHz ?? current.baseFrequencyHz, measuredHz: current.alap.measuredHz, cents: current.alap.deviationCents, db: current.alap.amplitudeDb, timestamp: current.alap.timestampMs, stripeWidth: 20, valid: current.hasSignal && current.alap.status === 'valid', role: 'fundamental' },
      ];
      const extras: Row[] = current.customBands.map((band, index) => {
        const targetHz = getStrobeBandTargetHz(band, current.baseFrequencyHz);
        const peak = spectrum ? findSpectralPeakInWindow(targetHz, 150, spectrum, sampleRate, -82) : null;
        const measuredHz = peak && Number.isFinite(peak.freq) && peak.freq > 0 ? peak.freq : null;
        const cents = measuredHz === null ? null : 1200 * Math.log2(measuredHz / targetHz);
        return {
          id: band.id, name: band.name, note: formatStrobeTargetExpression(band), targetHz,
          measuredHz, cents, db: peak?.magDb ?? null, timestamp: now,
          stripeWidth: 18 + (index % 3) * 9,
          valid: Boolean(band.enabled && spectrum && (!current.active || !current.transientHoldoff) && cents !== null),
        };
      });
      const rows = [...builtIns, ...extras];
      ctx.clearRect(0, 0, width, canvas.height);
      const nextReadings: Record<string, Reading> = {};
      rows.forEach((row, index) => {
        const y = index * rowHeight;
        const key = row.id;
        if (row.valid && row.cents !== null && Number.isFinite(row.cents)) {
          lastValidRef.current[key] = now;
          if (smoothRef.current[key] === undefined) smoothRef.current[key] = row.cents;
          smoothRef.current[key] += (row.cents - smoothRef.current[key]) * 0.15;
          sampleRef.current[key] ??= [];
          if (sampleRef.current[key].length >= 15) sampleRef.current[key].shift();
          sampleRef.current[key].push(row.cents);
        }
        const lastValid = lastValidRef.current[key] ?? 0;
        const held = !row.valid && now - lastValid <= 250;
        const centsForMotion = row.valid || held ? (smoothRef.current[key] ?? row.cents ?? 0) : 0;
        const speed = row.valid || held
          ? Math.max(-220, Math.min(220, row.targetHz * (Math.pow(2, centsForMotion / 1200) - 1) * 65 * current.strobeSensitivity))
          : 0;
        phasesRef.current[key] = (phasesRef.current[key] ?? 0) + speed * dt;
        const contrast = strobeContrastFromDb(row.valid ? row.db : null);
        const sharpness = strobeSharpnessFromCents(sampleRef.current[key] ?? []);
        const inTolerance = row.valid && isWithinTuningTolerance(row.cents, row.targetHz, current.toleranceOverrideCents);
        if (inTolerance) greenSinceRef.current[key] ??= now;
        else greenSinceRef.current[key] = null;
        const green = inTolerance && greenSinceRef.current[key] !== null && now - (greenSinceRef.current[key] ?? now) >= 1000;
        const near = inTolerance && !green;
        const stripeWidth = row.stripeWidth;
        const period = stripeWidth * 2;
        const offset = ((phasesRef.current[key] % period) + period) % period;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, y + 2, width, Math.max(1, rowHeight - 4), 6);
        ctx.clip();
        ctx.fillStyle = '#120507';
        ctx.fillRect(0, y + 2, width, rowHeight - 4);
        const stripeBase = green ? '#147a48' : near ? '#a36b16' : '#a8323c';
        const stripeLight = green ? '#31d889' : near ? '#e4ad43' : '#c44852';
        ctx.globalAlpha = 0.18 + 0.82 * contrast;
        const edge = 0.12 + (1 - sharpness) * 0.22;
        for (let x = -period + offset; x < width + period; x += period) {
          const grad = ctx.createLinearGradient(x, y, x + stripeWidth, y);
          grad.addColorStop(0, '#1e080b');
          grad.addColorStop(edge, stripeLight);
          grad.addColorStop(1 - edge, stripeBase);
          grad.addColorStop(1, '#1e080b');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y + 2, stripeWidth, rowHeight - 4);
        }
        ctx.globalAlpha = 1;
        const centerX = width / 2;
        const glow = ctx.createRadialGradient(centerX, y + rowHeight / 2, 0, centerX, y + rowHeight / 2, 16);
        glow.addColorStop(0, green ? 'rgba(255,255,255,.48)' : 'rgba(255,230,200,.45)');
        glow.addColorStop(1, 'rgba(255,100,100,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(centerX - 16, y + 2, 32, rowHeight - 4);
        ctx.fillStyle = green ? '#eafff2' : '#ffeedd';
        ctx.fillRect(centerX - 1, y + 2, 2, rowHeight - 4);
        ctx.restore();
        nextReadings[key] = { measuredHz: row.measuredHz, deviationCents: row.cents, amplitudeDb: row.db };
      });
      if (now - lastReadoutRef.current >= 120) { lastReadoutRef.current = now; setReadings(nextReadings); }
      animationId = requestAnimationFrame(render);
    };
    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [canvasHeight, isVisualPaused]);

  useEffect(() => {
    // A new tuning target makes the frozen picture obsolete; return to live tracking.
    setIsVisualPaused(false);
  }, [baseFrequencyHz, alap.targetHz, kvint.targetHz, oktav.targetHz]);

  const updateBand = (id: string, patch: Partial<StrobeBandConfig>) => {
    if (playingCustomToneBandIdRef.current === id) stopCustomReferenceTone();
    setCustomBands((previous) => normalizeStrobeBands(previous.map((band) => band.id === id ? { ...band, ...patch } : band))
      .filter((band) => band.source === 'custom').slice(0, MAX_CUSTOM_BANDS));
  };

  const toggleCustomReferenceTone = async (band: StrobeBandConfig) => {
    if (band.referenceToneMode !== 'continuous' || isMicrophoneListening) return;
    if (playingCustomToneBandIdRef.current === band.id) {
      stopCustomReferenceTone();
      return;
    }
    if (playingCustomToneBandIdRef.current !== null) stopCustomReferenceTone();
    const targetHz = getStrobeBandTargetHz(band, baseFrequencyHz);
    if (!Number.isFinite(targetHz) || targetHz <= 0) return;
    if (selectedOutputDeviceId && bbAudioEngine.supportsOutputDeviceSelection()) {
      const outputApplied = await bbAudioEngine.setOutputDevice(selectedOutputDeviceId);
      if (!outputApplied) onAudioDeviceNotice?.('A mentett hangkimenet nem érhető el; a rendszer alapértelmezett kimenetét használom.');
    }
    const latestBand = latestRef.current.customBands.find((candidate) => candidate.id === band.id);
    if (latestRef.current.isMicrophoneListening || !latestBand || !latestBand.enabled || latestBand.referenceToneMode !== 'continuous') return;
    const latestTargetHz = getStrobeBandTargetHz(latestBand, latestRef.current.baseFrequencyHz);
    if (!Number.isFinite(latestTargetHz) || latestTargetHz <= 0) return;
    playingCustomToneBandIdRef.current = band.id;
    setPlayingCustomToneBandId(band.id);
    bbAudioEngine.playTone(latestTargetHz);
    onCustomReferenceTonePlaying?.(true);
  };
  const addBand = () => {
    if (customBands.length >= MAX_CUSTOM_BANDS) return;
    setCustomBands((previous) => [...previous, {
      id: createBandId(), name: 'Egyedi sáv ' + (previous.length + 1), source: 'custom',
      targetHz: Math.max(20, Math.min(20000, baseFrequencyHz * 1.5)), centsOffset: 0, enabled: true, referenceToneMode: 'off',
    }]);
    setIsEditorOpen(true);
  };
  const deleteBand = (id: string) => {
    if (playingCustomToneBandIdRef.current === id) stopCustomReferenceTone();
    setCustomBands((previous) => previous.filter((band) => band.id !== id));
    setReadings((previous) => { const next = { ...previous }; delete next[id]; return next; });
  };

  const builtInLabels = [
    { id: 'fifth', name: 'Kvint · 3×', note: kvint.noteName || 'A4', color: '#c084fc', role: 'fifth' as const },
    { id: 'octave', name: 'Oktáv · 2×', note: oktav.noteName || 'D4', color: '#38bdf8', role: 'octave' as const },
    { id: 'fundamental', name: 'Alap · 1×', note: alap.noteName || 'D3', color: '#f59e0b', role: 'fundamental' as const },
  ];

  return (
    <section className="my-2 rounded-2xl border border-white/10 bg-[#0b111b] p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Stroboszkóp</h3>
          <p className="mt-0.5 text-[10px] text-slate-400">Felül kvint, középen oktáv, alul alap. A további sávok is ebben a nézetben jelennek meg.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!isVisualPaused) setIsEditorOpen(false);
              setIsVisualPaused(!isVisualPaused);
            }}
            aria-pressed={isVisualPaused}
            aria-label={isVisualPaused ? 'Stroboszkóp élő megjelenítésének folytatása' : 'Stroboszkóp vizuális megjelenítésének szüneteltetése'}
            className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${
              isVisualPaused
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                : 'border-slate-700 bg-slate-900/70 text-slate-300'
            }`}
          >
            {isVisualPaused ? 'Folytatás' : 'Szünet'}
          </button>
          <button type="button" onClick={() => setIsEditorOpen((open) => !open)} aria-expanded={isEditorOpen}
            disabled={isVisualPaused}
            className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-xs font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40">
            {isEditorOpen ? 'Szerkesztés bezárása' : 'Sávok szerkesztése'}
          </button>
        </div>
      </div>

      {isVisualPaused && (
        <div role="status" aria-live="polite" className="mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[10px] leading-relaxed text-amber-100">
          A stroboszkóp képe rögzítve. A mikrofon és a háttérben futó hangmérés tovább működik. Új hangcél kiválasztásakor az élő megjelenítés automatikusan folytatódik.
        </div>
      )}
      <div className="flex w-full items-stretch gap-2">
        <div className="flex w-[78px] shrink-0 flex-col select-none" style={{ height: canvasHeight }}>
          {builtInLabels.map((row) => (
            <button key={row.id} style={{ height: ROW_HEIGHT }} onClick={() => onSelectRole?.(row.role)}
              className={'flex flex-col justify-center items-start leading-tight hover:opacity-80 transition ' + (selectedRole === row.role ? 'opacity-100' : 'opacity-90')}>
              <span className="text-[11px] font-semibold text-white/90">{row.name}</span>
              <span className="text-[10px] font-mono font-medium" style={{ color: row.color }}>{row.note}</span>
            </button>
          ))}
          {customBands.map((band, index) => (
            <div key={band.id} style={{ height: ROW_HEIGHT }} className="flex flex-col justify-center leading-tight overflow-hidden">
              <span className="truncate text-[11px] font-semibold text-white/80">{band.name || 'Egyedi sáv ' + (index + 1)}</span>
              <span className="truncate text-[10px] font-mono text-slate-400">{formatStrobeTargetExpression(band)}</span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-white/5 shadow-inner">
          <canvas ref={canvasRef} width={600} height={canvasHeight}
            aria-label={isVisualPaused ? 'Rögzített stroboszkóp-kép; a hangmérés tovább fut' : 'A kvint, oktáv, alap és további frekvenciák egyetlen élő stroboszkópos nézetben'}
            className="block w-full" style={{ height: canvasHeight }} />
        </div>
      </div>

      {customBands.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
          {customBands.map((band, index) => {
            const reading = readings[band.id];
            const valid = band.enabled && (isVisualPaused
              ? reading?.deviationCents !== null && reading?.deviationCents !== undefined
              : hasCustomSignal && reading?.deviationCents !== null && reading?.deviationCents !== undefined);
            return <span key={band.id} className="font-mono">
              <span style={{ color: BAND_COLORS[index % BAND_COLORS.length] }}>{band.name}: </span>
              {valid && reading?.measuredHz !== null && reading?.measuredHz !== undefined
                ? reading.measuredHz.toFixed(2) + ' Hz · ' + formatCents(reading.deviationCents)
                : '— · mikrofonos mérésre vár'}
            </span>;
          })}
        </div>
      )}

      {isEditorOpen && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-slate-950/70 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-white">Sávok szerkesztése</h4>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">A három alap sáv állandó. Az új sávok az alap alá kerülnek, és ugyanebben a stroboszkópban jelennek meg.</p>
            </div>
            <button type="button" onClick={addBand} disabled={customBands.length >= MAX_CUSTOM_BANDS}
              className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-xs font-semibold text-amber-200 disabled:opacity-40">+ Új sáv</button>
          </div>
          {customBands.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-400">Nincs további sáv. A három alap sáv használatra kész.</p>
          ) : customBands.map((band, index) => {
            const reading = readings[band.id];
            const targetHz = getStrobeBandTargetHz(band, baseFrequencyHz);
            const measured = reading?.measuredHz ?? null;
            const cents = reading?.deviationCents ?? null;
            const valid = band.enabled && hasCustomSignal && cents !== null;
            const inTolerance = valid && isWithinTuningTolerance(cents, targetHz, toleranceOverrideCents);
            return (
              <div key={band.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: BAND_COLORS[index % BAND_COLORS.length] }} />
                  <label className="min-w-0 flex-1 text-[10px] text-slate-400">Név
                    <input aria-label="Sáv neve" type="text" maxLength={48} value={band.name}
                      onChange={(event) => { const value = event.target.value.slice(0, 48); if (value.trim()) updateBand(band.id, { name: value }); }}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-400" />
                  </label>
                  <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-400">
                    <input aria-label={band.name + ' bekapcsolása'} type="checkbox" checked={band.enabled}
                      onChange={(event) => updateBand(band.id, { enabled: event.target.checked })} className="accent-amber-400" />Aktív
                  </label>
                  <button type="button" onClick={() => deleteBand(band.id)} aria-label={band.name + ' törlése'}
                    className="rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10">Törlés</button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="min-w-0 text-[10px] text-slate-400">Cél (Hz / arány / cent)
                    <input aria-label="Célfrekvencia vagy arány" type="text" inputMode="decimal"
                      value={targetDrafts[band.id] ?? formatStrobeTargetExpression(band)}
                      onChange={(event) => {
                        const draft = event.target.value;
                        setTargetDrafts((previous) => ({ ...previous, [band.id]: draft }));
                        const parsed = parseStrobeTargetExpressionParts(draft);
                        const value = parseStrobeTargetExpression(draft, baseFrequencyHz);
                        if (parsed && value !== null) updateBand(band.id, { targetHz: value, targetMode: parsed.mode, targetValue: parsed.mode === 'absolute' ? undefined : parsed.value });
                      }}
                      onBlur={() => setTargetDrafts((previous) => { const next = { ...previous }; delete next[band.id]; return next; })}
                      placeholder="440 / 3/2 / 702c"
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-amber-400" />
                  </label>
                  <label className="min-w-0 text-[10px] text-slate-400">Referenciahang
                    <select
                      aria-label={band.name + ' referenciahang módja'}
                      value={band.referenceToneMode ?? 'off'}
                      onChange={(event) => updateBand(band.id, { referenceToneMode: event.target.value as ReferenceToneMode })}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                    >
                      <option value="off">Kikapcsolva</option>
                      <option value="continuous">Folyamatos</option>
                      <option value="strike">Ütésre · 120 ms</option>
                    </select>
                  </label>
                  <label className="min-w-0 text-[10px] text-slate-400">Korrekció (cent)
                    <input aria-label="Centkorrekció" type="number" min={-1200} max={1200} step="0.1" value={band.centsOffset}
                      onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= -1200 && value <= 1200) updateBand(band.id, { centsOffset: value }); }}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-amber-400" />
                  </label>
                </div>
                {band.referenceToneMode === 'continuous' && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={isMicrophoneListening || !band.enabled}
                      onClick={() => void toggleCustomReferenceTone(band)}
                      aria-pressed={playingCustomToneBandId === band.id}
                      className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {playingCustomToneBandId === band.id ? 'Hang leállítása' : 'Referenciahang lejátszása'}
                    </button>
                    <span className="text-[9px] text-slate-500">
                      {isMicrophoneListening ? 'Mikrofonmérés közben nem indítható.' : 'A kiválasztott célfrekvencián szól.'}
                    </span>
                  </div>
                )}
                {band.referenceToneMode === 'strike' && (
                  <p className="mt-2 text-[10px] text-cyan-200">Engedélyezett ütéskor ez a sáv 120 ms-os referenciahangot ad. Több kijelölt sáv együtt, egy korlátozott hangszinten szól.</p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-black/25 px-2.5 py-2 font-mono text-[11px]">
                  <span className="text-slate-400">Cél: {targetHz.toFixed(3)} Hz</span>
                  <span className="text-white">{valid && measured !== null ? measured.toFixed(3) + ' Hz' : '— Hz'}</span>
                  <span className={valid ? (inTolerance ? 'text-emerald-300' : 'text-amber-300') : 'text-slate-500'}>
                    {valid ? formatCents(cents) : active && transientHoldoff ? 'Ütés utáni várakozás' : active && hasSignal ? 'Nincs megbízható csúcs' : 'Mérésre vár'}
                  </span>
                </div>
                {valid && reading?.amplitudeDb !== null && reading?.amplitudeDb !== undefined && <div className="mt-1 text-right text-[10px] text-slate-500">Csúcs: {reading.amplitudeDb.toFixed(1)} dB (FFT-becslés)</div>}
              </div>
            );
          })}
          {customBands.length >= MAX_CUSTOM_BANDS && <p className="text-[10px] text-amber-300">Legfeljebb {MAX_CUSTOM_BANDS} további sáv adható hozzá.</p>}
          <p className="text-[10px] leading-relaxed text-slate-500">Az egyedi sávok az aktív jelforrást követik: mikrofonos mérést vagy lejátszott felvétel elemzését. A cél Hz-ben, arányként (például 3/2), vagy centértékként adható meg.</p>
        </div>
      )}

      <div className="mt-3 rounded-xl border border-white/10 bg-[#0b111b] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="hangoal-strobe-sensitivity" className="text-[11px] font-semibold text-slate-200">Stroboszkóp sodródási érzékenysége</label>
          <span className="shrink-0 font-mono text-[11px] text-amber-200">{strobeSensitivity.toFixed(2)}×</span>
        </div>
        <input id="hangoal-strobe-sensitivity" aria-label="Stroboszkóp sodródási érzékenysége" type="range"
          min={MIN_STROBE_SENSITIVITY} max={MAX_STROBE_SENSITIVITY} step="0.25" value={strobeSensitivity}
          onChange={(event) => onChangeStrobeSensitivity?.(Number(event.target.value))}
          className="mt-2 w-full cursor-pointer accent-amber-400" />
        <div className="flex justify-between text-[9px] text-slate-500"><span>Finomabb mozgás</span><span>Gyorsabb mozgás</span></div>
      </div>
    </section>
  );
};

export default BBStrobeBands;
