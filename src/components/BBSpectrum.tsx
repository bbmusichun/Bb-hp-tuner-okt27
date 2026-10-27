import React, { useEffect, useRef } from 'react';
import { ResonanceMeasurement } from '../types/tuner';
import { bbAudioEngine } from '../audio/audioEngine';

interface Props {
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  hasSignal: boolean;
  onSelectPeak?: (role: 'fundamental' | 'fifth' | 'octave') => void;
}

export const BBSpectrum: React.FC<Props> = ({
  alap,
  kvint,
  oktav,
  hasSignal,
  onSelectPeak,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestMeasurementsRef = useRef({ alap, kvint, oktav, hasSignal });
  latestMeasurementsRef.current = { alap, kvint, oktav, hasSignal };

  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render() {
      if (!ctx || !canvas) return;
      const measurement = latestMeasurementsRef.current;
      const w = canvas.width;
      const h = canvas.height;

      const padL = 32;
      const padR = 12;
      const padT = 36;
      const padB = 22;

      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      ctx.clearRect(0, 0, w, h);

      // Panel background
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, w, h);

      // dB Axis grid lines: -20, -40, -60, -80, -100 dB
      const dbTicks = [-20, -40, -60, -80, -100];
      const minDb = -100;
      const maxDb = -20;

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      ctx.fillText('dB', padL - 6, padT - 12);

      dbTicks.forEach((db) => {
        const normY = (db - maxDb) / (minDb - maxDb);
        const y = padT + normY * plotH;

        // Grid horizontal line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.fillText(`${db}`, padL - 4, y);
      });

      // Frequency ticks: 0, 100, 200, 300, 400, 500, 600, 700, 800, 1k
      const maxFreq = 2400;
      const freqTicks = [0, 200, 400, 600, 800, 1000, 1200, 1600, 2000, 2400];

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      freqTicks.forEach((f) => {
        const x = padL + (f / maxFreq) * plotW;

        // Grid vertical line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.fillText(f === 1000 ? '1k' : `${f}`, x, padT + plotH + 3);
      });

      // Horizontal axis title
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText('Frekvencia (Hz)', padL + plotW / 2, padT + plotH + 12);

      // FFT Curve
      const freqData = bbAudioEngine.getFloatFrequencyData();
      const sampleRate = bbAudioEngine.getSampleRate();
      const binCount = freqData.length;
      const binWidth = sampleRate / (binCount * 2);
      const maxBin = Math.min(binCount - 1, Math.ceil(maxFreq / binWidth));

      ctx.beginPath();
      let started = false;

      for (let i = 1; i <= maxBin; i++) {
        const f = i * binWidth;
        const x = padL + (f / maxFreq) * plotW;
        const valDb = Math.max(minDb, Math.min(maxDb, measurement.hasSignal ? freqData[i] : minDb));
        const normY = (valDb - maxDb) / (minDb - maxDb);
        const y = padT + normY * plotH;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      // Cyan fill gradient
      const bottomY = padT + plotH;
      ctx.lineTo(padL + plotW, bottomY);
      ctx.lineTo(padL, bottomY);
      ctx.closePath();

      const fillGrad = ctx.createLinearGradient(0, padT, 0, bottomY);
      fillGrad.addColorStop(0, measurement.hasSignal ? 'rgba(0, 192, 240, 0.28)' : 'rgba(56, 189, 248, 0.08)');
      fillGrad.addColorStop(1, 'rgba(0, 192, 240, 0.0)');
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Stroke line
      ctx.beginPath();
      started = false;
      for (let i = 1; i <= maxBin; i++) {
        const f = i * binWidth;
        const x = padL + (f / maxFreq) * plotW;
        const valDb = Math.max(minDb, Math.min(maxDb, measurement.hasSignal ? freqData[i] : minDb));
        const normY = (valDb - maxDb) / (minDb - maxDb);
        const y = padT + normY * plotH;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = measurement.hasSignal ? '#00e5ff' : '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Resonant Peak Pins (Alaphang, 3. parciális, Oktáv)
      const peaks = [
        {
          role: 'fundamental' as const,
          color: '#f59e0b', // Amber/gold
          hz: measurement.alap.status === 'valid' && measurement.alap.measuredHz !== null ? measurement.alap.measuredHz : measurement.alap.targetHz || 146.83,
          note: measurement.alap.noteName || 'D3',
          visible: true,
        },
        {
          role: 'fifth' as const,
          color: '#c084fc', // Purple
          hz: measurement.kvint.status === 'valid' && measurement.kvint.measuredHz !== null ? measurement.kvint.measuredHz : measurement.kvint.targetHz || 440.50,
          note: measurement.kvint.noteName || 'A4',
          visible: true,
        },
        {
          role: 'octave' as const,
          color: '#38bdf8', // Cyan
          hz: measurement.oktav.status === 'valid' && measurement.oktav.measuredHz !== null ? measurement.oktav.measuredHz : measurement.oktav.targetHz || 293.66,
          note: measurement.oktav.noteName || 'D4',
          visible: true,
        },
      ];

      peaks.forEach((p) => {
        if (!p.visible || p.hz <= 0 || p.hz > maxFreq) return;

        const x = padL + (p.hz / maxFreq) * plotW;
        // Find approximate peak dB or calculate height
        const bin = Math.round(p.hz / binWidth);
        const peakDb = measurement.hasSignal && freqData[bin] ? Math.max(-85, Math.min(-20, freqData[bin])) : -45;
        const normY = (peakDb - maxDb) / (minDb - maxDb);
        const peakY = measurement.hasSignal ? padT + normY * plotH : padT + 0.35 * plotH;

        // Vertical dashed pin line
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.moveTo(x, padT - 4);
        ctx.lineTo(x, peakY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Peak Circle Dot
        ctx.beginPath();
        ctx.arc(x, peakY, 4, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = '#0b0f14';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Pin Label (e.g. "D3" above, "146.8 Hz" below)
        ctx.textAlign = 'center';
        ctx.fillStyle = p.color;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(p.note, x, padT - 22);

        ctx.font = '8px monospace';
        ctx.fillText(`${p.hz.toFixed(1)} Hz`, x, padT - 11);
      });

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="w-full bg-[#0b0f14] rounded-xl border border-white/5 overflow-hidden shadow-lg p-1.5 my-1">
      <canvas
        ref={canvasRef}
        width={380}
        height={140}
        className="w-full h-[140px] block cursor-pointer"
        onClick={(e) => {
          if (!onSelectPeak) return;
          const canvas = e.currentTarget;
          const rect = canvas.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
          const plotLeft = 32;
          const plotWidth = canvas.width - plotLeft - 12;
          const frequencyAtClick = ((canvasX - plotLeft) / plotWidth) * 2400;
          if (frequencyAtClick < 0 || frequencyAtClick > 2400) return;

          const peakCandidates = [
            {
              role: 'fundamental' as const,
              hz: alap.status === 'valid' && alap.measuredHz !== null ? alap.measuredHz : alap.targetHz ?? 146.83,
            },
            {
              role: 'fifth' as const,
              hz: kvint.status === 'valid' && kvint.measuredHz !== null ? kvint.measuredHz : kvint.targetHz ?? 440.50,
            },
            {
              role: 'octave' as const,
              hz: oktav.status === 'valid' && oktav.measuredHz !== null ? oktav.measuredHz : oktav.targetHz ?? 293.66,
            },
          ];
          const nearest = peakCandidates.reduce((best, peak) =>
            Math.abs(peak.hz - frequencyAtClick) < Math.abs(best.hz - frequencyAtClick) ? peak : best
          );
          onSelectPeak(nearest.role);
        }}
      />
    </div>
  );
};
