import React from 'react';
import type { ToneFieldNote } from '../types/tuner';

interface Props {
  notes: ToneFieldNote[];
  enabledNoteIds: ReadonlySet<string>;
  onToggleNote: (noteId: string) => void;
}

export const BBScaleNoteEnablePanel: React.FC<Props> = ({ notes, enabledNoteIds, onToggleNote }) => {
  const enabledCount = notes.filter((note) => enabledNoteIds.has(note.id)).length;

  return (
    <section className="my-3 rounded-2xl border border-white/10 bg-[#0b111b] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Aktív hangmezők</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            Kapcsold ki azokat a skálahangokat, amelyeket nem szeretnél automatikusan felismerni. A kikapcsolt hang a hangmezőtérképen sem jelenik meg.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] font-mono text-slate-300">
          {enabledCount}/{notes.length} aktív
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {notes.map((note) => {
          const enabled = enabledNoteIds.has(note.id);
          return (
            <label
              key={note.id}
              className={'flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 transition ' +
                (enabled
                  ? 'border-white/10 bg-slate-950/60'
                  : 'border-slate-800 bg-black/20 opacity-70')}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => onToggleNote(note.id)}
                aria-label={note.noteName + ' aktív hangmező'}
                className="h-4 w-4 shrink-0 accent-amber-400"
              />
              <span className="min-w-0 flex-1">
                <span className={'block truncate text-xs font-semibold ' + (enabled ? 'text-white' : 'text-slate-400')}>
                  {note.noteName}
                  {note.positionIndex === 0 ? ' · Ding' : ''}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">
                  {note.frequency.toFixed(2)} Hz
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        A beállítás skálánként mentődik. Legalább egy aktív hangmezőnek meg kell maradnia.
      </p>
    </section>
  );
};
