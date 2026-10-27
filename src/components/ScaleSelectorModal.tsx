import React from 'react';
import { X, Check, SlidersHorizontal, Music } from 'lucide-react';
import { HandpanScale } from '../types/tuner';
import { PRESET_SCALES } from '../audio/scales';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedScaleId: string;
  onSelectScale: (scale: HandpanScale) => void;
  a4Ref: number;
  onChangeA4: (a4: number) => void;
  theme?: 'dark' | 'light';
}

export const ScaleSelectorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedScaleId,
  onSelectScale,
  a4Ref,
  onChangeA4,
  theme = 'dark',
}) => {
  if (!isOpen) return null;
  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl relative max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150 ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-sm">Handpan Skálák & A4 Kalibráció</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* A4 Reference Calibration Controls */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 mb-4">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="flex items-center gap-1.5 text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
              A4 Kamarahang Referencia:
            </span>
            <span className="font-mono text-sky-400 font-bold">{a4Ref.toFixed(1)} Hz</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {[432, 440, 442, 444].map((freq) => (
              <button
                key={freq}
                onClick={() => onChangeA4(freq)}
                className={`py-1 text-xs font-mono font-medium rounded-lg border transition ${
                  a4Ref === freq
                    ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {freq} Hz
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
            className="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Scale list */}
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Válassz Skálát:
        </div>

        <div className="overflow-y-auto space-y-2 pr-1 flex-1">
          {PRESET_SCALES.map((scale) => {
            const isSelected = scale.id === selectedScaleId;
            return (
              <button
                key={scale.id}
                onClick={() => {
                  onSelectScale(scale);
                  onClose();
                }}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-sky-500/10 border-sky-500/40 text-sky-400 ring-1 ring-sky-500/30'
                    : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700 text-slate-200'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    {scale.name}
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      {scale.noteCount} hang
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1 flex flex-wrap gap-1">
                    {scale.notes.map((n, i) => (
                      <span key={i} className={i === 0 ? 'text-amber-400 font-bold' : ''}>
                        {n.name}
                      </span>
                    ))}
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-sky-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
