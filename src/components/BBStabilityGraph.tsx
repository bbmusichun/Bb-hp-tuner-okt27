import React, { useEffect, useRef } from 'react';
import { bbAudioEngine } from '../audio/audioEngine';

interface Props {
  roleName: string;
  hasSignal: boolean;
  currentCents: number;
  standardDeviationCents: number;
}

export const BBStabilityGraph: React.FC<Props> = ({
  roleName,
  hasSignal,
  currentCents,
  standardDeviationCents,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render() {
      if (!ctx || !canvas) return;
      const w = canvas.width;
      const h = canvas.height;

      const padL = 26;
      const padR = 12;
      const padT = 10;
      const padB = 22;

      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const centerY = padT + plotH / 2;

      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, w, h);

      // Y-axis ticks: +5, 0, -5 cents
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      ctx.fillText('+5', padL - 4, padT);
      ctx.fillText('0', padL - 4, centerY);
      ctx.fillText('-5', padL - 4, padT + plotH);

      // Grid lines for +5, 0, -5
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;

      // +5 line
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(w - padR, padT);
      ctx.stroke();

      // -5 line
      ctx.beginPath();
      ctx.moveTo(padL, padT + plotH);
      ctx.lineTo(w - padR, padT + plotH);
      ctx.stroke();

      // Zero reference line (subtly brighter)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(padL, centerY);
      ctx.lineTo(w - padR, centerY);
      ctx.stroke();

      // X-axis ticks: 0, 2, 4, 6, 8, 10
      const xTicks = [0, 2, 4, 6, 8, 10];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      xTicks.forEach((t) => {
        const x = padL + (t / 10) * plotW;
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${t}`, x, padT + plotH + 3);
      });

      // Axis title
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText('Idő (másodperc)', padL + plotW / 2, padT + plotH + 12);

      // Stability history curve over 10 seconds
      const history = bbAudioEngine.getStabilityHistory();
      const now = Date.now();
      const tenSec = 10000;

      if (history.length > 1) {
        ctx.beginPath();
        let started = false;

        for (let i = 0; i < history.length; i++) {
          const pt = history[i];
          const age = now - pt.timestamp;
          if (age > tenSec) continue;

          // x goes from padL (10s ago) to padL + plotW (now)
          const normTime = 1 - age / tenSec;
          const x = padL + normTime * plotW;

          // y clamped to [-5, +5]
          const clampedCents = Math.max(-5.5, Math.min(5.5, pt.cents));
          const y = centerY - (clampedCents / 5) * (plotH / 2);

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = hasSignal ? '#00e5ff' : '#0284c7';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Current point pip
        if (hasSignal && history.length > 0) {
          const last = history[history.length - 1];
          const lastClamped = Math.max(-5.5, Math.min(5.5, last.cents));
          const lastY = centerY - (lastClamped / 5) * (plotH / 2);

          ctx.beginPath();
          ctx.arc(padL + plotW, lastY, 3, 0, Math.PI * 2);
          ctx.fillStyle = Math.abs(last.cents) <= 1.0 ? '#10b981' : '#00e5ff';
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [hasSignal, currentCents]);

  return (
    <div className="w-full bg-[#0b0f14] rounded-xl border border-white/5 overflow-hidden shadow-lg p-2.5 my-1">
      {/* Header */}
      <div className="flex items-center justify-between text-xs mb-1 px-1">
        <span className="font-semibold text-white/90">
          Frekvencia stabilitás <span className="text-slate-400 font-normal">({roleName})</span>
        </span>
        <span className="font-mono text-xs text-slate-300">
          Szórás: <span className="text-white font-medium">±{standardDeviationCents.toFixed(1)} cent</span>
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={380}
        height={90}
        className="w-full h-[90px] block"
      />
    </div>
  );
};
