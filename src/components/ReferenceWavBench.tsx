import React, { useRef, useState } from 'react';
import { analyzeWavRecording, downmixChannels, WavFrameAnalysis } from '../audio/wavAnalysis';

type ChannelMode = 'strongest' | 'average' | 'left' | 'right';

function selectAnalysisChannel(channels: Float32Array[], mode: ChannelMode): Float32Array {
  if (mode === 'average' || channels.length === 1) return downmixChannels(channels);
  if (mode === 'left') return channels[0];
  if (mode === 'right') return channels[1] ?? channels[0];
  const rms = channels.map((channel) => {
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    return sum / Math.max(1, channel.length);
  });
  const strongestIndex = rms.indexOf(Math.max(...rms));
  return channels[strongestIndex] ?? downmixChannels(channels);
}

const TARGETS = [
  { label: 'D3', hz: 146.832384 },
  { label: 'A3', hz: 220 },
  { label: 'E3', hz: 164.813778 },
  { label: 'G3', hz: 195.997718 },
] as const;

function fmt(value: number | null, digits = 3): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}
function fmtCents(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : (value > 0 ? '+' : '') + value.toFixed(2) + ' cent';
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export default function ReferenceWavBench() {
  const [targetIndex, setTargetIndex] = useState(0);
  const [channelMode, setChannelMode] = useState<ChannelMode>('strongest');
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [frames, setFrames] = useState<WavFrameAnalysis[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const audioDataRef = useRef<{ channels: Float32Array[]; sampleRate: number } | null>(null);

  const analyzeLoadedAudio = (targetHz: number, mode: ChannelMode) => {
    const audio = audioDataRef.current;
    if (!audio) return;
    const samples = selectAnalysisChannel(audio.channels, mode);
    setFrames(analyzeWavRecording(samples, audio.sampleRate, {
      fftSize: 16384, hopSize: 8192, targetHz, peakFloorDb: -82,
    }));
  };

  const target = TARGETS[targetIndex];
  const summary = [1, 2, 3].map((multiplier) => {
    const values = frames.map((frame) => frame.resonances[multiplier - 1].cents)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    return { multiplier, targetHz: target.hz * multiplier, count: values.length, medianCents: median(values) };
  });

  const loadFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setBusy(true);
    setFrames([]);
    audioDataRef.current = null;
    setFileName(file.name);
    try {
      if (!/\.wav$/i.test(file.name) && !file.type.includes('wav') && !file.type.includes('wave')) {
        throw new Error('WAV hangfájlt válassz. Más formátumhoz előbb alakítsd WAV-vá.');
      }
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(await file.arrayBuffer());
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
        audioDataRef.current = { channels, sampleRate: decoded.sampleRate };
        const mono = selectAnalysisChannel(channels, channelMode);
        const result = analyzeWavRecording(mono, decoded.sampleRate, {
          fftSize: 16384,
          hopSize: 8192,
          targetHz: target.hz,
          peakFloorDb: -82,
        });
        if (!result.length) throw new Error('Nem sikerült értékelhető hangablakot találni. Ellenőrizd a fájlt és a jelszintet.');
        setDuration(decoded.duration);
        setSampleRate(decoded.sampleRate);
        setFrames(result);
      } finally {
        await context.close();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A WAV fájl feldolgozása sikertelen.');
      audioDataRef.current = null;
      setDuration(null);
      setSampleRate(null);
      setFrames([]);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = 'timeSeconds,rmsDb,target1Hz,measured1Hz,cents1,peak1Db,target2Hz,measured2Hz,cents2,peak2Db,target3Hz,measured3Hz,cents3,peak3Db';
    const rows = frames.map((frame) => [
      frame.timeSeconds, frame.rmsDb,
      ...frame.resonances.flatMap((r) => [r.targetHz, r.measuredHz ?? '', r.cents ?? '', r.peakDb ?? '']),
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bb-tuner-wav-analysis.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return <main className="min-h-screen bg-[#070a0e] px-4 py-5 text-slate-100 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-400">BB Tuner · referencia labor</p>
          <h1 className="mt-1 text-2xl font-bold">Valós handpan WAV-elemzés</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Offline elemzés rögzített hangfájlból. Nincs szükség mikrofonra; a felvétel nem kerül feltöltésre szerverre.</p>
        </div>
        <div className="flex gap-2">
          <a href="/?benchmark=sine" className="rounded-xl border border-amber-500/40 px-3 py-2 text-sm text-amber-200">Szinuszreferencia</a>
          <a href="/?benchmark=1" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300">Élő handpan labor</a>
          <a href="/" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300">Vissza</a>
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="font-semibold">1. Referenciafelvétel betöltése</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Alaphang célértéke
            <select value={targetIndex} disabled={busy} onChange={(event) => { const nextIndex = Number(event.target.value); setTargetIndex(nextIndex); if (audioDataRef.current) analyzeLoadedAudio(TARGETS[nextIndex].hz, channelMode); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
              {TARGETS.map((item, index) => <option key={item.label} value={index}>{item.label} · {item.hz.toFixed(6)} Hz</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Csatornakezelés
            <select value={channelMode} disabled={busy} onChange={(event) => { const nextMode = event.target.value as ChannelMode; setChannelMode(nextMode); analyzeLoadedAudio(target.hz, nextMode); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
              <option value="strongest">Erősebb csatorna (alapértelmezett)</option>
              <option value="average">Bal + jobb átlaga</option>
              <option value="left">Bal csatorna</option>
              <option value="right">Jobb csatorna</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">WAV-fájl
            <input type="file" accept=".wav,audio/wav,audio/wave" disabled={busy} onChange={(event) => void loadFile(event.target.files?.[0])} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-amber-400 file:px-3 file:py-1 file:font-bold file:text-slate-950" />
          </label>
        </div>
        {busy && <p className="text-sm text-amber-200">A hangfájl dekódolása és elemzése folyamatban…</p>}
        {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
        {fileName && !busy && !error && <p className="text-sm text-slate-300">{fileName} · {duration?.toFixed(2)} s · {sampleRate ? (sampleRate / 1000).toFixed(1) + ' kHz' : '—'} · {frames.length} átfedő elemzési ablak</p>}
        <p className="text-xs leading-5 text-slate-500">Az elemzés 16 384 mintás Blackman-ablakokat és 8 192 mintás lépést használ. A hangfájl korai tranziensét és lecsengését külön ablakokban mutatja. A céltartomány ±150 cent.</p>
      </section>

      {frames.length > 0 && <>
        <section className="space-y-3">
          <h2 className="font-semibold">2. Összefoglaló a felvételről</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {summary.map((item) => <article key={item.multiplier} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-sm text-slate-400">{item.multiplier === 1 ? 'Alaphang · 1×' : item.multiplier === 2 ? 'Oktáv · 2×' : 'Harmadik részfelhang · 3×'}</p>
              <p className="mt-2 font-mono text-lg">{item.targetHz.toFixed(6)} Hz</p>
              <p className="mt-1 text-amber-300">Mediáneltérés: {fmtCents(item.medianCents)}</p>
              <p className="mt-1 text-xs text-slate-500">{item.count} érvényes ablak / {frames.length}</p>
            </article>)}
          </div>
          <p className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3 text-sm leading-6 text-amber-100">Ez a medián a felvétel spektrumcsúcsainak diagnosztikai összegzése, nem hitelesített hangolási eredmény. A harmadik részfelhang célértéke 3× alaphang; nem azonos automatikusan az egyenletes temperálású A4 = 440 Hz céllal.</p>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">3. Időbeli lecsengés és mérési stabilitás</h2>
            <button onClick={exportCsv} className="rounded-xl border border-slate-600 px-4 py-2 text-sm">CSV export</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-900 text-slate-400"><tr>
                <th className="p-3">Idő (s)</th><th className="p-3">Jelszint (dB)</th>
                <th className="p-3">1× Hz</th><th className="p-3">1× cent</th>
                <th className="p-3">2× Hz</th><th className="p-3">2× cent</th>
                <th className="p-3">3× Hz</th><th className="p-3">3× cent</th>
              </tr></thead>
              <tbody>{frames.map((frame, index) => <tr key={frame.timeSeconds} className="border-t border-slate-800">
                <td className="p-3 font-mono">{frame.timeSeconds.toFixed(3)}</td><td className="p-3 font-mono">{frame.rmsDb.toFixed(1)}</td>
                {frame.resonances.map((resonance, i) => <React.Fragment key={i}>
                  <td className="p-3 font-mono">{fmt(resonance.measuredHz)}</td><td className="p-3 font-mono">{fmtCents(resonance.cents)}</td>
                </React.Fragment>)}
              </tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-slate-500">A táblázat minden sora egy külön, átfedő hangablak. A korai ütésből származó értékek eltérhetnek a lecsengés stabilabb szakaszától. A hiányzó csúcs „—” marad; a program nem gyárt hozzá becsült hangolási értéket.</p>
        </section>
      </>}
    </div>
  </main>;
}
