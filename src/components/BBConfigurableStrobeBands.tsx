import React, { useEffect, useRef, useState } from 'react';
import { bbAudioEngine } from '../audio/audioEngine';
import { findSpectralPeakInWindow } from '../audio/spectralPeak';
import { getStrobeBandTargetHz, normalizeStrobeBands, type StrobeBandConfig } from '../audio/strobeBands';
import { tuningToleranceCents } from '../audio/tuningTolerance';

const STORAGE_KEY = 'hangoal-custom-strobe-bands-v1';
const MAX_CUSTOM_BANDS = 8;
const ROW_HEIGHT = 38;
const BAND_COLORS = ['#f59e0b', '#22d3ee', '#c084fc', '#34d399', '#fb7185', '#60a5fa', '#eab308', '#a3e635'];

interface Props {
  active: boolean;
  hasSignal: boolean;
  transientHoldoff: boolean;
  toleranceOverrideCents?: number | null;
}

interface BandReading {
  measuredHz: number | null;
  deviationCents: number | null;
  amplitudeDb: number | null;
}

function loadCustomBands(): StrobeBandConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeStrobeBands(JSON.parse(raw))
      .filter((band) => band.source === 'custom')
      .slice(0, MAX_CUSTOM_BANDS);
  } catch {
    return [];
  }
}

function createBandId(): string {
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function formatCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return '— cent';
  return (cents > 0 ? '+' : '') + cents.toFixed(1) + ' cent';
}

export const BBConfigurableStrobeBands: React.FC<Props> = ({
  active,
  hasSignal,
  transientHoldoff,
  toleranceOverrideCents = null,
}) => {
  const [bands, setBands] = useState<StrobeBandConfig[]>(loadCustomBands);
  const [readings, setReadings] = useState<Record<string, BandReading>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ bands, active, hasSignal, transientHoldoff, toleranceOverrideCents });
  latestRef.current = { bands, active, hasSignal, transientHoldoff, toleranceOverrideCents };
  const phasesRef = useRef<Record<string, number>>({});
  const lastTickRef = useRef(performance.now());
  const lastReadoutRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bands));
    } catch (error) {
      console.warn('Nem sikerült menteni az egyedi stroboszkópsávokat:', error);
    }
  }, [bands]);

  useEffect(() => {
    let animationId = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const render = (now: number) => {
      const current = latestRef.current;
      const dt = Math.min(0.1, Math.max(0, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      const width = canvas.width;
      const height = canvas.height;
      const rowHeight = current.bands.length > 0 ? height / current.bands.length : ROW_HEIGHT;
      const spectrum = current.active && current.hasSignal && !current.transientHoldoff
        ? bbAudioEngine.getFloatFrequencyData()
        : null;
      const sampleRate = bbAudioEngine.getSampleRate();
      const nextReadings: Record<string, BandReading> = {};

      ctx.clearRect(0, 0, width, height);
      current.bands.forEach((band, index) => {
        const y = index * rowHeight;
        const targetHz = getStrobeBandTargetHz(band);
        const peak = spectrum
          ? findSpectralPeakInWindow(targetHz, 150, spectrum, sampleRate, -82)
          : null;
        const measuredHz = peak && Number.isFinite(peak.freq) && peak.freq > 0 ? peak.freq : null;
        const rawCents = measuredHz === null ? null : 1200 * Math.log2(measuredHz / targetHz);
        const deviationCents = rawCents !== null && Number.isFinite(rawCents) ? rawCents : null;
        nextReadings[band.id] = {
          measuredHz,
          deviationCents,
          amplitudeDb: peak?.magDb ?? null,
        };

        const previousPhase = phasesRef.current[band.id] ?? 0;
        const valid = band.enabled && current.active && current.hasSignal &&
          !current.transientHoldoff && deviationCents !== null;
        const speed = valid
          ? Math.max(-220, Math.min(220, targetHz * (Math.pow(2, (deviationCents ?? 0) / 1200) - 1) * 65))
          : 0;
        const phase = previousPhase + speed * dt;
        phasesRef.current[band.id] = phase;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, y + 2, width, Math.max(1, rowHeight - 4), 6);
        ctx.clip();
        ctx.fillStyle = '#120507';
        ctx.fillRect(0, y + 2, width, rowHeight - 4);

        if (band.enabled) {
          const tolerance = tuningToleranceCents(targetHz, current.toleranceOverrideCents);
          const inTolerance = valid && Math.abs(deviationCents ?? Infinity) <= tolerance;
          const color = inTolerance ? '#147a48' : valid ? '#a8323c' : '#3b2630';
          const light = inTolerance ? '#31d889' : valid ? '#c44852' : '#60414a';
          const stripeWidth = 18 + (index % 3) * 9;
          const period = stripeWidth * 2;
          const offset = ((phase % period) + period) % period;
          for (let x = -period + offset; x < width + period; x += period) {
            const gradient = ctx.createLinearGradient(x, y, x + stripeWidth, y);
            gradient.addColorStop(0, '#1e080b');
            gradient.addColorStop(0.2, light);
            gradient.addColorStop(0.8, color);
            gradient.addColorStop(1, '#1e080b');
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y + 2, stripeWidth, rowHeight - 4);
          }
          ctx.fillStyle = inTolerance ? '#eafff2' : '#ffeedd';
          ctx.fillRect(width / 2 - 1, y + 2, 2, rowHeight - 4);
        } else {
          ctx.fillStyle = '#334155';
          ctx.fillRect(0, y + 2, width, rowHeight - 4);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(width / 2 - 1, y + 2, 2, rowHeight - 4);
        }
        ctx.restore();
      });

      if (now - lastReadoutRef.current >= 120) {
        lastReadoutRef.current = now;
        setReadings(nextReadings);
      }
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [bands.length]);

  const updateBand = (id: string, patch: Partial<StrobeBandConfig>) => {
    setBands((previous) => normalizeStrobeBands(
      previous.map((band) => band.id === id ? { ...band, ...patch } : band),
    ).filter((band) => band.source === 'custom').slice(0, MAX_CUSTOM_BANDS));
  };

  const addBand = () => {
    if (bands.length >= MAX_CUSTOM_BANDS) return;
    const band: StrobeBandConfig = {
      id: createBandId(),
      name: 'Egyedi sáv ' + (bands.length + 1),
      source: 'custom',
      targetHz: 440,
      centsOffset: 0,
      enabled: true,
    };
    setBands((previous) => [...previous, band]);
  };

  const deleteBand = (id: string) => {
    setBands((previous) => previous.filter((band) => band.id !== id));
    setReadings((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const canvasHeight = Math.max(ROW_HEIGHT, bands.length * ROW_HEIGHT);

  return (
    <section className="my-3 rounded-2xl border border-white/10 bg-[#0b111b] p-3 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Egyedi stroboszkópsávok</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            Saját célfrekvencia és cent-korrekció. A csúcsot a mikrofon élő FFT-spektrumából keresi.
          </p>
        </div>
        <button
          type="button"
          onClick={addBand}
          disabled={bands.length >= MAX_CUSTOM_BANDS}
          className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-xs font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Új sáv
        </button>
      </div>

      {bands.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-400">
          Még nincs egyedi sáv. Hozz létre például egy 440 Hz-es vagy más, általad kiválasztott frekvenciájú mérést.
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-hidden rounded-lg border border-white/5">
            <canvas
              ref={canvasRef}
              width={600}
              height={canvasHeight}
              aria-label="Egyedi frekvenciák élő stroboszkópos megjelenítése"
              className="block h-auto w-full"
            />
          </div>
          <div className="mt-3 space-y-3">
            {bands.map((band, index) => {
              const reading = readings[band.id];
              const targetHz = getStrobeBandTargetHz(band);
              const measured = reading?.measuredHz ?? null;
              const cents = reading?.deviationCents ?? null;
              const valid = band.enabled && active && hasSignal && !transientHoldoff && cents !== null;
              const inTolerance = valid && Math.abs(cents ?? Infinity) <= tuningToleranceCents(targetHz, toleranceOverrideCents);
              return (
                <div key={band.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: BAND_COLORS[index % BAND_COLORS.length] }} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">{band.name || 'Egyedi sáv ' + (index + 1)}</span>
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <input
                        aria-label={band.name + ' bekapcsolása'}
                        type="checkbox"
                        checked={band.enabled}
                        onChange={(event) => updateBand(band.id, { enabled: event.target.checked })}
                        className="accent-amber-400"
                      />
                      Aktív
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteBand(band.id)}
                      aria-label={band.name + ' törlése'}
                      className="rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                    >
                      Törlés
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="min-w-0 text-[10px] text-slate-400">
                      Név
                      <input
                        aria-label="Sáv neve"
                        type="text"
                        maxLength={48}
                        value={band.name}
                        onChange={(event) => {
                          const value = event.target.value.slice(0, 48);
                          if (value.trim()) updateBand(band.id, { name: value });
                        }}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="min-w-0 text-[10px] text-slate-400">
                      Cél (Hz)
                      <input
                        aria-label="Célfrekvencia Hz"
                        type="number"
                        min={20}
                        max={20000}
                        step="0.01"
                        value={band.targetHz}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isFinite(value) && value >= 20 && value <= 20000) updateBand(band.id, { targetHz: value });
                        }}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="min-w-0 text-[10px] text-slate-400">
                      Korrekció (cent)
                      <input
                        aria-label="Centkorrekció"
                        type="number"
                        min={-1200}
                        max={1200}
                        step="0.1"
                        value={band.centsOffset}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isFinite(value) && value >= -1200 && value <= 1200) updateBand(band.id, { centsOffset: value });
                        }}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-amber-400"
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-black/25 px-2.5 py-2 font-mono text-[11px]">
                    <span className="text-slate-400">Cél: {targetHz.toFixed(3)} Hz</span>
                    <span className="text-white">{valid && measured !== null ? measured.toFixed(3) + ' Hz' : '— Hz'}</span>
                    <span className={valid ? (inTolerance ? 'text-emerald-300' : 'text-amber-300') : 'text-slate-500'}>
                      {valid ? formatCents(cents) : active && transientHoldoff ? 'Ütés utáni várakozás' : active && hasSignal ? 'Nincs megbízható csúcs' : 'Mérésre vár'}
                    </span>
                  </div>
                  {valid && reading?.amplitudeDb !== null && reading?.amplitudeDb !== undefined && (
                    <div className="mt-1 text-right text-[10px] text-slate-500">Csúcs: {reading.amplitudeDb.toFixed(1)} dB (FFT-becslés)</div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Az alacsony frekvenciák pontosságát az FFT felbontása, a jelszint és a hang lecsengése korlátozza. A kijelzés külső referenciaeszközzel végzett akusztikai ellenőrzést igényel.
          </p>
        </>
      )}
      {bands.length >= MAX_CUSTOM_BANDS && <p className="mt-2 text-[10px] text-amber-300">Legfeljebb {MAX_CUSTOM_BANDS} egyedi sáv adható hozzá.</p>}
    </section>
  );
};
