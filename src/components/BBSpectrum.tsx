import React, { useEffect, useRef, useState } from 'react';
import type { ResonanceMeasurement } from '../types/tuner';
import { bbAudioEngine } from '../audio/audioEngine';
import { isWithinTuningTolerance, type TuningToleranceMode } from '../audio/tuningTolerance';
import { findPeakNearFrequency, findSignificantSpectralPeaks, type SignificantSpectralPeak } from '../audio/peakSpectrum';
import { getStrobeBandTargetHz, type StrobeBandConfig } from '../audio/strobeBands';

interface Props {
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  hasSignal: boolean;
  toleranceOverrideCents?: number | null;
  toleranceMode?: TuningToleranceMode;
  customStrobeBands?: StrobeBandConfig[];
  onSelectPeak?: (role: 'fundamental' | 'fifth' | 'octave') => void;
  onZoomTargetHz?: (targetHz: number) => void;
  zoomTargetHz?: number | null;
  onClearZoom?: () => void;
}
const COLORS = { fundamental: '#fbbf24', octave: '#22d3ee', fifth: '#c084fc' };
const NOTES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

export function getSpectrumFrequencyRange(baseHz: number): { lowHz: number; highHz: number } {
  const base = Number.isFinite(baseHz) && baseHz > 0 ? baseHz : 146.83;
  return { lowHz: Math.max(20, base * Math.pow(2, -1 / 12)), highHz: base * 3 * Math.pow(2, 1 / 12) };
}

export function getSpectrumDisplayRange(baseHz: number, zoomTargetHz?: number | null): { lowHz: number; highHz: number } {
  const base = Number.isFinite(baseHz) && baseHz > 0 ? baseHz : 146.83;
  if (Number.isFinite(zoomTargetHz) && (zoomTargetHz ?? 0) >= 20 && (zoomTargetHz ?? 0) <= 20000) {
    const target = zoomTargetHz as number;
    const ratio = Math.pow(2, 260 / 1200);
    return { lowHz: Math.max(20, target / ratio), highHz: Math.min(20000, target * ratio) };
  }
  return getSpectrumFrequencyRange(base);
}

function noteName(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '--';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return NOTES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

interface HoverInfo {
  x: number;
  y: number;
  frequencyHz: number;
  amplitudeDb: number;
  relativeDb: number;
  multipleOfBase: number;
  isPeak: boolean;
}

export const BBSpectrum: React.FC<Props> = ({
  alap, kvint, oktav, hasSignal, toleranceOverrideCents = null, toleranceMode = 'auto', customStrobeBands = [], onSelectPeak,
  zoomTargetHz = null, onZoomTargetHz, onClearZoom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peakDisplayEnabled, setPeakDisplayEnabled] = useState(true);
  const latest = useRef({ alap, kvint, oktav, hasSignal, toleranceOverrideCents, toleranceMode, customStrobeBands, zoomTargetHz, peakDisplayEnabled });
  const peakMaxDbRef = useRef<Record<number, number>>({});
  latest.current = { alap, kvint, oktav, hasSignal, toleranceOverrideCents, toleranceMode, customStrobeBands, zoomTargetHz, peakDisplayEnabled };
  const peaksRef = useRef<SignificantSpectralPeak[]>([]);
  const lastPeakUpdateRef = useRef(0);
  const [peakRows, setPeakRows] = useState<Array<SignificantSpectralPeak & { maxAmplitudeDb: number }>>([]);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;

    const draw = (now: number) => {
      const s = latest.current;
      const w = canvas.width, h = canvas.height, L = 54, R = 16, T = 82, B = 36;
      const pw = w - L - R, ph = h - T - B;
      const rawBase = s.alap.targetHz ?? 146.83;
      const base = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 146.83;
      const { lowHz: low, highHz: high } = getSpectrumDisplayRange(base, s.zoomTargetHz);
      const minDb = -100, maxDb = -20;
      const X = (hz: number) => L + (hz - low) / (high - low) * pw;
      const Y = (db: number) => T + (maxDb - Math.max(minDb, Math.min(maxDb, db))) / (maxDb - minDb) * ph;

      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a101b'); bg.addColorStop(1, '#070b12');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0b1421'; ctx.fillRect(L, T, pw, ph);
      ctx.font = '12px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      [-20, -40, -60, -80, -100].forEach((db) => {
        const y = Y(db); ctx.strokeStyle = '#253348'; ctx.beginPath();
        ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
        ctx.fillStyle = '#8192aa'; ctx.fillText(String(db), L - 9, y);
      });
      ctx.fillStyle = '#8192aa'; ctx.textAlign = 'left'; ctx.fillText('dBFS', 12, T - 12);
      const step = high - low > 850 ? 100 : high - low > 350 ? 50 : high - low > 150 ? 25 : 10;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let hz = Math.ceil(low / step) * step; hz <= high; hz += step) {
        const x = X(hz); ctx.strokeStyle = '#1b2a3d'; ctx.beginPath();
        ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
        ctx.fillStyle = '#91a4bf'; ctx.fillText(String(hz), x, T + ph + 7);
      }
      ctx.fillStyle = '#91a4bf'; ctx.font = '13px system-ui'; ctx.fillText('Frekvencia (Hz)', L + pw / 2, h - 18);

      const data = bbAudioEngine.getFloatFrequencyData();
      const sampleRate = bbAudioEngine.getSampleRate();
      const binWidth = sampleRate / (data.length * 2);
      const points: Array<{ x: number; y: number }> = [];
      let maxInView = -Infinity;
      for (let bin = 1; bin < data.length; bin += 1) {
        const hz = bin * binWidth;
        if (hz < low || hz > high) continue;
        const value = Number.isFinite(data[bin]) ? data[bin] : minDb;
        maxInView = Math.max(maxInView, value);
        points.push({ x: X(hz), y: Y(value) });
      }

      if (points.length) {
        ctx.beginPath(); ctx.moveTo(points[0].x, T + ph);
        points.forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.lineTo(points[points.length - 1].x, T + ph); ctx.closePath();
        const gradient = ctx.createLinearGradient(0, T, 0, T + ph);
        gradient.addColorStop(0, 'rgba(56,189,248,.17)');
        gradient.addColorStop(1, 'rgba(56,189,248,.005)');
        ctx.fillStyle = gradient; ctx.fill();
        ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.strokeStyle = '#3baed4'; ctx.lineWidth = 1.6; ctx.stroke();
      }

      // The dark/light dashed lines mark custom stroboscope band targets over the FFT trace.
      s.customStrobeBands.filter((band) => band.enabled).forEach((band, index) => {
        const targetHz = getStrobeBandTargetHz(band, base);
        if (!Number.isFinite(targetHz) || targetHz < low || targetHz > high) return;
        const x = X(targetHz);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(2,6,23,.92)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
        ctx.strokeStyle = 'rgba(203,213,225,.75)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '9px system-ui'; ctx.textAlign = x > w - 125 ? 'right' : 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(band.name.slice(0, 18), x + (x > w - 125 ? -3 : 3), T + 5 + (index % 3) * 10);
        ctx.restore();
      });

      const exactPeaks = s.hasSignal && Number.isFinite(maxInView)
        ? findSignificantSpectralPeaks(data, sampleRate, base, {
            minFrequencyHz: low, maxFrequencyHz: high, minimumAmplitudeDb: -88,
            dynamicRangeDb: 48, minPeakDistanceBins: 2, maxPeaks: 120,
          })
        : [];
      peaksRef.current = exactPeaks;
      exactPeaks.forEach((peak) => {
        peakMaxDbRef.current[peak.bin] = Math.max(peakMaxDbRef.current[peak.bin] ?? -Infinity, peak.amplitudeDb);
      });
      if (now - lastPeakUpdateRef.current > 200) {
        lastPeakUpdateRef.current = now;
        setPeakRows([...exactPeaks].sort((a, b) => b.amplitudeDb - a.amplitudeDb).slice(0, 8)
          .map((peak) => ({ ...peak, maxAmplitudeDb: peakMaxDbRef.current[peak.bin] ?? peak.amplitudeDb })));
      }

      // Peak markers report exact FFT-bin locations; the optional overlay can be hidden independently.
      if (s.peakDisplayEnabled) exactPeaks.forEach((peak) => {
        const x = X(peak.frequencyHz), y = Y(peak.amplitudeDb);
        ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x, T + ph); ctx.strokeStyle = 'rgba(226,232,240,.38)';
        ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = peak.relativeDb > -12 ? '#f8fafc' : peak.relativeDb > -28 ? '#93c5fd' : '#64748b';
        ctx.fill();
      });

      const tracked = [
        { role: 'fundamental' as const, label: '1× Alaphang', m: s.alap, fallback: base, color: COLORS.fundamental },
        { role: 'octave' as const, label: '2× Oktáv', m: s.oktav, fallback: base * 2, color: COLORS.octave },
        { role: 'fifth' as const, label: '3× Összetett kvint', m: s.kvint, fallback: base * 3, color: COLORS.fifth },
      ];
      tracked.forEach((p, i) => {
        const rawTarget = p.m.targetHz ?? p.fallback;
        const target = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : p.fallback;
        const rawMeasured = p.m.measuredHz;
        const hz = rawMeasured !== null && Number.isFinite(rawMeasured) && (p.m.status === 'valid' || p.m.status === 'held') ? rawMeasured : target;
        if (hz < low || hz > high) return;
        const x = X(hz), bin = Math.max(0, Math.min(data.length - 1, Math.round(hz / binWidth)));
        const db = s.hasSignal && Number.isFinite(data[bin]) ? data[bin] : -75;
        const y = Y(db);
        // Static target line mirrors the reference peak-spectrum guide; the colored dot below is the measured peak.
        const targetX = X(target);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(targetX, T); ctx.lineTo(targetX, T + ph); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, T - 3); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
        const cw = 118, ch = 64, cx = Math.max(4, Math.min(w - cw - 4, x - cw / 2)), cy = 5 + (i === 1 ? 4 : 0);
        ctx.fillStyle = '#0a1320'; ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 12); ctx.fill(); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = p.color; ctx.font = 'bold 17px system-ui';
        ctx.fillText(p.m.noteName || noteName(target), cx + cw / 2, cy + 17);
        ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 15px ui-monospace';
        ctx.fillText(s.hasSignal && p.m.measuredHz !== null ? p.m.measuredHz.toFixed(2) + ' Hz' : target.toFixed(2) + ' Hz', cx + cw / 2, cy + 37);
        const cents = p.m.deviationCents;
        const isCurrentValidReading = p.m.status === 'valid' && s.hasSignal;
        ctx.fillStyle = !isCurrentValidReading || cents === null
          ? '#94a3b8'
          : isWithinTuningTolerance(cents, target, s.toleranceOverrideCents, s.toleranceMode) ? '#34d399' : '#fbbf24';
        ctx.font = 'bold 14px ui-monospace';
        ctx.fillText(!isCurrentValidReading || cents === null ? '— cent' : (cents > 0 ? '+' : '') + cents.toFixed(1) + ' c', cx + cw / 2, cy + 54);
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xCss = event.clientX - rect.left;
    const yCss = event.clientY - rect.top;
    const x = xCss * canvas.width / rect.width;
    const L = 54, R = 16, plotWidth = canvas.width - L - R;
    if (x < L || x > canvas.width - R) { setHoverInfo(null); return; }
    const s = latest.current;
    const rawBase = s.alap.targetHz ?? 146.83;
    const base = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 146.83;
    const { lowHz: low, highHz: high } = getSpectrumDisplayRange(base, s.zoomTargetHz);
    const frequencyHz = low + ((x - L) / plotWidth) * (high - low);
    const data = bbAudioEngine.getFloatFrequencyData();
    const sampleRate = bbAudioEngine.getSampleRate();
    const binWidth = sampleRate / (data.length * 2);
    const bin = Math.max(1, Math.min(data.length - 1, Math.round(frequencyHz / binWidth)));
    const amplitudeDb = Number.isFinite(data[bin]) ? data[bin] : -100;
    let maximumDb = -Infinity;
    for (let i = 1; i < data.length; i += 1) {
      const hz = i * binWidth;
      if (hz >= low && hz <= high && Number.isFinite(data[i])) maximumDb = Math.max(maximumDb, data[i]);
    }
    const peak = peaksRef.current.reduce<SignificantSpectralPeak | null>((closest, item) => {
      if (!closest || Math.abs(item.frequencyHz - frequencyHz) < Math.abs(closest.frequencyHz - frequencyHz)) return item;
      return closest;
    }, null);
    const isPeak = Boolean(peak && Math.abs(peak.frequencyHz - frequencyHz) <= binWidth * 2);
    setHoverInfo({
      x: xCss, y: yCss, frequencyHz,
      amplitudeDb, relativeDb: Number.isFinite(maximumDb) ? amplitudeDb - maximumDb : 0,
      multipleOfBase: frequencyHz / base, isPeak,
    });
  };

  const tracked = [
    { role: 'fundamental' as const, label: '1× Alaphang', m: alap, fallback: alap.targetHz ?? 146.83, color: COLORS.fundamental },
    { role: 'octave' as const, label: '2× Oktáv', m: oktav, fallback: (alap.targetHz ?? 146.83) * 2, color: COLORS.octave },
    { role: 'fifth' as const, label: '3× Összetett kvint', m: kvint, fallback: (alap.targetHz ?? 146.83) * 3, color: COLORS.fifth },
  ];

  const zoomLabel = zoomTargetHz !== null && Number.isFinite(zoomTargetHz)
    ? 'Nagyítás: ' + zoomTargetHz.toFixed(2) + ' Hz'
    : 'Teljes 1×–3× áttekintés';

  return (
    <section className="my-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#080e18] shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 pb-1">
        <div>
          <h3 className="text-sm font-bold text-white">Frekvenciaspektrum · pontos csúcsok</h3>
          <p className="text-[11px] text-slate-400">Azonosított parciálisok, zajpadló-szűrés; csúcsra bökve nagyítás</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setPeakDisplayEnabled((enabled) => !enabled)} aria-pressed={peakDisplayEnabled}
            className="rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300">{peakDisplayEnabled ? 'Csúcsjelölők: be' : 'Csúcsjelölők: ki'}</button>
          <button type="button" onClick={() => { peakMaxDbRef.current = {}; setPeakRows([]); }} disabled={!hasSignal}
            className="rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300 disabled:opacity-40">Maximum törlése</button>
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{hasSignal ? 'Élő mérés' : 'Várakozás'}</span>
          {zoomTargetHz !== null && Number.isFinite(zoomTargetHz) && (
            <button type="button" onClick={onClearZoom} className="rounded-lg border border-cyan-400/30 px-2 py-1.5 text-[10px] font-semibold text-cyan-200">Nagyítás törlése</button>
          )}
        </div>
      </div>
      <div className="px-3 pb-1 text-[10px] text-slate-500">{zoomLabel} · pont fölé állva frekvencia, alaphangarány és relatív hangerő látható.</div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={760}
          height={300}
          aria-label="Frekvenciaspektrum jelentős spektrumcsúcsokkal"
          className="block h-[270px] sm:h-[300px] w-full cursor-crosshair touch-pan-y"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverInfo(null)}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - rect.left) * event.currentTarget.width / rect.width;
            const L = 54, plotWidth = event.currentTarget.width - L - 16;
            const rawBase = alap.targetHz ?? 146.83;
            const base = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : 146.83;
            const { lowHz: low, highHz: high } = getSpectrumDisplayRange(base, zoomTargetHz);
            const hz = low + ((x - L) / plotWidth) * (high - low);
            const analyserData = bbAudioEngine.getFloatFrequencyData();
            const binWidth = bbAudioEngine.getSampleRate() / (analyserData.length * 2);
            const nearestPeak = findPeakNearFrequency(peaksRef.current, hz, Math.max(binWidth * 2.5, (high - low) / plotWidth * 8));
            if (nearestPeak && onZoomTargetHz) {
              onZoomTargetHz(nearestPeak.frequencyHz);
              return;
            }
            if (!onSelectPeak) return;
            const choices = tracked.map((p) => ({
              ...p,
              hz: p.m.measuredHz !== null && Number.isFinite(p.m.measuredHz) && (p.m.status === 'valid' || p.m.status === 'held')
                ? p.m.measuredHz : p.m.targetHz ?? p.fallback,
            }));
            const selected = choices.reduce((closest, item) =>
              Math.abs(item.hz - hz) < Math.abs(closest.hz - hz) ? item : closest);
            onSelectPeak(selected.role);
          }}
        />
        {hoverInfo && (
          <div
            className="pointer-events-none absolute z-10 max-w-[220px] rounded-lg border border-slate-600 bg-slate-950/95 px-2.5 py-2 text-[10px] text-white shadow-xl"
            style={{ left: Math.min(hoverInfo.x + 12, 500), top: Math.max(4, hoverInfo.y - 58) }}
          >
            <div className="font-mono font-bold">{hoverInfo.frequencyHz.toFixed(2)} Hz · {hoverInfo.multipleOfBase.toFixed(3)}× alap</div>
            <div className="mt-0.5 text-slate-300">{hoverInfo.relativeDb.toFixed(1)} dB a legerősebb csúcshoz képest</div>
            <div className="text-slate-500">{hoverInfo.amplitudeDb.toFixed(1)} dBFS · {hoverInfo.isPeak ? 'azonosított csúcs' : 'mért bin'}</div>
          </div>
        )}
      </div>
      <div className="border-t border-white/5 px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold text-slate-200">Legerősebb spektrumcsúcsok</h4>
          <span className="text-[10px] text-slate-500">{hasSignal ? peakRows.length + ' csúcs listázva' : 'Mérés indítására vár'}</span>
        </div>
        {hasSignal && peakRows.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {peakRows.map((peak) => (
              <button
                key={peak.bin}
                type="button"
                onClick={() => onZoomTargetHz?.(peak.frequencyHz)}
                aria-label={'Spektrum nagyítása ' + peak.frequencyHz.toFixed(2) + ' Hz csúcsra'}
                title="Nagyítás erre a csúcsra"
                className="min-w-0 rounded-lg border border-white/5 bg-white/[0.025] px-2 py-1.5 text-left hover:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
              >
                <div className="truncate font-mono text-[11px] font-semibold text-slate-100">{peak.frequencyHz.toFixed(2)} Hz</div>
                <div className="text-[10px] text-cyan-200">{peak.multipleOfBase.toFixed(3)}× alap</div>
                <div className="text-[10px] text-slate-500">{peak.relativeDb.toFixed(1)} dB relatív · max {peak.maxAmplitudeDb.toFixed(1)} dBFS</div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] leading-relaxed text-slate-500">A zajpadló felett azonosítható helyi maximumok itt jelennek meg; a frekvenciák a tényleges FFT-binből származnak, nem interpolált értékek.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/5 px-3 py-2 text-[11px] text-slate-400">
        {tracked.map((peak) => <span key={peak.role} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: peak.color }} />{peak.label}</span>)}
      </div>
    </section>
  );
};
