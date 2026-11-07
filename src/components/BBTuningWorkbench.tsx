import React from 'react';
import type { ResonanceMeasurement, TuningLogEntry } from '../types/tuner';
import { isWithinTuningTolerance } from '../audio/tuningTolerance';
import type { TuningToleranceSetting } from '../audio/tuningTolerance';

interface Props {
  noteName: string;
  previous: TuningLogEntry | null;
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  toleranceOverrideCents: TuningToleranceSetting;
  canCapture: boolean;
  onCapture: () => void;
}

type Mode = {
  key: 'fundamental' | 'fifth' | 'octave';
  label: string;
  current: ResonanceMeasurement;
  previousCents: number | null;
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
}) => {
  const modes: Mode[] = [
    { key: 'fundamental', label: 'Alaphang · 1×', current: alap, previousCents: previous?.fundamentalCents ?? null },
    { key: 'fifth', label: '3. parciális · 3×', current: kvint, previousCents: previous?.fifthCents ?? null },
    { key: 'octave', label: 'Oktáv · 2×', current: oktav, previousCents: previous?.octaveCents ?? null },
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

      <div className="mt-3 space-y-2">
        {modes.map((mode) => {
          const cents = mode.current.status === 'valid' ? mode.current.deviationCents : null;
          const comparison = cents !== null && mode.previousCents !== null
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
                {!comparison && mode.previousCents === null && previous && (
                  <div className="mt-1 text-[10px] text-slate-500">Nincs összehasonlítható korábbi érték.</div>
                )}
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
