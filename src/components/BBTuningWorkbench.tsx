import React, { useEffect, useRef, useState } from 'react';
import type { ResonanceMeasurement, StrikeSessionSummary, TuningLogEntry } from '../types/tuner';
import { isWithinTuningTolerance } from '../audio/tuningTolerance';
import type { TuningToleranceSetting } from '../audio/tuningTolerance';
import { getStrikeRejectionReason, isStrikePointValid, summarizeStrikeSamples, type StrikePoint, type StrikeSample } from '../audio/multiStrikeSession';

interface Props {
  noteName: string;
  previous: TuningLogEntry | null;
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  toleranceOverrideCents: TuningToleranceSetting;
  canCapture: boolean;
  onCapture: () => void;
  transientHoldoff: boolean;
  sessionKey: string;
  onSaveStrikeSession: (summary: StrikeSessionSummary, samples: StrikeSample[]) => void;
}

type Mode = {
  key: 'fundamental' | 'fifth' | 'octave';
  label: string;
  current: ResonanceMeasurement;
  previousCents: number | null;
  previousTargetHz: number | null;
};

function formatCents(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} c`;
}

function comparisonText(current: number, previous: number): { text: string; improved: boolean | null } {
  const movement = current - previous;
  if (Math.abs(movement) < 0.1) return { text: 'Érdemben nem változott', improved: null };
  const improved = Math.abs(current) < Math.abs(previous);
  return {
    text: `${improved ? 'Közelebb a célhoz' : 'Távolabb a céltól'} · ${movement > 0 ? '+' : ''}${movement.toFixed(1)} c`,
    improved,
  };
}

/**
 * Workshop-oriented tuning snapshot: records the live three-mode result and
 * compares it with the latest saved snapshot for the same instrument/note.
 * It deliberately describes measured movement; it does not prescribe hammering.
 */
export const BBTuningWorkbench: React.FC<Props> = ({
  noteName,
  previous,
  alap,
  kvint,
  oktav,
  toleranceOverrideCents,
  canCapture,
  onCapture,
  transientHoldoff,
  sessionKey,
  onSaveStrikeSession,
}) => {
  const [strikeSamples, setStrikeSamples] = useState<StrikeSample[]>([]);
  const [sawFreshStrike, setSawFreshStrike] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const previousTransientHoldoffRef = useRef(transientHoldoff);

  useEffect(() => {
    setStrikeSamples([]);
    setSawFreshStrike(false);
    setSessionActive(false);
  }, [sessionKey]);

  useEffect(() => {
    const isNewTransient = transientHoldoff && !previousTransientHoldoffRef.current;
    previousTransientHoldoffRef.current = transientHoldoff;
    if (sessionActive && isNewTransient) setSawFreshStrike(true);
  }, [sessionActive, transientHoldoff]);

  const currentStrikeValid = [alap, kvint, oktav].some(isStrikePointValid);
  const readyToCaptureStrike = sessionActive && sawFreshStrike && !transientHoldoff && currentStrikeValid;
  const strikeSummary = summarizeStrikeSamples(strikeSamples);
  const readyToSaveSession = strikeSummary !== null &&
    strikeSummary.fundamental.acceptedCount >= 3 &&
    strikeSummary.fifth.acceptedCount >= 3 &&
    strikeSummary.octave.acceptedCount >= 3;

  const beginStrikeSession = () => {
    setStrikeSamples([]);
    setSessionActive(true);
    setSawFreshStrike(false);
  };

  const captureStrike = () => {
    if (!readyToCaptureStrike) return;
    const point = (measurement: ResonanceMeasurement): StrikePoint | null => isStrikePointValid(measurement)
      ? { hz: measurement.measuredHz!, cents: measurement.deviationCents!, confidence: measurement.confidence!, amplitudeDb: measurement.amplitudeDb! }
      : null;
    const rejectionReasons: StrikeSample['rejectionReasons'] = {};
    const fundamentalReason = getStrikeRejectionReason(alap);
    const fifthReason = getStrikeRejectionReason(kvint);
    const octaveReason = getStrikeRejectionReason(oktav);
    if (fundamentalReason) rejectionReasons.fundamental = fundamentalReason;
    if (fifthReason) rejectionReasons.fifth = fifthReason;
    if (octaveReason) rejectionReasons.octave = octaveReason;
    setStrikeSamples((previous) => [...previous, { capturedAtMs: Date.now(), fundamental: point(alap), fifth: point(kvint), octave: point(oktav), rejectionReasons }]);
    setSawFreshStrike(false);
  };

  const finishStrikeSession = () => {
    if (!readyToSaveSession || !strikeSummary) return;
    onSaveStrikeSession(strikeSummary, strikeSamples);
    setSessionActive(false);
  };
  const modes: Mode[] = [
    { key: 'fundamental', label: 'Alaphang · 1×', current: alap, previousCents: previous?.fundamentalCents ?? null, previousTargetHz: previous?.fundamentalTargetHz ?? null },
    { key: 'fifth', label: '3. parciális · 3×', current: kvint, previousCents: previous?.fifthCents ?? null, previousTargetHz: previous?.fifthTargetHz ?? null },
    { key: 'octave', label: 'Oktáv · 2×', current: oktav, previousCents: previous?.octaveCents ?? null, previousTargetHz: previous?.octaveTargetHz ?? null },
  ];
  const valid = modes.filter((mode) => mode.current.status === 'valid' && mode.current.deviationCents !== null);
  const allInTolerance = valid.length === 3 && valid.every((mode) =>
    isWithinTuningTolerance(mode.current.deviationCents, mode.current.targetHz, toleranceOverrideCents),
  );
  const outOfTolerance = valid.filter((mode) =>
    !isWithinTuningTolerance(mode.current.deviationCents, mode.current.targetHz, toleranceOverrideCents),
  );

  return (
    <section aria-label="Hangolási munkamenet" className="my-2 rounded-xl border border-amber-400/25 bg-[#0b111b] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-200">Hangolási munkamenet</div>
          <div className="mt-1 text-sm font-semibold text-white">{noteName} · három önálló rezgési mód</div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            A jelenlegi mérés összevetése az adott hangszer és hangmező legutóbbi rögzített állapotával.
          </p>
        </div>
        <button
          type="button"
          onClick={onCapture}
          disabled={!canCapture}
          className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-[11px] font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
          title={!canCapture ? 'A rögzítéshez mindhárom rezgési mód érvényes mérése szükséges.' : 'A három mód jelenlegi állapotának rögzítése'}
        >
          Állapot rögzítése
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-950/20 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold text-sky-100">Több leütéses mérés</div>
            <div className="mt-0.5 text-[9px] text-slate-400">Minden minta előtt új leütést kell érzékelnie a programnak.</div>
          </div>
          {!sessionActive ? (
            <button type="button" onClick={beginStrikeSession} className="shrink-0 rounded-md border border-sky-300/30 px-2.5 py-1.5 text-[10px] font-semibold text-sky-100 hover:bg-sky-400/10">Munkamenet indítása</button>
          ) : (
            <button type="button" onClick={() => setSessionActive(false)} className="shrink-0 rounded-md border border-slate-500/40 px-2.5 py-1.5 text-[10px] text-slate-300 hover:bg-white/5">Leállítás</button>
          )}
        </div>
        {sessionActive && (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-slate-300">{transientHoldoff ? "Leütés érzékelve – várj a tranziens után." : sawFreshStrike ? "A leütés lecsengett – a minta rögzíthető." : "Üsd meg újra a kijelölt hangmezőt."}</div>
              <button type="button" onClick={captureStrike} disabled={!readyToCaptureStrike} className="shrink-0 rounded-md bg-sky-300 px-2.5 py-1.5 text-[10px] font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-35">Leütés rögzítése</button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[9px]">
              {([["Alap", "fundamental"], ["3. parciális", "fifth"], ["Oktáv", "octave"]] as const).map(([label, key]) => {
                const accepted = strikeSamples.filter((sample) => sample[key] !== null).length;
                const rejected = strikeSamples.length - accepted;
                return <div key={key} className="rounded-md bg-black/20 px-2 py-1.5"><div className="text-slate-300">{label}</div><div className="mt-0.5 font-mono text-sky-100">{accepted} / {strikeSamples.length}</div><div className="text-slate-500">kihagyva: {rejected}</div></div>;
              })}
            </div>
            {strikeSummary && (
              <div className="mt-2 space-y-1 rounded-md bg-black/20 p-2 text-[9px] text-slate-300">
                <div className="font-semibold text-slate-100">Összesítés · medián és MAD</div>
                {([["Alap", strikeSummary.fundamental], ["3. parciális", strikeSummary.fifth], ["Oktáv", strikeSummary.octave]] as const).map(([label, result]) => (
                  <div key={label} className="flex justify-between gap-2"><span>{label} · {result.acceptedCount} elfogadott / {result.rejectedCount} kihagyott</span><span className="font-mono">{result.acceptedCount === 0 ? "nincs mérés" : `medián ${result.medianCents > 0 ? "+" : ""}${result.medianCents.toFixed(2)} c · MAD ${result.madCents.toFixed(2)} c · tartomány ${result.rangeCents.toFixed(2)} c`}</span></div>
                ))}
                <div className="pt-1 text-slate-500">A MAD és a tartomány a leütések közötti ismételhetőséget írja le, nem kalibrációs bizonytalanságot.</div>
                <button type="button" onClick={finishStrikeSession} disabled={!readyToSaveSession} className="mt-1 w-full rounded-md bg-emerald-300 px-2.5 py-2 text-[10px] font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-35">Összesített állapot mentése</button>
                {!readyToSaveSession && <div className="text-amber-200">Mentéshez mindhárom módnál legalább 3 elfogadott, külön leütés szükséges.</div>}
              </div>
            )}
            <div className="mt-1 text-[9px] text-slate-500">Csak érvényes, nem kétértelmű és legalább 0,32 jelbiztonságú rezonanciák kerülnek be. A három módot külön értékeli.</div>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {modes.map((mode) => {
          const cents = mode.current.status === 'valid' ? mode.current.deviationCents : null;
          const targetHz = mode.current.targetHz;
          const targetChanged = previous !== null && mode.previousCents !== null &&
            (mode.previousTargetHz === null || targetHz === null ||
              Math.abs(1200 * Math.log2(targetHz / mode.previousTargetHz)) > 0.05);
          const comparison = cents !== null && mode.previousCents !== null && !targetChanged
            ? comparisonText(cents, mode.previousCents)
            : null;
          const inTolerance = cents !== null && isWithinTuningTolerance(cents, mode.current.targetHz, toleranceOverrideCents);
          return (
            <div key={mode.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-200">{mode.label}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {mode.current.measuredHz !== null ? `${mode.current.measuredHz.toFixed(2)} Hz` : 'Nincs megbízható frekvencia'}
                  {mode.current.targetHz !== null ? ` · cél ${mode.current.targetHz.toFixed(2)} Hz` : ''}
                </div>
                {comparison && (
                  <div className={`mt-1 text-[10px] ${comparison.improved === true ? 'text-emerald-300' : comparison.improved === false ? 'text-amber-300' : 'text-slate-400'}`}>
                    Előző: {formatCents(mode.previousCents)} → most: {formatCents(cents)} · {comparison.text}
                  </div>
                )}
                {!comparison && previous && targetChanged && (
                  <div className="mt-1 text-[10px] text-amber-200">A célfrekvencia megváltozott; az eltérés nem hasonlítható össze.</div>
                )}
                {!comparison && previous && !targetChanged && mode.previousCents === null && (
                  <div className="mt-1 text-[10px] text-slate-500">Nincs összehasonlítható korábbi érték.</div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[9px] text-slate-500">
                  <span>Jelbiztonság: {mode.current.confidence !== null ? `${Math.round(mode.current.confidence * 100)}%` : '—'}</span>
                  {mode.current.peakAmbiguous && <span className="text-amber-200">Több versengő spektrális csúcs</span>}
                  {mode.current.status !== 'valid' && <span className="text-amber-200">A mérés nem érvényes</span>}
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono text-sm font-bold ${cents === null ? 'text-slate-500' : inTolerance ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {formatCents(cents)}
                </div>
                <div className="text-[9px] text-slate-500">{cents === null ? 'Mérés szükséges' : inTolerance ? 'Céltartományon belül' : cents > 0 ? 'Magas' : 'Mély'}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2 text-[10px] leading-relaxed">
        {valid.length < 3 ? (
          <span className="text-amber-200">A döntéshez mindhárom rezgési mód érvényes mérése szükséges. Üsd meg külön a kijelölt hangmezőt, és várd meg a tranziens utáni lecsengést.</span>
        ) : allInTolerance ? (
          <span className="text-emerald-300">Mindhárom mért mód a beállított céltartományon belül van.</span>
        ) : (
          <span className="text-amber-200">
            Célon kívüli módok: {outOfTolerance.map((mode) => mode.label).join(', ')}. A kijelzett eltérések mérési eredmények; önmagukban nem adnak biztonságos ütési/helyreállítási utasítást.
          </span>
        )}
        {!previous && <span className="mt-1 block text-slate-500">Ehhez a hangmezőhöz még nincs korábbi rögzített állapot. Az első rögzítés lesz az összehasonlítási alap.</span>}
      </div>
    </section>
  );
};
