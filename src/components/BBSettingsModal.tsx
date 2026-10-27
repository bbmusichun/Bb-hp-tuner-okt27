import React from 'react';
import { X, Sliders, Music, ShieldCheck } from 'lucide-react';
import { HandpanScale } from '../types/tuner';
import { PRESET_SCALES } from '../audio/scales';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  a4Ref: number;
  onChangeA4: (a4: number) => void;
  selectedScaleId: string;
  onSelectScale: (scale: HandpanScale) => void;
  sampleRateKhz: number;
  isListening: boolean;
}

export const BBSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  a4Ref,
  onChangeA4,
  selectedScaleId,
  onSelectScale,
  sampleRateKhz,
  isListening,
}) => {
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

          {/* Audio Engine Info */}
          <div className="p-3 rounded-xl bg-[#080b0f] border border-white/5 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1 text-slate-300 font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
              <span>Akusztikai Mérési Környezet</span>
            </div>
            <div>{isListening ? 'Aktuális mintavételezés' : 'Legutóbbi mintavételezés'}: <span className="font-mono text-white">{sampleRateKhz} kHz (Web Audio API)</span></div>
            <div>FFT felbontás: <span className="font-mono text-white">32768 pont + parabolikus csúcsinterpoláció</span></div>
            <div>Zajcsökkentés / AGC: <span className="font-mono text-[#10b981]">Kikapcsolva (Nyers jel)</span></div>
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
