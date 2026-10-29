import React, { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ToneFieldNote } from '../types/tuner';
import { modeWheelRotationSteps } from '../audio/scaleMode';

interface Props {
  notes: ToneFieldNote[];
  enabledNoteIds: ReadonlySet<string>;
  onToggleNote: (noteId: string) => void;
  onRotateMode: (steps: number) => void;
  readOnly?: boolean;
}

interface DragStart {
  pointerId: number;
  x: number;
  y: number;
  angle: number;
}

function pointerAngle(event: ReactPointerEvent<HTMLDivElement>): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
}

export const BBScaleNoteEnablePanel: React.FC<Props> = ({
  notes, enabledNoteIds, onToggleNote, onRotateMode, readOnly = false,
}) => {
  const enabledCount = notes.filter((note) => enabledNoteIds.has(note.id)).length;
  const dragStart = useRef<DragStart | null>(null);
  const suppressClick = useRef(false);
  const wheelSize = 240;
  const wheelCenter = wheelSize / 2;
  const radius = notes.length > 16 ? 94 : 82;
  const chipSize = notes.length > 16 ? 27 : 34;
  const showWheel = notes.length > 0 && notes.length <= 24;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    dragStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      angle: pointerAngle(event),
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable in embedded browsers. */ }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 18) return;
    const steps = modeWheelRotationSteps(start.angle, pointerAngle(event), notes.length);
    if (steps === 0) return;
    event.preventDefault();
    suppressClick.current = true;
    onRotateMode(steps);
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const rotate = (steps: number) => {
    if (!readOnly && notes.length > 1) onRotateMode(steps);
  };

  return (
    <section className="my-3 rounded-2xl border border-white/10 bg-[#0b111b] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Hangolási módkerék</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            Kapcsold ki a felismerésből kizárandó hangokat, vagy húzd körbe a kereket a bekapcsolt hangmintázat forgatásához. A hangmagasságokat nem transzponálja.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] font-mono text-slate-300">
          {enabledCount}/{notes.length} aktív
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
        {showWheel ? (
          <div
            role="group"
            aria-label="Hangolási módkerék. Húzd körbe az aktív hangmintázat elforgatásához."
            className={'relative mx-auto h-[240px] w-[240px] select-none rounded-full border border-slate-700/80 bg-[radial-gradient(circle,#151e2b_0%,#0b111b_70%)] ' + (readOnly ? 'opacity-60' : 'touch-none cursor-grab active:cursor-grabbing')}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { dragStart.current = null; }}
            onClickCapture={handleClickCapture}
          >
            <div className="pointer-events-none absolute inset-[18px] rounded-full border border-dashed border-slate-700/70" />
            {notes.map((note, index) => {
              const angle = (index / notes.length * 2 * Math.PI) - Math.PI / 2;
              const left = wheelCenter + radius * Math.cos(angle) - chipSize / 2;
              const top = wheelCenter + radius * Math.sin(angle) - chipSize / 2;
              const enabled = enabledNoteIds.has(note.id);
              return (
                <button
                  key={note.id}
                  type="button"
                  disabled={readOnly}
                  aria-label={note.noteName + ' aktív hangmező'}
                  aria-pressed={enabled}
                  title={note.noteName + ' · ' + note.frequency.toFixed(2) + ' Hz'}
                  onClick={() => onToggleNote(note.id)}
                  style={{ left: left + 'px', top: top + 'px', width: chipSize + 'px', height: chipSize + 'px' }}
                  className={'absolute flex items-center justify-center rounded-full border text-[10px] font-semibold transition active:scale-95 disabled:cursor-not-allowed ' +
                    (enabled
                      ? 'border-amber-300 bg-amber-300 text-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.25)]'
                      : 'border-slate-600 bg-slate-950 text-slate-500 opacity-60')}
                >
                  <span className="max-w-full truncate px-0.5">{note.noteName.replace(/-?\d+$/, '')}</span>
                </button>
              );
            })}
            <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
              <span className="text-[9px] font-medium uppercase tracking-widest text-slate-500">Mód</span>
              <span className="mt-1 text-base font-black text-white">{enabledCount} hang</span>
              <span className="mt-0.5 max-w-[100px] text-[9px] leading-snug text-slate-500">Húzás = forgatás</span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 p-3 text-xs leading-relaxed text-slate-400">
            Ennél a skálánál túl sok hang van a kör alakú kijelzéshez. A módmintázatot az alábbi forgatógombokkal továbbra is elforgathatod.
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={readOnly || notes.length < 2} onClick={() => rotate(-1)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-[11px] font-semibold text-slate-200 disabled:opacity-40">
              ↶ Balra forgatás
            </button>
            <button type="button" disabled={readOnly || notes.length < 2} onClick={() => rotate(1)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-[11px] font-semibold text-slate-200 disabled:opacity-40">
              Jobbra forgatás ↷
            </button>
          </div>
          <div className="space-y-1.5">
            {notes.map((note) => {
              const enabled = enabledNoteIds.has(note.id);
              return (
                <label key={note.id} className={'flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 transition ' +
                  (enabled ? 'border-white/10 bg-slate-950/60' : 'border-slate-800 bg-black/20 opacity-70')}>
                  <input type="checkbox" checked={enabled} disabled={readOnly} onChange={() => onToggleNote(note.id)}
                    aria-label={note.noteName + ' aktív hangmező'} className="h-4 w-4 shrink-0 accent-amber-400" />
                  <span className="min-w-0 flex-1">
                    <span className={'block truncate text-xs font-semibold ' + (enabled ? 'text-white' : 'text-slate-400')}>
                      {note.noteName}{note.positionIndex === 0 ? ' · Ding' : ''}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">{note.frequency.toFixed(2)} Hz</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        A forgatás a skálában látható hangok aktív/inaktív mintázatát körkörösen eltolja. A mód skálánként mentődik, a célfrekvenciákat nem módosítja; legalább egy aktív hangmezőnek meg kell maradnia.
      </p>
    </section>
  );
};
