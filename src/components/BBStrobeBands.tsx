import React, { useEffect, useRef } from 'react';
import { ResonanceMeasurement } from '../types/tuner';
import { tuningToleranceCents } from '../audio/tuningTolerance';

interface Props {
  alap: ResonanceMeasurement;
  kvint: ResonanceMeasurement;
  oktav: ResonanceMeasurement;
  hasSignal: boolean;
  selectedRole?: string;
  onSelectRole?: (role: 'fundamental' | 'fifth' | 'octave') => void;
}

export const BBStrobeBands: React.FC<Props> = ({
  alap,
  kvint,
  oktav,
  hasSignal,
  selectedRole,
  onSelectRole,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestMeasurementsRef = useRef({ alap, kvint, oktav, hasSignal });
  latestMeasurementsRef.current = { alap, kvint, oktav, hasSignal };

  // Time-integrated phases for each band
  const phasesRef = useRef({ alap: 0, kvint: 0, oktav: 0 });
  const lastTimeRef = useRef<number>(performance.now());
  const lastMeasurementTimeRef = useRef({ alap: 0, kvint: 0, oktav: 0 });

  // Smoothed deviation cents
  const smoothCentsRef = useRef({ alap: 0, kvint: 0, oktav: 0 });
  // A green state requires a continuously valid, frequency-dependent in-tolerance measurement for 1 s.
  const greenSinceRef = useRef<{ alap: number | null; kvint: number | null; oktav: number | null }>({ alap: null, kvint: null, oktav: null });

  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render(currentTime: number) {
      if (!ctx || !canvas) return;
      const measurement = latestMeasurementsRef.current;

      const dt = Math.min(0.1, (currentTime - lastTimeRef.current) / 1000); // in seconds
      lastTimeRef.current = currentTime;

      const w = canvas.width;
      const h = canvas.height;
      const rowHeight = (h - 8) / 3; // 3 rows with 4px gap

      // Smooth cents toward measured values
      const targetCentsAlap = measurement.hasSignal && measurement.alap.status === 'valid' && measurement.alap.deviationCents !== null ? measurement.alap.deviationCents : 0;
      const targetCentsKvint = measurement.hasSignal && measurement.kvint.status === 'valid' && measurement.kvint.deviationCents !== null ? measurement.kvint.deviationCents : 0;
      const targetCentsOktav = measurement.hasSignal && measurement.oktav.status === 'valid' && measurement.oktav.deviationCents !== null ? measurement.oktav.deviationCents : 0;

      smoothCentsRef.current.alap += (targetCentsAlap - smoothCentsRef.current.alap) * 0.15;
      smoothCentsRef.current.kvint += (targetCentsKvint - smoothCentsRef.current.kvint) * 0.15;
      smoothCentsRef.current.oktav += (targetCentsOktav - smoothCentsRef.current.oktav) * 0.15;

      // Strobe drift follows physical frequency error (beat Hz) with one shared pixels-per-Hz
      // scale. Higher partials naturally drift faster for the same cents error because Δf is larger.
      const validAlap = measurement.hasSignal && measurement.alap.status === 'valid' && measurement.alap.deviationCents !== null && Number.isFinite(measurement.alap.deviationCents);
      const validKvint = measurement.hasSignal && measurement.kvint.status === 'valid' && measurement.kvint.deviationCents !== null && Number.isFinite(measurement.kvint.deviationCents);
      const validOktav = measurement.hasSignal && measurement.oktav.status === 'valid' && measurement.oktav.deviationCents !== null && Number.isFinite(measurement.oktav.deviationCents);
      if (validAlap) lastMeasurementTimeRef.current.alap = currentTime;
      if (validKvint) lastMeasurementTimeRef.current.kvint = currentTime;
      if (validOktav) lastMeasurementTimeRef.current.oktav = currentTime;
      const integrate = (valid: boolean, lastTime: number, cents: number, targetHz: number, key: 'alap' | 'kvint' | 'oktav') => {
        if (!valid && currentTime - lastTime > 250) return;
        const deltaHz = targetHz * (Math.pow(2, cents / 1200) - 1);
        const speed = Math.max(-220, Math.min(220, deltaHz * 65));
        phasesRef.current[key] += speed * dt;
      };
      integrate(validAlap, lastMeasurementTimeRef.current.alap, smoothCentsRef.current.alap, measurement.alap.targetHz ?? 146.83, 'alap');
      integrate(validKvint, lastMeasurementTimeRef.current.kvint, smoothCentsRef.current.kvint, measurement.kvint.targetHz ?? 440.50, 'kvint');
      integrate(validOktav, lastMeasurementTimeRef.current.oktav, smoothCentsRef.current.oktav, measurement.oktav.targetHz ?? 293.66, 'oktav');

      ctx.clearRect(0, 0, w, h);

      // Colors matching screenshot: Lighter brick/ruby red vs near-black dark red
      const redColor = '#a8323c';
      const redLightColor = '#c44852';
      const darkColor = '#120507';
      const darkMidColor = '#1e080b';

      const rows = [
        {
          key: 'alap',
          role: 'fundamental' as const,
          name: 'Alap',
          note: measurement.alap.noteName || 'D3',
          noteColor: '#f59e0b',
          phase: phasesRef.current.alap,
          stripeWidth: 20, // Fine stripes for Alaphang
          cents: smoothCentsRef.current.alap,
          targetHz: measurement.alap.targetHz ?? measurement.alap.measuredHz ?? 146.83,
          isValid: measurement.hasSignal && measurement.alap.status === 'valid',
        },
        {
          key: 'kvint',
          role: 'fifth' as const,
          name: '3× parciális',
          note: measurement.kvint.noteName || 'A4',
          noteColor: '#c084fc',
          phase: phasesRef.current.kvint,
          stripeWidth: 34, // Medium stripes for Kvint
          cents: smoothCentsRef.current.kvint,
          targetHz: measurement.kvint.targetHz ?? measurement.kvint.measuredHz ?? 440.50,
          isValid: measurement.hasSignal && measurement.kvint.status === 'valid',
        },
        {
          key: 'oktav',
          role: 'octave' as const,
          name: 'Oktáv',
          note: measurement.oktav.noteName || 'D4',
          noteColor: '#38bdf8',
          phase: phasesRef.current.oktav,
          stripeWidth: 54, // Wide block stripes for Oktáv
          cents: smoothCentsRef.current.oktav,
          targetHz: measurement.oktav.targetHz ?? measurement.oktav.measuredHz ?? 293.66,
          isValid: measurement.hasSignal && measurement.oktav.status === 'valid',
        },
      ];

      rows.forEach((row, idx) => {
        const now = currentTime;
        const key = row.key as 'alap' | 'kvint' | 'oktav';
        // Smooth frequency-dependent product threshold; not presented as a proven JND model.
        const toleranceCents = tuningToleranceCents(row.targetHz);
        const inTolerance = row.isValid && Number.isFinite(row.cents) && Math.abs(row.cents) <= toleranceCents;
        if (inTolerance) {
          if (greenSinceRef.current[key] === null) greenSinceRef.current[key] = now;
        } else {
          greenSinceRef.current[key] = null;
        }
        const isConfirmedGreen = inTolerance && greenSinceRef.current[key] !== null && now - greenSinceRef.current[key]! >= 1000;
        const isNearButUnconfirmed = row.isValid && Math.abs(row.cents) <= toleranceCents && !isConfirmedGreen;
        const y = idx * (rowHeight + 4);
        const stripeW = row.stripeWidth;
        const period = stripeW * 2;
        const offset = ((row.phase % period) + period) % period;

        // Clip rounded rectangle for track
        ctx.save();
        ctx.beginPath();
        const radius = 6;
        ctx.moveTo(radius, y);
        ctx.lineTo(w - radius, y);
        ctx.quadraticCurveTo(w, y, w, y + radius);
        ctx.lineTo(w, y + rowHeight - radius);
        ctx.quadraticCurveTo(w, y + rowHeight, w - radius, y + rowHeight);
        ctx.lineTo(radius, y + rowHeight);
        ctx.quadraticCurveTo(0, y + rowHeight, 0, y + rowHeight - radius);
        ctx.lineTo(0, y + radius);
        ctx.quadraticCurveTo(0, y, radius, y);
        ctx.closePath();
        ctx.clip();

        // 1. Dark base background
        ctx.fillStyle = darkColor;
        ctx.fillRect(0, y, w, rowHeight);

        // 2. Alternating red stripes
          const stripeBase = isConfirmedGreen ? '#147a48' : isNearButUnconfirmed ? '#a36b16' : redColor;
        const stripeLight = isConfirmedGreen ? '#31d889' : isNearButUnconfirmed ? '#e4ad43' : redLightColor;
        ctx.fillStyle = stripeBase;

        for (let x = -period + offset; x < w + period; x += period) {
          // Soft gradient across stripe
          const grad = ctx.createLinearGradient(x, y, x + stripeW, y);
          grad.addColorStop(0, darkMidColor);
          grad.addColorStop(0.2, stripeLight);
          grad.addColorStop(0.8, stripeBase);
          grad.addColorStop(1, darkMidColor);
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, stripeW, rowHeight);
        }

        // 3. Subtle inner shadow / border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, y, w, rowHeight);

        // 4. Glowing Center Reference Line (White vertical hairline with amber/coral glow)
        const centerX = w / 2;
        // Outer glow
        const glowGrad = ctx.createRadialGradient(centerX, y + rowHeight / 2, 0, centerX, y + rowHeight / 2, 16);
        glowGrad.addColorStop(0, 'rgba(255, 230, 200, 0.45)');
        glowGrad.addColorStop(1, 'rgba(255, 100, 100, 0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(centerX - 16, y, 32, rowHeight);

        // White hairline
        ctx.fillStyle = isConfirmedGreen ? '#eafff2' : '#ffeedd';
        ctx.fillRect(centerX - 1, y, 2, rowHeight);

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const rows = [
    { role: 'fundamental' as const, name: 'Alap', note: alap.noteName || 'D3', color: '#f59e0b' },
    { role: 'fifth' as const, name: '3× parciális', note: kvint.noteName || 'A3', color: '#c084fc' },
    { role: 'octave' as const, name: 'Oktáv', note: oktav.noteName || 'D4', color: '#38bdf8' },
  ];

  return (
    <div className="w-full flex items-stretch gap-2.5 my-1">
      {/* Left Labels Column */}
      <div className="flex flex-col justify-between py-1 shrink-0 w-12 text-left select-none">
        {rows.map((r) => (
          <button
            key={r.role}
            onClick={() => onSelectRole?.(r.role)}
            className="flex flex-col items-start leading-tight hover:opacity-80 transition cursor-pointer"
          >
            <span className="text-xs font-semibold text-white/90">{r.name}</span>
            <span className="text-[11px] font-mono font-medium" style={{ color: r.color }}>
              {r.note}
            </span>
          </button>
        ))}
      </div>

      {/* Main Canvas containing the 3 Stroboscope bands */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          width={320}
          height={116}
          className="w-full h-[116px] block rounded-lg overflow-hidden border border-white/5 shadow-inner"
        />
      </div>
    </div>
  );
};
