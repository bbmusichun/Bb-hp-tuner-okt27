import React, { useEffect, useRef, useState } from 'react';
import { ResonanceMeasurement } from '../types/tuner';
import { bbAudioEngine } from '../audio/audioEngine';
import { isWithinTuningTolerance, type TuningToleranceSetting } from '../audio/tuningTolerance';
import {
  getSpectrumCursorReadout,
  getSpectrumZoomRange,
  type SpectrumZoomRole,
} from '../audio/spectrumInteraction';

export { getSpectrumFrequencyRange } from '../audio/spectrumInteraction';

interface Props {
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  hasSignal: boolean;
  toleranceOverrideCents?: TuningToleranceSetting;
  onSelectPeak?: (role: 'fundamental' | 'fifth' | 'octave') => void;
}

interface CursorPosition {
  x: number;
  y: number;
}

const COLORS = {
  fundamental: '#fbbf24',
  octave: '#22d3ee',
  fifth: '#c084fc',
};
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const ZOOM_OPTIONS: Array<{ value: SpectrumZoomRole; label: string }> = [
  { value: 'all', label: 'Teljes' },
  { value: 'fundamental', label: '1× Alaphang' },
  { value: 'octave', label: '2× Oktáv' },
  { value: 'fifth', label: '3× Parciális' },
];

function noteName(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '--';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return NOTES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export const BBSpectrum: React.FC<Props> = ({
  alap,
  kvint,
  oktav,
  hasSignal,
  toleranceOverrideCents = null,
  onSelectPeak,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<CursorPosition | null>(null);
  const [zoomRole, setZoomRole] = useState<SpectrumZoomRole>('all');
  const latest = useRef({ alap, kvint, oktav, hasSignal, toleranceOverrideCents, zoomRole });
  latest.current = { alap, kvint, oktav, hasSignal, toleranceOverrideCents, zoomRole };

  const getView = () => {
    const state = latest.current;
    const rawBase = state.alap.targetHz ?? 146.83;
    const base = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 146.83;
    const targets = {
      fundamentalHz: state.alap.targetHz ?? base,
      octaveHz: state.oktav.targetHz ?? base * 2,
      fifthHz: state.kvint.targetHz ?? base * 3,
    };
    return {
      base,
      range: getSpectrumZoomRange(base, targets, state.zoomRole),
    };
  };

  const pointerToCanvas = (event: React.PointerEvent<HTMLCanvasElement>): CursorPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * event.currentTarget.width / rect.width,
      y: (event.clientY - rect.top) * event.currentTarget.height / rect.height,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    cursorRef.current = pointerToCanvas(event);
  };

  const handlePointerLeave = () => {
    cursorRef.current = null;
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectPeak) return;
    const cursor = pointerToCanvas(event as unknown as React.PointerEvent<HTMLCanvasElement>);
    const { base, range } = getView();
    const left = 54;
    const top = 84;
    const plot = { left, top, width: event.currentTarget.width - left - 16, height: event.currentTarget.height - top - 36 };
    const readout = getSpectrumCursorReadout(
      cursor.x,
      top + plot.height / 2,
      plot,
      range,
      base,
    );
    if (!readout) return;

    const current = latest.current;
    const candidates = [
      { role: 'fundamental' as const, hz: current.alap.measuredHz ?? current.alap.targetHz ?? base },
      { role: 'octave' as const, hz: current.oktav.measuredHz ?? current.oktav.targetHz ?? base * 2 },
      { role: 'fifth' as const, hz: current.kvint.measuredHz ?? current.kvint.targetHz ?? base * 3 },
    ].map((item) => ({
      ...item,
      hz: Number.isFinite(item.hz) && item.hz > 0 ? item.hz : base,
    }));
    onSelectPeak(candidates.reduce((closest, item) =>
      Math.abs(item.hz - readout.frequencyHz) < Math.abs(closest.hz - readout.frequencyHz) ? item : closest,
    ).role);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let animationId = 0;
    const draw = () => {
      const state = latest.current;
      const width = canvas.width;
      const height = canvas.height;
      const left = 54;
      const right = 16;
      const top = 84;
      const bottom = 36;
      const plotWidth = width - left - right;
      const plotHeight = height - top - bottom;
      const minDb = -100;
      const maxDb = -20;
      const rawBase = state.alap.targetHz ?? 146.83;
      const base = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 146.83;
      const targets = {
        fundamentalHz: state.alap.targetHz ?? base,
        octaveHz: state.oktav.targetHz ?? base * 2,
        fifthHz: state.kvint.targetHz ?? base * 3,
      };
      const { lowHz: low, highHz: high } = getSpectrumZoomRange(base, targets, state.zoomRole);
      const xForFrequency = (hz: number) => left + (hz - low) / (high - low) * plotWidth;
      const yForDb = (db: number) => top +
        (maxDb - Math.max(minDb, Math.min(maxDb, db))) / (maxDb - minDb) * plotHeight;

      ctx.clearRect(0, 0, width, height);
      const background = ctx.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, '#0a101b');
      background.addColorStop(1, '#070b12');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#0b1421';
      ctx.fillRect(left, top, plotWidth, plotHeight);

      ctx.font = '12px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      [-20, -40, -60, -80, -100].forEach((db) => {
        const y = yForDb(db);
        ctx.strokeStyle = '#253348';
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.fillStyle = '#8192aa';
        ctx.fillText(String(db), left - 9, y);
      });
      ctx.fillStyle = '#8192aa';
      ctx.textAlign = 'left';
      ctx.fillText('dBFS', 10, top - 12);

      const span = high - low;
      const step = span > 850 ? 100 : span > 400 ? 50 : span > 180 ? 20 : span > 80 ? 10 : span > 35 ? 5 : 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let hz = Math.ceil(low / step) * step; hz <= high; hz += step) {
        const x = xForFrequency(hz);
        ctx.strokeStyle = '#1b2a3d';
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotHeight);
        ctx.stroke();
        ctx.fillStyle = '#91a4bf';
        ctx.fillText(String(hz), x, top + plotHeight + 7);
      }
      ctx.fillStyle = '#91a4bf';
      ctx.font = '13px system-ui';
      ctx.fillText('Frekvencia (Hz)', left + plotWidth / 2, height - 18);

      const data = bbAudioEngine.getFloatFrequencyData();
      const sampleRate = bbAudioEngine.getSampleRate();
      const binWidth = sampleRate / (data.length * 2);
      const points: Array<{ x: number; y: number }> = [];
      for (let index = 1; index < data.length; index += 1) {
        const hz = index * binWidth;
        if (hz >= low && hz <= high) {
          points.push({ x: xForFrequency(hz), y: yForDb(Number.isFinite(data[index]) ? data[index] : minDb) });
        }
      }
      if (points.length) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, top + plotHeight);
        points.forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.lineTo(points[points.length - 1].x, top + plotHeight);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, top, 0, top + plotHeight);
        fill.addColorStop(0, 'rgba(56,189,248,.17)');
        fill.addColorStop(1, 'rgba(56,189,248,.005)');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.beginPath();
        points.forEach((point, index) => index
          ? ctx.lineTo(point.x, point.y)
          : ctx.moveTo(point.x, point.y));
        ctx.strokeStyle = '#3baed4';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      const peaks = [
        { role: 'fundamental' as const, label: '1× Alaphang', measurement: state.alap, fallback: base, color: COLORS.fundamental },
        { role: 'octave' as const, label: '2× Oktáv', measurement: state.oktav, fallback: base * 2, color: COLORS.octave },
        { role: 'fifth' as const, label: '3× Parciális', measurement: state.kvint, fallback: base * 3, color: COLORS.fifth },
      ];
      peaks.forEach((peak, index) => {
        const rawTarget = peak.measurement.targetHz ?? peak.fallback;
        const target = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : peak.fallback;
        const rawMeasured = peak.measurement.measuredHz;
        const hz = rawMeasured !== null &&
          Number.isFinite(rawMeasured) &&
          (peak.measurement.status === 'valid' || peak.measurement.status === 'held')
          ? rawMeasured
          : target;
        if (hz < low || hz > high) return;

        const x = xForFrequency(hz);
        const bin = Math.max(0, Math.min(data.length - 1, Math.round(hz / binWidth)));
        const db = state.hasSignal && Number.isFinite(data[bin]) ? data[bin] : -75;
        const y = yForDb(db);
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = peak.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, top - 3);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();

        const cardWidth = 118;
        const cardHeight = 64;
        const cardX = Math.max(4, Math.min(width - cardWidth - 4, x - cardWidth / 2));
        const cardY = 7 + (index === 1 ? 5 : 0);
        ctx.fillStyle = '#0a1320';
        ctx.strokeStyle = peak.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 12);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = peak.color;
        ctx.font = 'bold 17px system-ui';
        ctx.fillText(peak.measurement.noteName || noteName(target), cardX + cardWidth / 2, cardY + 17);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px ui-monospace';
        ctx.fillText(
          state.hasSignal && peak.measurement.measuredHz !== null
            ? peak.measurement.measuredHz.toFixed(2) + ' Hz'
            : target.toFixed(2) + ' Hz',
          cardX + cardWidth / 2,
          cardY + 37,
        );
        const cents = peak.measurement.deviationCents;
        ctx.fillStyle = cents === null
          ? '#94a3b8'
          : isWithinTuningTolerance(cents, target, state.toleranceOverrideCents) ? '#34d399' : '#fbbf24';
        ctx.font = 'bold 14px ui-monospace';
        ctx.fillText(cents === null ? '— cent' : (cents > 0 ? '+' : '') + cents.toFixed(1) + ' c', cardX + cardWidth / 2, cardY + 54);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = peak.color;
        ctx.fill();
      });

      const cursor = cursorRef.current;
      if (cursor) {
        const readout = getSpectrumCursorReadout(
          cursor.x,
          cursor.y,
          { left, top, width: plotWidth, height: plotHeight },
          { lowHz: low, highHz: high },
          base,
          minDb,
          maxDb,
        );
        if (readout) {
          ctx.save();
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = 'rgba(226,232,240,.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cursor.x, top);
          ctx.lineTo(cursor.x, top + plotHeight);
          ctx.moveTo(left, cursor.y);
          ctx.lineTo(left + plotWidth, cursor.y);
          ctx.stroke();
          ctx.setLineDash([]);

          const boxWidth = 190;
          const boxHeight = 54;
          const boxX = Math.max(4, Math.min(width - boxWidth - 4, cursor.x + 10));
          const boxY = Math.max(top + 4, Math.min(top + plotHeight - boxHeight - 4, cursor.y - boxHeight - 8));
          ctx.fillStyle = 'rgba(5,10,18,.96)';
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
          ctx.fill();
          ctx.stroke();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 13px ui-monospace';
          ctx.fillText(readout.frequencyHz.toFixed(2) + ' Hz', boxX + 9, boxY + 14);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '11px ui-monospace';
          const cents = readout.centsFromFundamental;
          const relative = readout.ratioToFundamental.toFixed(3) + '× · ' +
            (cents > 0 ? '+' : '') + cents.toFixed(1) + ' cent';
          ctx.fillText(relative, boxX + 9, boxY + 30);
          ctx.fillText(readout.dbfs.toFixed(1) + ' dBFS', boxX + 9, boxY + 45);
          ctx.restore();
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, []);

  const { base, range } = getView();
  const handleZoom = (role: SpectrumZoomRole) => {
    setZoomRole(role);
    cursorRef.current = null;
  };

  return (
    <div className="my-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#080e18] shadow-lg">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
        <div>
          <h3 className="text-sm font-bold text-white">Frekvenciaspektrum · csúcsértékek</h3>
          <p className="text-[11px] text-slate-400">Kurzor: Hz · alapfrekvencia-arány · dBFS</p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">
          {hasSignal ? 'Élő mérés' : 'Várakozás'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
        <span className="mr-1 text-[10px] text-slate-500">Nézet:</span>
        {ZOOM_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleZoom(option.value)}
            aria-pressed={zoomRole === option.value}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
              zoomRole === option.value
                ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
                : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        width={760}
        height={300}
        className="block h-[270px] w-full cursor-crosshair sm:h-[300px]"
        aria-label="Interaktív frekvenciaspektrum. Mozgasd a kurzort a Hz, arány és dBFS leolvasásához; kattintással válassz rezonanciát."
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleCanvasClick}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/5 px-3 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />1× Alaphang</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-cyan-400" />2× Oktáv</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-purple-400" />3× Parciális</span>
      </div>
    </div>
  );
};
