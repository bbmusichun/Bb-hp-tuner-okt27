import React, { useEffect, useRef, useState } from 'react';
import { ResonanceMeasurement } from '../types/tuner';

type Track = {
  key: 'alap' | 'oktav' | 'kvint';
  label: string;
  color: string;
  measurement: ResonanceMeasurement;
};

type Props = {
  active: boolean;
  alap: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  yinFrequencyHz: number | null;
  yinClarity: number;
  yinAgreementCents: number | null;
};

type Sample = { time: number; cents: number | null };

const MAX_ZOOM_CENTS = 300;
const MIN_ZOOM_CENTS = 100;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function shiftNoteName(noteName: string, semitones: number): string {
  const match = /^([A-G])([#b]?)(-?\\d+)$/.exec(noteName);
  if (!match) return noteName;
  const pitchClass = match[1] + match[2];
  const pitchIndex = ({ C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 } as Record<string, number>)[pitchClass];
  if (pitchIndex === undefined) return noteName;
  const midi = (Number(match[3]) + 1) * 12 + pitchIndex + semitones;
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[((midi % 12) + 12) % 12] + octave;
}

/**
 * Live pitch-history diagram. Each harmonic gets its own synchronized lane,
 * centered on its target pitch, so the fundamental, octave and compound fifth
 * remain visible together. Pinch/wheel/buttons change the cents range only;
 * measurements always come from the existing audio engine.
 */
export const BBSpectrogram: React.FC<Props> = ({ active, alap, oktav, kvint, yinFrequencyHz, yinClarity, yinAgreementCents }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ active, alap, oktav, kvint, yinFrequencyHz, yinClarity, yinAgreementCents });
  const historyRef = useRef<Record<Track['key'], Sample[]>>({ alap: [], oktav: [], kvint: [] });
  const [zoomCents, setZoomCents] = useState(100);
  const [windowSeconds, setWindowSeconds] = useState(5);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistanceRef = useRef<number | null>(null);
  latestRef.current = { active, alap, oktav, kvint, yinFrequencyHz, yinClarity, yinAgreementCents };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastPaint = 0;

    const render = (now: number) => {
      if (now - lastPaint >= 65) {
        lastPaint = now;
        const state = latestRef.current;
        const tracks: Track[] = [
          { key: 'alap', label: '1× Alaphang', color: '#fbbf24', measurement: state.alap },
          { key: 'oktav', label: '2× Oktáv', color: '#22d3ee', measurement: state.oktav },
          { key: 'kvint', label: '3× Kvint', color: '#c084fc', measurement: state.kvint },
        ];
        const history = historyRef.current;
        const cutoff = now - windowSeconds * 1000;

        tracks.forEach((track) => {
          const samples = history[track.key];
          const m = track.measurement;
          const live = state.active && m.status === 'valid' && m.confidence !== null && m.confidence >= 0.25 && m.measuredHz !== null &&
            m.deviationCents !== null && Number.isFinite(m.deviationCents);
          if (live) {
            const last = samples[samples.length - 1];
            if (!last || now - last.time >= 60) {
              samples.push({ time: now, cents: m.deviationCents });
            }
          } else {
            const last = samples[samples.length - 1];
            if (!last || last.cents !== null) samples.push({ time: now, cents: null });
          }
          while (samples.length && samples[0].time < cutoff) samples.shift();
        });

        const w = canvas.width;
        const h = canvas.height;
        const left = 66, right = 12, top = 10, bottom = 24;
        const plotW = w - left - right;
        const plotH = h - top - bottom;
        const rowH = plotH / 3;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#070d17';
        ctx.fillRect(0, 0, w, h);

        ctx.font = '11px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        tracks.forEach((track, index) => {
          const rowTop = top + index * rowH;
          const centerY = rowTop + rowH / 2;
          const m = track.measurement;
          ctx.fillStyle = '#0a1422';
          ctx.fillRect(left, rowTop, plotW, rowH);
          ctx.strokeStyle = '#263449';
          ctx.lineWidth = 1;
          for (let cents = -zoomCents; cents <= zoomCents; cents += zoomCents / 2) {
            const y = centerY - (cents / zoomCents) * (rowH * 0.42);
            ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
            ctx.fillStyle = '#9aacc5';
            ctx.textAlign = 'right';
            const noteLabel = cents === -zoomCents ? shiftNoteName(m.noteName, -1) : cents === 0 ? (m.noteName || '--') : cents === zoomCents ? shiftNoteName(m.noteName, 1) : `${cents > 0 ? '+' : ''}${Math.round(cents)} c`;
            ctx.fillText(noteLabel, left - 8, y);
          }
          for (let sec = 0; sec <= windowSeconds; sec++) {
            const x = left + (sec / windowSeconds) * plotW;
            ctx.strokeStyle = '#1a2a40';
            ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(x, rowTop); ctx.lineTo(x, rowTop + rowH); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.fillStyle = track.color;
          ctx.textAlign = 'left';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.fillText(track.label, 6, rowTop + 12);
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillStyle = '#d4deee';
          ctx.fillText(m.noteName || '--', 6, rowTop + 27);
          ctx.font = '9px system-ui, sans-serif';
          ctx.fillStyle = m.status === 'valid' ? '#6ee7b7' : m.status === 'held' ? '#fbbf24' : '#8290a4';
          const qualityLabel = m.status === 'valid' ? 'ÉLŐ' : m.status === 'held' ? 'TARTOTT' : m.status === 'uncertain' ? 'BIZONYTALAN' : 'NINCS JEL';
          ctx.fillText(qualityLabel, 6, rowTop + 40);
          ctx.textAlign = 'right';
          ctx.fillStyle = track.color;
          ctx.fillText(m.measuredHz !== null ? `${m.measuredHz.toFixed(2)} Hz` : '-- Hz', w - right - 3, rowTop + 12);
          ctx.fillStyle = m.deviationCents === null ? '#8290a4' : Math.abs(m.deviationCents) <= 3 ? '#34d399' : '#fbbf24';
          ctx.fillText(m.deviationCents === null ? '-- cent' : `${m.deviationCents > 0 ? '+' : ''}${m.deviationCents.toFixed(1)} c`, w - right - 3, rowTop + 27);
          ctx.font = '9px system-ui, sans-serif';
          ctx.fillStyle = '#8293ad';
          ctx.fillText(m.confidence !== null ? 'Bizalom ' + Math.round(m.confidence * 100) + '%' : 'Bizalom --', w - right - 3, rowTop + 40);

          const samples = history[track.key];
          ctx.strokeStyle = track.color;
          ctx.lineWidth = 2.2;
          ctx.shadowColor = track.color;
          ctx.shadowBlur = 5;
          ctx.beginPath();
          let drawing = false;
          samples.forEach((sample) => {
            if (sample.cents === null) { drawing = false; return; }
            const x = left + (1 - Math.max(0, Math.min(windowSeconds * 1000, now - sample.time)) / (windowSeconds * 1000)) * plotW;
            const y = centerY - Math.max(-zoomCents, Math.min(zoomCents, sample.cents)) / zoomCents * (rowH * 0.42);
            if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y);
          });
          ctx.stroke();
          samples.forEach((sample) => {
            if (sample.cents === null) return;
            const age = now - sample.time;
            if (age < 0 || age > windowSeconds * 1000) return;
            const x = left + (1 - age / (windowSeconds * 1000)) * plotW;
            const y = centerY - Math.max(-zoomCents, Math.min(zoomCents, sample.cents)) / zoomCents * (rowH * 0.42);
            ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fillStyle = track.color; ctx.fill();
          });
          ctx.stroke();
          ctx.shadowBlur = 0;
        });

        ctx.fillStyle = '#90a4bf';
        ctx.textAlign = 'left';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(`−${windowSeconds} s`, left, h - 9);
        ctx.textAlign = 'center';
        ctx.fillText(`−${windowSeconds / 2} s`, left + plotW / 2, h - 9);
        ctx.textAlign = 'right';
        ctx.fillText('Most', w - right, h - 9);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [zoomCents, windowSeconds]);

  const changeZoom = (factor: number) => setZoomCents((current) =>
    Math.max(MIN_ZOOM_CENTS, Math.min(MAX_ZOOM_CENTS, Math.round(current * factor)))
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      pinchDistanceRef.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2 && pinchDistanceRef.current !== null) {
      const points = [...pointersRef.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (distance > 0 && Math.abs(distance - pinchDistanceRef.current) > 8) {
        changeZoom(distance > pinchDistanceRef.current ? 0.88 : 1.14);
        pinchDistanceRef.current = distance;
      }
    }
  };
  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchDistanceRef.current = null;
  };

  return (
    <section className="w-full rounded-xl border border-white/10 bg-[#080e18] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">Hangmagasság-követés</h3>
          <p className="text-[10px] text-slate-400">Élő mérés · 1× alaphang · 2× oktáv · 3× kvint</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => changeZoom(1.25)} aria-label="Nagyítás" className="h-8 w-8 rounded-lg border border-slate-700 text-lg text-slate-200">+</button>
          <button type="button" onClick={() => changeZoom(0.8)} aria-label="Kicsinyítés" className="h-8 w-8 rounded-lg border border-slate-700 text-lg text-slate-200">−</button>
        </div>
      </div>
      <div
        className="overflow-hidden rounded-lg border border-slate-800 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); changeZoom(event.deltaY < 0 ? 0.9 : 1.1); } }}
      >
        <canvas ref={canvasRef} width={720} height={390} className="block h-[330px] w-full" />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
        <div className="flex items-center gap-1" aria-label="Időablak">
          <span className="mr-1">Idő:</span>
          {[2, 5, 10].map((seconds) => (
            <button key={seconds} type="button" onClick={() => setWindowSeconds(seconds)} aria-pressed={windowSeconds === seconds}
              className={`rounded-md border px-2 py-1 ${windowSeconds === seconds ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>
              {seconds} s
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span>Függőleges tartomány: ±{zoomCents} cent</span>
          <button type="button" onClick={() => { setZoomCents(100); setWindowSeconds(5); }} className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">Alaphelyzet</button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-[10px]">
        <div>
          <div className="font-semibold text-slate-300">Független YIN-ellenőrzés</div>
          <div className="text-slate-500">Periodicitás-alapú becslés · diagnosztika, nem automatikus korrekció</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-slate-200">{yinFrequencyHz !== null ? yinFrequencyHz.toFixed(2) + ' Hz' : 'Nincs stabil becslés'}</div>
          <div className={yinAgreementCents === null ? 'text-slate-500' : Math.abs(yinAgreementCents) <= 5 && yinClarity >= 0.8 ? 'text-emerald-300' : 'text-amber-300'}>
            {yinAgreementCents === null ? 'Nincs összehasonlítható adat' : 'Eltérés az alaphoz: ' + (yinAgreementCents > 0 ? '+' : '') + yinAgreementCents.toFixed(1) + ' cent'}
            {' · tisztaság ' + Math.round(yinClarity * 100) + '%'}
          </div>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Két ujjal csippentve a cent-skála nagyítható/kicsinyíthető. Az időablak külön állítható. A YIN-érték önálló ellenőrzés; az eltérés oktávhibát vagy gyenge jelet is jelezhet.</p>
    </section>
  );
};
