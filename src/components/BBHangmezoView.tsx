import React, { useEffect, useRef } from 'react';
import { ToneFieldNote } from '../types/tuner';
import { Volume2 } from 'lucide-react';
import { bbAudioEngine } from '../audio/audioEngine';

interface Props {
  notes: ToneFieldNote[];
  selectedNote: ToneFieldNote;
  onSelectNote: (note: ToneFieldNote) => void;
  hasSignal: boolean;
  alapCents: number | null;
  totalNoteCount?: number;
  allowReferenceTonePreview?: boolean;
}

export const BBHangmezoView: React.FC<Props> = ({
  notes,
  selectedNote,
  onSelectNote,
  hasSignal,
  alapCents,
  totalNoteCount,
  allowReferenceTonePreview = true,
}) => {
  const ding = notes.find((note) => note.positionIndex === 0);
  const perimeter = notes.filter((note) => note.positionIndex !== 0);
  const perimeterCount = Math.max(0, (totalNoteCount ?? notes.length) - 1);
  const toneStopTimerRef = useRef<number | null>(null);

  const playReferenceTone = (frequency: number, durationMs: number) => {
    if (!allowReferenceTonePreview) return;
    if (toneStopTimerRef.current !== null) {
      window.clearTimeout(toneStopTimerRef.current);
      toneStopTimerRef.current = null;
    }
    bbAudioEngine.playTone(frequency);
    toneStopTimerRef.current = window.setTimeout(() => {
      bbAudioEngine.stopTone();
      toneStopTimerRef.current = null;
    }, durationMs);
  };

  useEffect(() => {
    if (allowReferenceTonePreview) return;
    if (toneStopTimerRef.current !== null) {
      window.clearTimeout(toneStopTimerRef.current);
      toneStopTimerRef.current = null;
    }
    bbAudioEngine.stopTone();
  }, [allowReferenceTonePreview]);

  useEffect(() => () => {
    if (toneStopTimerRef.current !== null) window.clearTimeout(toneStopTimerRef.current);
    bbAudioEngine.stopTone();
  }, []);

  return (
    <div className="w-full flex flex-col items-center p-3 animate-in fade-in">
      <div className="text-center mb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Hangmező Térkép</h3>
        <p className="text-xs text-slate-400">Válaszd ki a hangolni kívánt hangmezőt</p>
      </div>

      {/* Handpan Circular Layout Diagram */}
      <div className="relative w-72 h-72 rounded-full bg-[#111722] border-2 border-white/10 shadow-2xl flex items-center justify-center p-4 my-2">
        {/* Outer Flange */}
        <div className="absolute inset-1 rounded-full border border-slate-700/40 pointer-events-none" />

        {/* Center Ding */}
        {ding && (
          <button
            onClick={() => {
              onSelectNote(ding);
              playReferenceTone(ding.frequency, 600);
            }}
            className={`w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-lg transition-all z-10 ${
              selectedNote.id === ding.id
                ? 'bg-[#f59e0b] text-slate-950 font-bold ring-4 ring-[#f59e0b]/30 scale-105'
                : 'bg-[#1e293b] text-white hover:bg-slate-700 border border-slate-600'
            }`}
          >
            <span className="text-base font-extrabold">{ding.noteName}</span>
            <span className="text-[10px] font-mono opacity-80">{ding.frequency.toFixed(0)}Hz</span>
            <span className="text-[8px] uppercase tracking-wider opacity-60">Ding</span>
          </button>
        )}

        {/* Perimeter Tone Fields */}
        {perimeter.map((note) => {
          const angle = perimeterCount > 0
            ? ((note.positionIndex - 1) / perimeterCount) * Math.PI * 2 - Math.PI / 2
            : -Math.PI / 2;
          const radius = 98; // pixels from center
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const isSelected = selectedNote.id === note.id;

          return (
            <button
              key={note.id}
              onClick={() => {
                onSelectNote(note);
                playReferenceTone(note.frequency, 600);
              }}
              style={{
                transform: `translate(${x}px, ${y}px)`,
              }}
              className={`absolute w-12 h-12 rounded-full flex flex-col items-center justify-center shadow-md transition-all ${
                isSelected
                  ? 'bg-[#f59e0b] text-slate-950 font-bold ring-2 ring-[#f59e0b]/40 scale-110 z-20'
                  : 'bg-[#1e293b] text-white hover:bg-slate-700 border border-slate-600/80 z-10'
              }`}
            >
              <span className="text-xs font-bold leading-none">{note.noteName}</span>
              <span className="text-[9px] font-mono opacity-75">{note.frequency.toFixed(0)}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Note Info Banner */}
      <div className="w-full max-w-sm mt-3 p-3 rounded-xl bg-[#0b0f14] border border-white/5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">{selectedNote.noteName}</span>
            <span className="text-xs text-slate-400 font-mono">
              {selectedNote.positionIndex === 0 ? 'Központi Ding' : `${selectedNote.positionIndex}. Hangmező`}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-0.5">
            Alap: {selectedNote.frequency.toFixed(2)} Hz &bull; 3. parciális: {selectedNote.fifthFreq.toFixed(2)} Hz &bull; Oktáv: {selectedNote.octaveFreq.toFixed(2)} Hz
          </div>
        </div>

        <button
          onClick={() => {
            playReferenceTone(selectedNote.frequency, 700);
          }}
          className="p-2 rounded-lg bg-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/30 border border-[#f59e0b]/30"
          title="Hang lejátszása"
        >
          <Volume2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
