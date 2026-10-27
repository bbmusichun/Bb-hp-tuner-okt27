import React, { useEffect, useRef } from 'react';
import { ResonanceMeasurement } from '../types/tuner';

interface Props {
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  hasSignal: boolean;
  selectedRole: 'fundamental' | 'fifth' | 'octave';
  onSelectRole: (role: 'fundamental' | 'fifth' | 'octave') => void;
}

export const BBCards: React.FC<Props> = ({
  alap,
  kvint,
  oktav,
  hasSignal,
  selectedRole,
  onSelectRole,
}) => {
  const cards = [
    {
      role: 'fundamental' as const,
      title: 'Alaphang',
      note: alap.noteName || 'D3',
      dotColor: '#f59e0b',
      borderSelected: 'border-[#f59e0b]/70 shadow-[#f59e0b]/10',
      data: alap,
      lineColor: '#f59e0b',
    },
    {
      role: 'fifth' as const,
      title: '3. parciális',
      note: kvint.noteName || 'A3',
      dotColor: '#c084fc',
      borderSelected: 'border-[#c084fc]/70 shadow-[#c084fc]/10',
      data: kvint,
      lineColor: '#c084fc',
    },
    {
      role: 'octave' as const,
      title: 'Oktáv',
      note: oktav.noteName || 'D4',
      dotColor: '#38bdf8',
      borderSelected: 'border-[#38bdf8]/70 shadow-[#38bdf8]/10',
      data: oktav,
      lineColor: '#38bdf8',
    },
  ];

  return (
    <div className="w-full grid grid-cols-3 gap-2 my-1">
      {cards.map((c) => {
        const isSelected = selectedRole === c.role;
        const measuredStr = c.data.measuredHz !== null && c.data.status === 'valid' ? `${c.data.measuredHz.toFixed(2)} Hz` : '— Hz';
        const targetStr = `Cél: ${c.data.targetHz ? c.data.targetHz.toFixed(2) : '--'} Hz`;
        const cents = c.data.deviationCents;
        const centsStr = cents !== null && c.data.status === 'valid' ? `${cents > 0 ? '+' : ''}${cents.toFixed(1)} cent` : '— cent';
        const inTune = c.data.status === 'valid' && cents !== null && Math.abs(cents) <= 3.0;

        return (
          <button
            key={c.role}
            onClick={() => onSelectRole(c.role)}
            className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all bg-[#0b0f14] ${
              isSelected ? `${c.borderSelected} ring-1 ring-white/10 shadow-lg` : 'border-white/5 hover:border-white/10'
            }`}
          >
            {/* Top Dot & Titles */}
            <div className="flex items-start gap-1.5 mb-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 shadow-sm"
                style={{ backgroundColor: c.dotColor }}
              />
              <div className="leading-tight truncate">
                <div className="text-[11px] font-semibold text-white/90 truncate">{c.title}</div>
                <div className="text-[10px] font-mono text-slate-400">{c.note}</div>
              </div>
            </div>

            {/* Measured Hz */}
            <div className="text-xs sm:text-sm font-mono font-bold text-white tracking-tight my-0.5">
              {measuredStr}
            </div>

            {/* Target Hz */}
            <div className="text-[9px] font-mono text-slate-500 mb-1">
              {targetStr}
            </div>

            {/* Deviation Cents */}
            <div
              className={`text-xs font-mono font-bold ${
                inTune ? 'text-[#10b981]' : Math.abs(cents || 0) > 10 ? 'text-[#f43f5e]' : 'text-[#f59e0b]'
              }`}
            >
              {!hasSignal || c.data.status === 'no-signal' ? 'Nincs jel' : centsStr}
            </div>

            {/* Mini Sparkline Canvas */}
            <div className="w-full h-5 mt-1 overflow-hidden">
              <SparklineCanvas
                lineColor={c.lineColor}
                hasSignal={hasSignal}
                cents={cents || 0}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};

const SparklineCanvas: React.FC<{ lineColor: string; hasSignal: boolean; cents: number }> = ({
  lineColor,
  hasSignal,
  cents,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);

  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Push new point
    if (historyRef.current.length === 0) {
      historyRef.current = new Array(30).fill(0);
    }

    function draw() {
      if (!ctx || !canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const centerY = h / 2;

      ctx.clearRect(0, 0, w, h);

      // Add a slight procedural wave based on cents error
      const sample = hasSignal && Number.isFinite(cents) ? Math.max(-10, Math.min(10, cents)) : 0;
      historyRef.current.push(sample);
      if (historyRef.current.length > 30) historyRef.current.shift();

      // Zero line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();

      // Sparkline
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();

      const step = w / (historyRef.current.length - 1);
      historyRef.current.forEach((val, idx) => {
        const x = idx * step;
        const y = centerY - (val / 10) * (h * 0.42);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [hasSignal, cents, lineColor]);

  return <canvas ref={canvasRef} width={80} height={20} className="w-full h-full block" />;
};
