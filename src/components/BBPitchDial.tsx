import React, { useEffect, useState } from 'react';

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

interface Props {
  selectedMidi: number;
  onSelectMidi: (midi: number) => void;
}

function clampOctave(value: number): number {
  return Math.max(1, Math.min(6, value));
}

export const BBPitchDial: React.FC<Props> = ({ selectedMidi, onSelectMidi }) => {
  const midiOctave = Math.floor(selectedMidi / 12) - 1;
  const pitchClass = ((selectedMidi % 12) + 12) % 12;
  const [octave, setOctave] = useState(() => clampOctave(midiOctave));

  useEffect(() => {
    setOctave(clampOctave(midiOctave));
  }, [midiOctave]);

  const previewMidi = (octave + 1) * 12 + pitchClass;
  const previewSelected = previewMidi === selectedMidi;

  return (
    <section className="my-3 rounded-2xl border border-white/10 bg-[#0b111b] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Kromatikus pitch tárcsa</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            A skálán kívüli félhangok is közvetlen céllá válhatnak.
          </p>
        </div>
        <label className="shrink-0 text-[10px] text-slate-400">
          Oktáv
          <select
            aria-label="Pitch tárcsa oktáv"
            value={octave}
            onChange={(event) => setOctave(clampOctave(Number(event.target.value)))}
            className="ml-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-400"
          >
            {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <div className="mx-auto mt-2 flex w-full max-w-[250px] flex-col items-center">
        <div className="relative h-[224px] w-[224px] rounded-full border border-slate-700/80 bg-[radial-gradient(circle,#151e2b_0%,#0b111b_70%)]">
          <div className="absolute inset-[20px] rounded-full border border-dashed border-slate-700/70" />
          {PITCH_NAMES.map((name, index) => {
            const angle = (index * 30 - 90) * Math.PI / 180;
            const left = 112 + 78 * Math.cos(angle) - 18;
            const top = 112 + 78 * Math.sin(angle) - 18;
            const midi = (octave + 1) * 12 + index;
            const isSelected = midi === selectedMidi;
            return (
              <button
                key={name}
                type="button"
                aria-label={name + ', oktáv ' + octave}
                aria-pressed={isSelected}
                onClick={() => onSelectMidi(midi)}
                style={{ left: left + 'px', top: top + 'px' }}
                className={'absolute flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-semibold transition active:scale-95 ' +
                  (isSelected
                    ? 'border-amber-300 bg-amber-300 text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.35)]'
                    : 'border-slate-600 bg-slate-900 text-slate-200 hover:border-amber-400/70 hover:text-amber-100')}
              >
                {name}
              </button>
            );
          })}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Célhang</span>
            <span className="mt-1 text-2xl font-black text-white">{PITCH_NAMES[pitchClass]}{octave}</span>
            <span className="mt-0.5 text-[10px] text-slate-500">{previewSelected ? 'Aktív cél' : 'Kattints a kiválasztáshoz'}</span>
          </div>
        </div>
        <div className="mt-2 flex w-full items-center justify-between text-[10px] text-slate-500">
          <span>C1–B6 tartomány</span>
          <span>12 félhang / oktáv</span>
        </div>
      </div>
    </section>
  );
};
