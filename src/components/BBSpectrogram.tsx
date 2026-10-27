import React, { useEffect, useRef } from 'react';
import { bbAudioEngine } from '../audio/audioEngine';

/** Scrolling spectrogram: time moves left-to-right; frequency is vertical. */
export const BBSpectrogram: React.FC<{ active: boolean }> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastPaint = 0;
    const render = (now: number) => {
      if (now - lastPaint > 70) {
        lastPaint = now;
        const w = canvas.width, h = canvas.height;
        const image = ctx.getImageData(1, 0, w - 1, h);
        ctx.putImageData(image, 0, 0);
        const spectrum = bbAudioEngine.getFloatFrequencyData();
        const sampleRate = bbAudioEngine.getSampleRate();
        const binWidth = sampleRate / (spectrum.length * 2);
        for (let y = 0; y < h; y++) {
          const hz = (1 - y / h) * 1200;
          const bin = Math.min(spectrum.length - 1, Math.max(0, Math.round(hz / binWidth)));
          const db = active ? spectrum[bin] : -100;
          const v = Math.max(0, Math.min(1, (db + 90) / 65));
          // Dark blue -> cyan -> amber intensity map, calculated without external dependencies.
          const red = Math.round(245 * Math.max(0, (v - 0.62) / 0.38));
          const green = Math.round(220 * Math.min(1, v * 1.7));
          const blue = Math.round(255 * Math.min(1, 0.25 + v * 1.3));
          ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          ctx.fillRect(w - 1, y, 1, 1);
        }
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return (
    <section className="w-full rounded-xl border border-white/5 bg-[#0b0f14] p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-white">Spektrogram</h3>
        <span className="text-[10px] text-slate-400">0–1200 Hz · idő balról jobbra</span>
      </div>
      <canvas ref={canvasRef} width={360} height={150} className="w-full h-[150px] block rounded-md" />
      <p className="mt-2 text-[10px] text-slate-500">A világosabb sávok erősebb frekvenciaösszetevőket jelölnek. A mikrofonmérés elindításakor élőben frissül.</p>
    </section>
  );
};
