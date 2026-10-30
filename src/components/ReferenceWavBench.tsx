import React, { useRef, useState } from 'react';
import { analyzeWavRecording, downmixChannels, WavFrameAnalysis } from '../audio/wavAnalysis';
import { REFERENCE_SIGNAL_ANALYSIS_PROFILES, runReferenceSignalBenchmark, runReferenceSignalProfileBenchmark, summarizeReferenceSignalBenchmark, type ReferenceSignalBenchmarkResult, type ReferenceSignalProfileBenchmarkResult } from '../audio/referenceSignalBenchmark';
import {
  MeasurementQualityReason,
  MeasurementQualityStatus,
  summarizeWavPartial,
} from '../audio/measurementQuality';
import {
  IdentifiabilityReason,
  IdentifiabilityStatus,
  summarizeFundamentalIdentifiability,
} from '../audio/fundamentalIdentifiability';

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
const QUALITY_LABEL: Record<MeasurementQualityStatus, string> = {
  reliable: 'megbízható',
  marginal: 'korlátozottan megbízható',
  insufficient: 'nem értékelhető',
};

const QUALITY_CLASS: Record<MeasurementQualityStatus, string> = {
  reliable: 'text-emerald-300',
  marginal: 'text-amber-300',
  insufficient: 'text-rose-300',
};

const QUALITY_REASON_LABEL: Record<MeasurementQualityReason, string> = {
  'no-measurement': 'nincs érvényes csúcs',
  'too-few-windows': 'kevés elemzett ablak',
  'low-coverage': 'kevés érvényes ablak',
  unstable: 'instabil frekvencia',
  'weak-peak': 'gyenge csúcs',
  'low-prominence': 'alacsony helyi kiemelkedés',
};

const IDENTIFIABILITY_LABEL: Record<IdentifiabilityStatus, string> = {
  identified: 'alaphang azonosítva',
  ambiguous: 'bizonytalan alaphang',
  unidentified: 'alaphang nem azonosítható',
};

const IDENTIFIABILITY_CLASS: Record<IdentifiabilityStatus, string> = {
  identified: 'text-emerald-300',
  ambiguous: 'text-amber-300',
  unidentified: 'text-rose-300',
};

const IDENTIFIABILITY_REASON_LABEL: Record<IdentifiabilityReason, string> = {
  'no-fundamental': 'nincs alaphang-csúcs',
  'strong-subharmonic': 'a céllal összemérhető mélyebb gyökér (oktávhiba)',
  'missing-octave': 'hiányzó oktáv részfelhang',
  'missing-twelfth': 'hiányzó tizenketted részfelhang',
  'inconsistent-octave': 'az oktáv nem a mért alaphang 2×-án van',
};

export default function ReferenceWavBench() {
  const [targetIndex, setTargetIndex] = useState(0);
  const [channelMode, setChannelMode] = useState<ChannelMode>('strongest');
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [frames, setFrames] = useState<WavFrameAnalysis[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [profileBenchmarkBusy, setProfileBenchmarkBusy] = useState(false);
  const [benchmarkResults, setBenchmarkResults] = useState<ReferenceSignalBenchmarkResult[]>([]);
  const [profileBenchmarkResults, setProfileBenchmarkResults] = useState<ReferenceSignalProfileBenchmarkResult[]>([]);
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
    const partial = summarizeWavPartial(frames, multiplier);
    return { ...partial, targetHz: partial.targetHz || target.hz * multiplier };
  });
  const identifiability = summarizeFundamentalIdentifiability(frames);
  const benchmarkSummary = benchmarkResults.length > 0 ? summarizeReferenceSignalBenchmark(benchmarkResults) : null;
  const runMultiProfileBenchmark = async () => {
    if (profileBenchmarkBusy) return;
    setProfileBenchmarkBusy(true);
    setProfileBenchmarkResults([]);
    try {
      const nextResults: ReferenceSignalProfileBenchmarkResult[] = [];
      for (const profile of REFERENCE_SIGNAL_ANALYSIS_PROFILES) {
        const [result] = runReferenceSignalProfileBenchmark(undefined, [profile]);
        if (result) {
          nextResults.push(result);
          setProfileBenchmarkResults([...nextResults]);
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A többprofilos benchmark sikertelen.');
    } finally {
      setProfileBenchmarkBusy(false);
    }
  };

  const runSyntheticBenchmark = () => {
    if (benchmarkBusy) return;
    setBenchmarkBusy(true);
    window.setTimeout(() => {
      try {
        setBenchmarkResults(runReferenceSignalBenchmark());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'A szintetikus referenciajel-benchmark sikertelen.');
      } finally {
        setBenchmarkBusy(false);
      }
    }, 0);
  };

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
    const header = 'channelMode,timeSeconds,rmsDb,identifiability,target1Hz,measured1Hz,cents1,quality1,peak1Db,prominence1Db,target2Hz,measured2Hz,cents2,quality2,peak2Db,prominence2Db,target3Hz,measured3Hz,cents3,quality3,peak3Db,prominence3Db';
    const rows = frames.map((frame) => [
      channelMode, frame.timeSeconds, frame.rmsDb, frame.identifiability?.status ?? '',
      ...frame.resonances.flatMap((r, index) => [
        r.targetHz, r.measuredHz ?? '', r.cents ?? '',
        summary[index].quality.status,
        r.peakDb ?? '', r.prominenceDb ?? '',
      ]),
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hangoal-wav-analysis.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return <main className="min-h-screen bg-[#070a0e] px-4 py-5 text-slate-100 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-400">Hangoal · referencia labor</p>
          <h1 className="mt-1 text-2xl font-bold">Valós handpan WAV-elemzés</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Offline elemzés rögzített hangfájlból. Nincs szükség mikrofonra; a felvétel nem kerül feltöltésre szerverre.</p>
        </div>
        <div className="flex gap-2">
          <a href="/?benchmark=sine" className="rounded-xl border border-amber-500/40 px-3 py-2 text-sm text-amber-200">Szinuszreferencia</a>
          <a href="/?benchmark=1" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300">Élő handpan labor</a>
          <a href="/" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300">Vissza</a>
        </div>
      </header>

      <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-amber-100">Automatikus referenciajel-benchmark</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              Determinisztikusan generált D3/A3/D4 jelek: ismert centeltolás, inharmonikus 2×/3× részfelhang,
              gyenge alaphang, zaj, túlvezérlés, alacsony jelszint és csend. Ugyanazt a tényleges WAV-elemzőt futtatja,
              mint a felvétellabor. Ez szoftveres regressziós teszt, nem külső akusztikai referencia.
            </p>
          </div>
          <button type="button" onClick={runSyntheticBenchmark} disabled={benchmarkBusy}
            className="shrink-0 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-50">
            {benchmarkBusy ? 'Benchmark fut…' : benchmarkResults.length ? 'Benchmark újrafuttatása' : 'Benchmark futtatása'}
          </button>
        </div>
        {benchmarkSummary && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-black/25 p-3">
                <p className="text-[10px] text-slate-400">Elemzett eset</p>
                <p className="mt-1 font-mono text-lg text-white">{benchmarkSummary.analysedScenarioCount}/{benchmarkSummary.scenarioCount}</p>
              </div>
              <div className="rounded-lg bg-black/25 p-3">
                <p className="text-[10px] text-slate-400">Mért részfelhang</p>
                <p className="mt-1 font-mono text-lg text-white">{benchmarkSummary.measuredPartialCount}</p>
              </div>
              <div className="rounded-lg bg-black/25 p-3">
                <p className="text-[10px] text-slate-400">Átlagos abszolút maradékhiba</p>
                <p className="mt-1 font-mono text-lg text-white">{fmt(benchmarkSummary.meanAbsoluteResidualErrorCents, 3)} c</p>
              </div>
              <div className="rounded-lg bg-black/25 p-3">
                <p className="text-[10px] text-slate-400">Legnagyobb abszolút maradékhiba</p>
                <p className="mt-1 font-mono text-lg text-white">{fmt(benchmarkSummary.worstAbsoluteResidualErrorCents, 3)} c</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
              <span>Alaphang azonosított: {benchmarkSummary.identifiedCount}</span>
              <span>Bizonytalan: {benchmarkSummary.ambiguousCount}</span>
              <span>Nem azonosítható: {benchmarkSummary.unidentifiedCount}</span>
              <span>Hiányzó 1× csúcs: {benchmarkSummary.missingFundamentalCount}</span>
              <span>Hiányzó csúcsok összesen: {benchmarkSummary.missingPartialCount}</span>
              <span>Jelölt/valódi gyökér eltérés: {benchmarkSummary.candidateRootMismatchCount}</span>
              <span>Oktávhiba-eset: {benchmarkSummary.suspectedOctaveErrorCount}</span>
              <span>Kettős csúcs eset: {benchmarkSummary.possibleDoublePeakScenarioCount}</span>
              <span>Alaphang-ablaklefedettség: {fmt(benchmarkSummary.meanFundamentalFrameCoverage === null ? null : benchmarkSummary.meanFundamentalFrameCoverage * 100, 1)}%</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400">
                  <tr>
                    <th className="p-2.5">Tesztjel</th>
                    <th className="p-2.5">Alaphang státusza</th>
                    <th className="p-2.5">Cél / valódi gyökér</th>
                    <th className="p-2.5">1× hiba</th>
                    <th className="p-2.5">2× hiba</th>
                    <th className="p-2.5">3× hiba</th>
                    <th className="p-2.5">Csúcsok</th>
                    <th className="p-2.5">Kettős csúcs / ablakok</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkResults.map((result) => {
                    const status = result.identifiabilityStatus === 'identified'
                      ? 'azonosított'
                      : result.identifiabilityStatus === 'ambiguous'
                        ? 'bizonytalan'
                        : result.identifiabilityStatus === 'unidentified'
                          ? 'nem azonosítható'
                          : 'nincs elemzés';
                    const statusClass = result.identifiabilityStatus === 'identified'
                      ? 'text-emerald-300'
                      : result.identifiabilityStatus === 'ambiguous'
                        ? 'text-amber-300'
                        : 'text-rose-300';
                    return (
                      <tr key={result.scenarioId} className="border-t border-slate-800">
                        <td className="p-2.5">
                          <span className="block text-slate-200">{result.name}</span>
                          <span className="font-mono text-[10px] text-slate-500">cél {result.targetHz.toFixed(3)} Hz · tényleges gyökér {result.expectedFundamentalHz.toFixed(3)} Hz</span>
                        </td>
                        <td className={'p-2.5 ' + statusClass}>{status}</td>
                        <td className="p-2.5 font-mono text-slate-300">
                          {Math.abs(result.candidateRootDifferenceCents) < 20 ? 'egyezik' : (result.candidateRootDifferenceCents > 0 ? '+' : '') + result.candidateRootDifferenceCents.toFixed(0) + ' c'}
                        </td>
                        {result.partials.map((partial) => (
                          <td key={partial.multiplier} className="p-2.5 font-mono text-slate-300">
                            {partial.residualErrorCents === null ? '—' : (partial.residualErrorCents > 0 ? '+' : '') + partial.residualErrorCents.toFixed(2) + ' c'}
                          </td>
                        ))}
                        <td className="p-2.5 font-mono text-slate-400">
                          {result.partials.filter((partial) => partial.measuredHz !== null).length}/3
                        </td>
                        <td className="p-2.5 text-slate-400">
                          <span className={result.possibleDoublePeak ? 'text-amber-300' : 'text-slate-500'}>{result.possibleDoublePeak ? 'kettős csúcs' : '—'}</span>
                          <span className="mt-1 block font-mono text-[10px]">{result.validFundamentalFrameCount}/{result.analysedFrameCount} érvényes ablak</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] leading-5 text-slate-500">
              A maradékhiba a mért frekvencia és a szintetikus jelforrás pontosan ismert frekvenciája közötti különbség.
              A céleltérés (cent) ettől külön érték; inharmonikus felhangnál nem kell nullának lennie. A „cél / valódi gyökér” oszlop külön jelzi, ha a kiválasztott mérési cél valójában a generált jel 2× vagy 3× részfelhangjára esik.
            </p>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-cyan-500/25 bg-cyan-950/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-cyan-100">FFT- és mintavételi profilvizsgálat</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              Ugyanazokat a hét nehéz jelet futtatja 44.1/48 kHz mintavétellel és 8192/16384/32768 pontos FFT-vel.
              A szintetikus teszt a frekvenciahibát és az ablaklefedettséget hasonlítja össze; nem helyettesíti a fizikai mikrofontesztet.
            </p>
          </div>
          <button type="button" onClick={() => void runMultiProfileBenchmark()} disabled={profileBenchmarkBusy}
            className="shrink-0 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2.5 text-sm font-bold text-cyan-100 disabled:cursor-wait disabled:opacity-50">
            {profileBenchmarkBusy ? 'Profilok futnak…' : profileBenchmarkResults.length ? 'Profilvizsgálat újrafuttatása' : 'Többprofilos vizsgálat'}
          </button>
        </div>
        {profileBenchmarkResults.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400">
                <tr>
                  <th className="p-2.5">Profil</th>
                  <th className="p-2.5">Esetek</th>
                  <th className="p-2.5">Mért részfelhang</th>
                  <th className="p-2.5">Átlagos hiba</th>
                  <th className="p-2.5">Legnagyobb hiba</th>
                  <th className="p-2.5">Ablaklefedettség</th>
                  <th className="p-2.5">Kettős csúcs</th>
                </tr>
              </thead>
              <tbody>
                {profileBenchmarkResults.map((item) => (
                  <tr key={item.profile.id} className="border-t border-slate-800">
                    <td className="p-2.5 font-medium text-slate-200">{item.profile.name}</td>
                    <td className="p-2.5 font-mono text-slate-300">{item.summary.analysedScenarioCount}/{item.summary.scenarioCount}</td>
                    <td className="p-2.5 font-mono text-slate-300">{item.summary.measuredPartialCount}</td>
                    <td className="p-2.5 font-mono text-slate-300">{fmt(item.summary.meanAbsoluteResidualErrorCents, 2)} c</td>
                    <td className="p-2.5 font-mono text-slate-300">{fmt(item.summary.worstAbsoluteResidualErrorCents, 2)} c</td>
                    <td className="p-2.5 font-mono text-slate-300">{fmt(item.summary.meanFundamentalFrameCoverage === null ? null : item.summary.meanFundamentalFrameCoverage * 100, 1)}%</td>
                    <td className="p-2.5 font-mono text-slate-300">{item.summary.possibleDoublePeakScenarioCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {profileBenchmarkBusy && (
          <p role="status" className="text-[10px] text-cyan-200">
            A profilok külön-külön frissülnek; a befejezett profilok már a táblázatban láthatók.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="font-semibold">1. Referenciafelvétel betöltése</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Alaphang célértéke
            <select value={targetIndex} disabled={busy} onChange={(event) => { const nextIndex = Number(event.target.value); setTargetIndex(nextIndex); const audio = audioDataRef.current; if (audio) analyzeLoadedAudio(TARGETS[nextIndex].hz, channelMode); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
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
              <p className="mt-1 text-sm text-slate-300">Robusztus szóródás (MAD): {item.madCents === null ? '—' : item.madCents.toFixed(2) + ' cent'}</p>
              <p className={'mt-1 text-sm font-semibold ' + QUALITY_CLASS[item.quality.status]}>Mérésminőség: {QUALITY_LABEL[item.quality.status]}</p>
              {item.quality.reasons.length > 0 && <p className="mt-1 text-xs text-slate-500">Korlát: {item.quality.reasons.map((reason) => QUALITY_REASON_LABEL[reason]).join(', ')}</p>}
              <p className="mt-1 text-xs text-slate-500">{item.measuredWindows} érvényes ablak / {frames.length}</p>
            </article>)}
          </div>
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Alaphang azonosíthatósága (harmonikus szerkezet)</h3>
              <p className={'text-sm font-semibold ' + IDENTIFIABILITY_CLASS[identifiability.status]}>{IDENTIFIABILITY_LABEL[identifiability.status]}</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">{identifiability.identifiedWindows} azonosított / {identifiability.windows} ablak · {identifiability.ambiguousWindows} bizonytalan · {identifiability.unidentifiedWindows} nem azonosítható</p>
            {identifiability.reasons.length > 0 && <p className="mt-1 text-xs text-slate-500">Korlát: {identifiability.reasons.map((reason) => IDENTIFIABILITY_REASON_LABEL[reason]).join(', ')}</p>}
            <p className="mt-2 text-sm leading-6 text-slate-400">Az ellenőrzés azt vizsgálja, hogy az elemzett cél valóban egy felhangsort megalapozó alaphang-e: megvan-e az oktáv (2×) és a tizenketted (3×), és nincs-e a célnál összemérhető erősségű mélyebb gyökér (a klasszikus oktávhiba). Egyetlen csúcs önmagában nem alaphang.</p>
          </article>
          <p className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3 text-sm leading-6 text-amber-100">A mérésminőség a csúcs szintjét, a helyi kiemelkedést, az érvényes ablakok arányát és a szóródást együtt értékeli; a küszöbök mérnöki kritériumok, nem hitelesített bizonytalanság. A MAD a centeltérések ablakok közötti robusztus szóródását jelzi; nem műszeres mérési bizonytalanság. A medián a felvétel spektrumcsúcsainak diagnosztikai összegzése, nem hitelesített hangolási eredmény. A harmadik részfelhang célértéke 3× alaphang; nem azonos automatikusan az egyenletes temperálású A4 = 440 Hz céllal.</p>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">3. Időbeli lecsengés és mérési stabilitás</h2>
            <button onClick={exportCsv} className="rounded-xl border border-slate-600 px-4 py-2 text-sm">CSV export</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[1420px] text-left text-xs">
              <thead className="bg-slate-900 text-slate-400"><tr>
                <th className="p-3">Idő (s)</th><th className="p-3">Jelszint (dB)</th>
                <th className="p-3">1× Hz</th><th className="p-3">1× cent</th><th className="p-3">1× csúcs dBFS</th><th className="p-3">1× kiemelkedés dB</th>
                <th className="p-3">2× Hz</th><th className="p-3">2× cent</th><th className="p-3">2× csúcs dBFS</th><th className="p-3">2× kiemelkedés dB</th>
                <th className="p-3">3× Hz</th><th className="p-3">3× cent</th><th className="p-3">3× csúcs dBFS</th><th className="p-3">3× kiemelkedés dB</th>
              </tr></thead>
              <tbody>{frames.map((frame, index) => <tr key={frame.timeSeconds} className="border-t border-slate-800">
                <td className="p-3 font-mono">{frame.timeSeconds.toFixed(3)}</td><td className="p-3 font-mono">{frame.rmsDb.toFixed(1)}</td>
                {frame.resonances.map((resonance, i) => <React.Fragment key={i}>
                  <td className="p-3 font-mono">{fmt(resonance.measuredHz)}</td><td className="p-3 font-mono">{fmtCents(resonance.cents)}</td><td className="p-3 font-mono">{fmt(resonance.peakDb, 1)}</td><td className="p-3 font-mono">{fmt(resonance.prominenceDb, 1)}</td>
                </React.Fragment>)}
              </tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-slate-500">A táblázat minden sora egy külön, átfedő hangablak. A korai ütésből származó értékek eltérhetnek a lecsengés stabilabb szakaszától. A hiányzó csúcs „—” marad; a program nem gyárt hozzá becsült hangolási értéket. A csúcs dBFS a relatív digitális jelszintet mutatja, nem kalibrált hangnyomást. A kiemelkedés a csúcs szintjének különbsége a célsáv körüli medián spektrumszinthez képest; ez diagnosztikai mutató, nem hitelesített megbízhatósági pontszám.</p>
        </section>
      </>}
    </div>
  </main>;
}
