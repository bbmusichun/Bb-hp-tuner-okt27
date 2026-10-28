import React, { useEffect, useRef, useState } from 'react';
import { estimatePitchYin } from '../audio/yinPitch';
import { estimatePitchSnac } from '../audio/snacPitch';

type Reading = { hz: number | null; cents: number | null; db: number | null };
type Snapshot = { time: string; targetHz: number; fft: Reading; yinHz: number | null; yinCents: number | null; yinClarity: number; snacHz: number | null; snacCents: number | null; snacClarity: number };
const PARTS = [{ id: 'fundamental', label: '1× Alaphang', multiplier: 1 }, { id: 'octave', label: '2× Oktáv', multiplier: 2 }, { id: 'third', label: '3× komponens', multiplier: 3 }] as const;

function cents(hz: number | null, target: number) {
  return hz && Number.isFinite(hz) && target > 0 ? 1200 * Math.log2(hz / target) : null;
}
function fmt(value: number | null, digits = 2) { return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits); }
function peakInBand(data: Float32Array, sampleRate: number, fftSize: number, target: number): Reading {
  const binHz = sampleRate / fftSize;
  const minBin = Math.max(1, Math.floor(target * Math.pow(2, -45 / 1200) / binHz));
  const maxBin = Math.min(data.length - 2, Math.ceil(target * Math.pow(2, 45 / 1200) / binHz));
  let best = -1;
  for (let i = minBin; i <= maxBin; i++) if (best < 0 || data[i] > data[best]) best = i;
  if (best < 1 || !Number.isFinite(data[best]) || data[best] < -95) return { hz: null, cents: null, db: best >= 0 ? data[best] : null };
  const left = data[best - 1], center = data[best], right = data[best + 1];
  const denom = left - 2 * center + right;
  const offset = Math.abs(denom) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denom)) : 0;
  const hz = (best + offset) * binHz;
  return { hz, cents: cents(hz, target), db: center };
}

export default function PitchBenchmark() {
  const [targetHz, setTargetHz] = useState(146.832);
  const [noteLabel, setNoteLabel] = useState('D3');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(-100);
  const [fftSize, setFftSize] = useState(16384);
  const [holdMs, setHoldMs] = useState(8000);
  const [current, setCurrent] = useState<{ parts: Reading[]; yinHz: number | null; yinCents: number | null; yinClarity: number; snacHz: number | null; snacCents: number | null; snacClarity: number; time: number } | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [lastSoundAt, setLastSoundAt] = useState(0);
  const [held, setHeld] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lastPeakRef = useRef<{ parts: Reading[]; yinHz: number | null; yinCents: number | null; yinClarity: number; snacHz: number | null; snacCents: number | null; snacClarity: number; time: number } | null>(null);
  const targetRef = useRef(targetHz);
  const lastAlgorithmRunRef = useRef(0);
  targetRef.current = targetHz;

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); void ctxRef.current?.close(); }, []);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    setListening(false);
    setLevel(-100);
  };

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0.05;
      analyser.minDecibels = -100;
      analyser.maxDecibels = 0; // Preserve strong spectral peak shape for sub-bin interpolation.
      ctx.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream; ctxRef.current = ctx; analyserRef.current = analyser;
      setListening(true);
      const freq = new Float32Array(analyser.frequencyBinCount);
      const time = new Float32Array(analyser.fftSize);
      const loop = () => {
        const a = analyserRef.current;
        const c = ctxRef.current;
        if (!a || !c) return;
        a.getFloatFrequencyData(freq);
        a.getFloatTimeDomainData(time);
        let rms = 0;
        for (let i = 0; i < time.length; i++) rms += time[i] * time[i];
        const db = 20 * Math.log10(Math.sqrt(rms / time.length) + 1e-12);
        setLevel(db);
        const now = performance.now();
        const target = targetRef.current;
        if (db > -58) {
          const parts = PARTS.map(p => peakInBand(freq, c.sampleRate, a.fftSize, target * p.multiplier));
          const yin = estimatePitchYin(time, c.sampleRate, { minHz: Math.max(45, target * 0.65), maxHz: Math.min(1000, target * 1.8), downsampleFactor: 2 });
          const snac = estimatePitchSnac(time, c.sampleRate, { minHz: Math.max(45, target * 0.65), maxHz: Math.min(1000, target * 1.8) });
          const next = { parts, yinHz: yin.frequencyHz, yinCents: cents(yin.frequencyHz, target), yinClarity: yin.clarity, snacHz: snac.frequencyHz, snacCents: cents(snac.frequencyHz, target), snacClarity: snac.clarity, time: now };
          lastPeakRef.current = next;
          setCurrent(next);
          setLastSoundAt(now);
          setHeld(false);
        } else if (lastPeakRef.current && now - lastPeakRef.current.time < holdMs) {
          setCurrent(lastPeakRef.current);
          setHeld(true);
        } else {
          setCurrent(null);
          setHeld(false);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nem sikerült elindítani a mikrofont. Ellenőrizd az engedélyt és a HTTPS-kapcsolatot.');
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const capture = () => {
    if (!current) return;
    const row: Snapshot = {
      time: new Date().toISOString(), targetHz,
      fft: current.parts[0],
      yinHz: current.yinHz, yinCents: current.yinCents, yinClarity: current.yinClarity,
      snacHz: current.snacHz, snacCents: current.snacCents, snacClarity: current.snacClarity,
    };
    setSnapshots(prev => [...prev, row]);
  };
  const exportCsv = () => {
    const header = 'time,targetHz,fftHz,fftCents,fftDb,yinHz,yinCents,yinClarity,snacHz,snacCents,snacClarity';
    const rows = snapshots.map(s => [s.time,s.targetHz,s.fft.hz,s.fft.cents,s.fft.db,s.yinHz,s.yinCents,s.yinClarity,s.snacHz,s.snacCents,s.snacClarity].map(v => v ?? '').join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bb-tuner-algorithm-test.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return <main className="min-h-screen bg-[#070a0e] text-slate-100 px-4 py-5 sm:px-6">
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-400">BB Tuner · Lab</p><h1 className="mt-1 text-2xl font-bold">Algoritmus-összehasonlító mérés</h1><p className="mt-2 text-sm text-slate-400">Valós handpan · FFT-csúcs / YIN / SNAC</p></div>
        <div className="flex flex-wrap gap-2"><a href="/?benchmark=sine" className="rounded-xl border border-amber-500/40 px-3 py-2 text-sm text-amber-200">Szinuszreferencia teszt</a><a href="/?benchmark=wav" className="rounded-xl border border-cyan-500/40 px-3 py-2 text-sm text-cyan-200">WAV-elemzés</a><a href="/" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300">Vissza</a></div>
      </header>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <h2 className="font-semibold">1. Mérési beállítások</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Hang / célfrekvencia
            <select value={noteLabel} onChange={e => { const v=e.target.value; setNoteLabel(v); const map:Record<string,number>={D3:146.832,A3:220,E3:164.814,G3:196}; setTargetHz(map[v] ?? 146.832); lastPeakRef.current=null; }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
              <option>D3</option><option>A3</option><option>E3</option><option>G3</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">FFT-ablak
            <select value={fftSize} onChange={e=>setFftSize(Number(e.target.value))} disabled={listening} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
              <option value={8192}>8192 minta (gyorsabb)</option><option value={16384}>16384 minta</option><option value={32768}>32768 minta (finomabb frekvenciafelbontás)</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">Utolsó mérés megtartása
            <select value={holdMs} onChange={e=>setHoldMs(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"><option value={3000}>3 másodperc</option><option value={8000}>8 másodperc</option><option value={12000}>12 másodperc</option></select>
          </label>
          <div className="rounded-lg bg-slate-950 p-3 text-sm"><div className="text-slate-400">Mikrofon jelszint</div><div className="mt-1 font-mono text-lg">{fmt(level,1)} dB</div><div className="text-xs text-slate-500">Ablak: {fftSize} minta · Élő mintavétel</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!listening ? <button onClick={start} className="rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-slate-950">Mikrofon indítása</button> : <button onClick={stop} className="rounded-xl border border-rose-500/60 px-4 py-2.5 font-semibold text-rose-300">Mérés leállítása</button>}
          <button onClick={capture} disabled={!current} className="rounded-xl border border-slate-600 px-4 py-2.5 disabled:opacity-40">Mérés rögzítése</button>
          <button onClick={exportCsv} disabled={!snapshots.length} className="rounded-xl border border-slate-600 px-4 py-2.5 disabled:opacity-40">CSV export</button>
        </div>
        {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
        <p className="text-xs leading-5 text-slate-500">Mérési tipp: csendes szobában, ugyanazon mikrofonpozícióval üsd meg háromszor a hangot. Az első 50–100 ms tranziensét külön tesztként kezeld; a hang lecsengésekor a megtartott adat nem új mérés.</p>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold">2. Élő eredmények</h2><span className={held?'text-amber-300':'text-emerald-300'}>{!current?'Várakozás hangra':held?'Megtartott mérés':'Élő mérés'}</span></div>
        <div className="grid gap-3 sm:grid-cols-3">
          {PARTS.map((p,i)=>{const m=current?.parts[i]; return <article key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><div className="text-sm text-slate-400">{p.label}</div><div className="mt-2 text-xl font-bold">{fmt(m?.hz ?? null)} Hz</div><div className="mt-1 text-sm text-amber-300">{fmt(m?.cents ?? null)} cent</div><div className="mt-2 text-xs text-slate-500">Cél: {fmt(targetHz*p.multiplier)} Hz · {fmt(m?.db ?? null,1)} dB</div></article>})}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><h3 className="font-semibold">YIN · teljes hullámforma</h3><div className="mt-2 text-xl">{fmt(current?.yinHz ?? null)} Hz</div><div className="text-amber-300">{fmt(current?.yinCents ?? null)} cent az alaphanghoz</div><div className="mt-1 text-xs text-slate-500">Clarity: {fmt(current?.yinClarity ?? null,3)}</div></article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><h3 className="font-semibold">SNAC · kísérleti</h3><div className="mt-2 text-xl">{fmt(current?.snacHz ?? null)} Hz</div><div className="text-amber-300">{fmt(current?.snacCents ?? null)} cent az alaphanghoz</div><div className="mt-1 text-xs text-slate-500">Clarity: {fmt(current?.snacClarity ?? null,3)}</div></article>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">3. Rögzített mérések ({snapshots.length})</h2><button onClick={()=>setSnapshots([])} disabled={!snapshots.length} className="text-sm text-slate-400 disabled:opacity-40">Lista törlése</button></div>
        {!snapshots.length ? <p className="mt-3 text-sm text-slate-500">Még nincs rögzített mérés. Indítsd el a mikrofont, üsd meg a hangot, majd rögzítsd az eredményt.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">#</th><th className="p-2">FFT Hz</th><th className="p-2">FFT cent</th><th className="p-2">YIN Hz</th><th className="p-2">YIN cent</th><th className="p-2">SNAC Hz</th><th className="p-2">SNAC cent</th></tr></thead><tbody>{snapshots.map((s,i)=><tr key={s.time+i} className="border-t border-slate-800"><td className="p-2">{i+1}</td><td className="p-2">{fmt(s.fft.hz)}</td><td className="p-2">{fmt(s.fft.cents)}</td><td className="p-2">{fmt(s.yinHz)}</td><td className="p-2">{fmt(s.yinCents)}</td><td className="p-2">{fmt(s.snacHz)}</td><td className="p-2">{fmt(s.snacCents)}</td></tr>)}</tbody></table></div>}
      </section>
      <p className="text-xs leading-5 text-slate-500">Fontos: ez labor-előnézet. Az FFT-sávos mérés, a YIN és a kísérleti SNAC eredményei diagnosztikai adatok; a SNAC egyelőre nincs bekötve a fő hangoló működésébe. A pontosságot valódi hangfelvételekkel és ismert referenciafrekvenciával kell validálni.</p>
    </div>
  </main>;
}
