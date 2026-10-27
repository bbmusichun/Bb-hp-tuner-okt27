import React, { useEffect, useRef, useState } from 'react';
import { ResonanceMeasurement } from '../types/tuner';
import { bbAudioEngine } from '../audio/audioEngine';

type Props = {
  active: boolean;
  alap: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  yinFrequencyHz: number | null;
  yinClarity: number;
  yinAgreementCents: number | null;
};

type SpectrumFrame = { time: number; bins: Float32Array };

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function noteName(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '--';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
function noteFrequency(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }
function colorForDb(db: number): string {
  const t = Math.max(0, Math.min(1, (db + 95) / 65));
  if (t < 0.25) return `rgba(30, 64, 175, ${0.12 + t * 0.5})`;
  if (t < 0.52) return `rgba(6, 182, 212, ${0.18 + t * 0.8})`;
  if (t < 0.78) return `rgba(168, 85, 247, ${0.2 + t * 0.8})`;
  return `rgba(244, 114, 182, ${0.25 + t * 0.75})`;
}

/** Full FFT waterfall: retains all visible partials and noise energy instead of reducing the view to only three detected peaks. */
export const BBSpectrumWaterfall: React.FC<Props> = ({ active, alap, oktav, kvint, yinFrequencyHz, yinClarity, yinAgreementCents }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ active, alap, oktav, kvint });
  const framesRef = useRef<SpectrumFrame[]>([]);
  const [windowSeconds, setWindowSeconds] = useState(5);
  const [rangeSemitones, setRangeSemitones] = useState(15);
  latestRef.current = { active, alap, oktav, kvint };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let lastSample = 0;
    let lastPaint = 0;
    const render = (now: number) => {
      const state = latestRef.current;
      if (state.active && now - lastSample >= 65) {
        const bins = bbAudioEngine.getFloatFrequencyData();
        framesRef.current.push({ time: now, bins: new Float32Array(bins) });
        lastSample = now;
      }
      const cutoff = now - windowSeconds * 1000;
      while (framesRef.current.length && framesRef.current[0].time < cutoff) framesRef.current.shift();

      if (now - lastPaint >= 65) {
        lastPaint = now;
        const w = canvas.width, h = canvas.height;
        const left = 44, right = 86, top = 34, bottom = 24;
        const plotW = w - left - right, plotH = h - top - bottom;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#070d17'; ctx.fillRect(0, 0, w, h);
        const fundamental = state.alap.targetHz && state.alap.targetHz > 0 ? state.alap.targetHz : 146.83;
        const lowHz = fundamental * Math.pow(2, -rangeSemitones / 12);
        const highHz = (state.kvint.targetHz && state.kvint.targetHz > 0 ? state.kvint.targetHz : fundamental * 3) * Math.pow(2, rangeSemitones / 12);
        const logLow = Math.log2(lowHz), logHigh = Math.log2(highHz);
        const yForHz = (hz: number) => top + (logHigh - Math.log2(Math.max(lowHz, Math.min(highHz, hz)))) / (logHigh - logLow) * plotH;
        ctx.fillStyle = '#0a1422'; ctx.fillRect(left, top, plotW, plotH);

        // Draw every FFT bin in the selected musical range, frame by frame.
        const frames = framesRef.current;
        frames.forEach((frame) => {
          const age = now - frame.time;
          if (age < 0 || age > windowSeconds * 1000) return;
          const x = left + (1 - age / (windowSeconds * 1000)) * plotW;
          const sampleRate = bbAudioEngine.getSampleRate();
          const binWidth = sampleRate / (frame.bins.length * 2);
          for (let i = 1; i < frame.bins.length; i++) {
            const hz = i * binWidth;
            if (hz < lowHz || hz > highHz) continue;
            const db = frame.bins[i];
            if (!Number.isFinite(db) || db < -96) continue;
            const y = yForHz(hz);
            ctx.fillStyle = colorForDb(db);
            ctx.fillRect(x, y - 1.4, Math.max(1.5, plotW * 0.012), 2.8);
          }
        });

        // Musical-note grid; all spectral energy remains visible between the named notes.
        const lowMidi = Math.floor(69 + 12 * Math.log2(lowHz / 440));
        const highMidi = Math.ceil(69 + 12 * Math.log2(highHz / 440));
        for (let midi = lowMidi; midi <= highMidi; midi++) {
          const hz = noteFrequency(midi);
          if (hz < lowHz || hz > highHz) continue;
          const y = yForHz(hz);
          ctx.strokeStyle = midi % 12 === 0 ? '#34445c' : '#1c2b40';
          ctx.lineWidth = midi % 12 === 0 ? 1.1 : 0.7;
          ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke();
          ctx.fillStyle = '#9aacc5'; ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(noteName(hz), left - 7, y);
        }
        for (let sec = 0; sec <= windowSeconds; sec++) {
          const x = left + (sec / windowSeconds) * plotW;
          ctx.strokeStyle = '#1a2a40'; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke(); ctx.setLineDash([]);
        }

        const targets = [
          { label: '1×', color: '#fbbf24', m: state.alap },
          { label: '2×', color: '#22d3ee', m: state.oktav },
          { label: '3×', color: '#c084fc', m: state.kvint },
        ];
        targets.forEach(({ label, color, m }) => {
          const hz = m.measuredHz ?? m.targetHz;
          if (hz === null || hz <= lowHz || hz >= highHz) return;
          const y = yForHz(hz);
          ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#0c1320'; ctx.fillRect(left + plotW + 4, y - 14, right - 8, 28);
          ctx.fillStyle = color; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'left';
          ctx.fillText(label + ' ' + (m.noteName || noteName(hz)), left + plotW + 8, y - 3);
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillText(m.measuredHz !== null ? m.measuredHz.toFixed(1) + ' Hz' : '— Hz', left + plotW + 8, y + 9);
        });

        ctx.fillStyle = '#90a4bf'; ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.fillText('−' + windowSeconds + ' s', left, h - 9);
        ctx.textAlign = 'center'; ctx.fillText('−' + windowSeconds / 2 + ' s', left + plotW / 2, h - 9);
        ctx.textAlign = 'right'; ctx.fillText('Most', left + plotW, h - 9);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [windowSeconds, rangeSemitones]);

  return (
    <section className="w-full rounded-xl border border-white/10 bg-[#080e18] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">Spektrum · teljes felhangtérkép</h3>
          <p className="text-[10px] text-slate-400">Minden látható frekvenciakomponens · időbeli lecsengés · 1× / 2× / 3× jelölés</p>
        </div>
      </div>
      <canvas ref={canvasRef} width={760} height={680} className="block h-[560px] sm:h-[680px] w-full rounded-lg border border-slate-800" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <span className="mr-1">Idő:</span>
          {[2, 5, 10].map((seconds) => <button key={seconds} type="button" onClick={() => setWindowSeconds(seconds)} aria-pressed={windowSeconds === seconds} className={`rounded-md border px-2 py-1 ${windowSeconds === seconds ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{seconds} s</button>)}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1">Hangterjedelem:</span>
          {[12, 15, 18].map((semitones) => <button key={semitones} type="button" onClick={() => setRangeSemitones(semitones)} aria-pressed={rangeSemitones === semitones} className={`rounded-md border px-2 py-1 ${rangeSemitones === semitones ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{semitones} félhang</button>)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-[10px]">
        <div><div className="font-semibold text-slate-300">YIN keresztellenőrzés</div><div className="text-slate-500">Külön periodicitás-alapú becslés, nem automatikus korrekció</div></div>
        <div className="text-right"><div className="font-mono text-slate-200">{yinFrequencyHz !== null ? yinFrequencyHz.toFixed(2) + ' Hz' : 'Nincs stabil becslés'}</div><div className={yinAgreementCents === null ? 'text-slate-500' : Math.abs(yinAgreementCents) <= 5 && yinClarity >= 0.8 ? 'text-emerald-300' : 'text-amber-300'}>{yinAgreementCents === null ? 'Nincs összehasonlítható adat' : 'Eltérés: ' + (yinAgreementCents > 0 ? '+' : '') + yinAgreementCents.toFixed(1) + ' cent'}{' · tisztaság ' + Math.round(yinClarity * 100) + '%'}</div></div>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">A gyenge felhangokat sem töröljük automatikusan: a szín a spektrális energiát jelzi, a szaggatott vonalak a hangoló által követett három parciálist.</p>
    </section>
  );
};
