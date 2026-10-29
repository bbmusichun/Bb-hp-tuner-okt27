import React, { useEffect, useRef, useState } from 'react';
import type { ResonanceMeasurement } from '../types/tuner';
import { inspectTargetPeak, type PeakInspection } from '../audio/peakDiagnostics';
import { bbAudioEngine as audioEngineSingleton } from '../audio/audioEngine';

interface Props {
  active: boolean;
  hasSignal: boolean;
  transientHoldoff: boolean;
  alap: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
}

interface DiagnosticRow extends PeakInspection {
  id: string;
  label: string;
}

const EMPTY_INSPECTION = (targetHz: number): PeakInspection => ({
  targetHz,
  primary: null,
  secondary: null,
  noiseFloorDb: null,
  separationCents: null,
  levelDifferenceDb: null,
  possibleDoublePeak: false,
});

function fmtHz(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(2) + ' Hz';
}

function fmtDb(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '— dB' : value.toFixed(1) + ' dB';
}

export const BBSpectrumDiagnostics: React.FC<Props> = ({
  active, hasSignal, transientHoldoff, alap, oktav, kvint,
}) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticRow[]>([]);
  const latestRef = useRef({ active, hasSignal, transientHoldoff, alap, oktav, kvint });
  latestRef.current = { active, hasSignal, transientHoldoff, alap, oktav, kvint };

  // Keep the analyser sampling and diagnostic calculation together so every result uses the current FFT frame.
  useEffect(() => {
    let raf = 0;
    let lastRun = 0;
    const loop = (now: number) => {
      const state = latestRef.current;
      if (state.active && state.hasSignal && !state.transientHoldoff && now - lastRun >= 250) {
        lastRun = now;
        const spectrum = audioEngineSingleton.getFloatFrequencyData();
        const sampleRate = audioEngineSingleton.getSampleRate();
        const targets = [
          { id: 'fundamental', label: state.alap.name || 'Alaphang', measurement: state.alap },
          { id: 'octave', label: state.oktav.name || 'Oktáv', measurement: state.oktav },
          { id: 'third-partial', label: state.kvint.name || '3. parciális', measurement: state.kvint },
        ];
        const next = targets.map(({ id, label, measurement }) => {
          const target = measurement.targetHz;
          const inspection = target !== null && Number.isFinite(target) && target > 0
            ? inspectTargetPeak(spectrum, sampleRate, target)
            : EMPTY_INSPECTION(0);
          return { id, label, ...inspection };
        });
        setDiagnostics(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="my-2 rounded-2xl border border-white/10 bg-[#0a111b] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">Spektrum-minőség ellenőrzése</h3>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
            Becsült zajpadló és közeli csúcsok. A kettős csúcs jelzés csak figyelmeztető heurisztika.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">
          {active && hasSignal ? (transientHoldoff ? 'Tranziens' : 'Élő') : 'Várakozás'}
        </span>
      </div>
      {!active || !hasSignal ? (
        <p className="mt-3 rounded-lg bg-black/20 px-3 py-3 text-xs text-slate-400">Indítsd el a mikrofont, és játssz le egy hangot a zajpadló és a közeli spektrális csúcsok vizsgálatához.</p>
      ) : transientHoldoff ? (
        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-xs text-amber-200">Az ütés tranziensét kihagyjuk; a fenntartott hangrészlet után frissül az elemzés.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {diagnostics.length === 0 ? (
            <p className="text-xs text-slate-400">Spektrumadat feldolgozása…</p>
          ) : diagnostics.map((row) => {
            const primaryDb = row.primary?.magDb ?? null;
            const contrast = primaryDb !== null && row.noiseFloorDb !== null ? primaryDb - row.noiseFloorDb : null;
            return (
              <div key={row.id} className="rounded-xl border border-white/10 bg-slate-950/40 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">{row.label}</span>
                  <span className="font-mono text-[10px] text-slate-400">Cél {fmtHz(row.targetHz)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-slate-500">Fő csúcs</div>
                    <div className="mt-0.5 font-mono text-slate-100">{fmtHz(row.primary?.freq)}</div>
                    <div className="font-mono text-slate-400">{fmtDb(primaryDb)}</div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2">
                    <div className="text-[10px] text-slate-500">Zajpadló / kontraszt</div>
                    <div className="mt-0.5 font-mono text-slate-100">{fmtDb(row.noiseFloorDb)}</div>
                    <div className="font-mono text-slate-400">{contrast === null ? '— dB' : '+' + contrast.toFixed(1) + ' dB a zaj felett'}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400">
                    {row.secondary
                      ? 'Második csúcs: ' + fmtHz(row.secondary.freq) + ' · ' + fmtDb(row.secondary.magDb) +
                        (row.separationCents !== null ? ' · ' + row.separationCents.toFixed(1) + ' cent távolság' : '')
                      : 'Nem találtunk különálló második csúcsot a keresési ablakban.'}
                  </span>
                  {row.possibleDoublePeak
                    ? <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 font-semibold text-amber-200">Lehetséges kettős csúcs</span>
                    : <span className="text-slate-500">{row.secondary ? 'Nem egyértelmű kettős csúcs' : 'Egy fő csúcs'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        A közeli csúcs származhat valódi hangszerrezonanciából, lebegésből, szobahangból vagy zajból. A diagnosztika nem módosítja a hangoló fő mérési értékeit.
      </p>
    </section>
  );
};

