import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteCandidate } from '../audio/noteDetection';
import {
  analyzeWavRecordingAsync,
  downmixChannels,
  type WavFrameAnalysis,
} from '../audio/wavAnalysis';

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  noteCandidates: NoteCandidate[];
  targetFrequencyHz: number;
}

type AnalysisState = 'loading' | 'analyzing' | 'ready' | 'error';

function formatHz(value: number | null | undefined): string {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0
    ? value.toFixed(3) + ' Hz'
    : '—';
}

function formatCents(value: number | null | undefined): string {
  return value !== null && value !== undefined && Number.isFinite(value)
    ? (value > 0 ? '+' : '') + value.toFixed(1) + ' cent'
    : '—';
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function findFrameAtTime(frames: WavFrameAnalysis[], timeSeconds: number): number {
  let low = 0;
  let high = frames.length - 1;
  let best = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (frames[middle].timeSeconds <= timeSeconds) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

/**
 * Runs the exact shared offline spectrum analyser and conservative note detector
 * against the bundled handpan recording. It never requests microphone permission.
 */
export function OwnDRecordingAnalysis({ audioRef, noteCandidates, targetFrequencyHz }: Props) {
  const [state, setState] = useState<AnalysisState>('loading');
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<WavFrameAnalysis[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [error, setError] = useState('');
  const audioSamplesRef = useRef<{ samples: Float32Array; sampleRate: number } | null>(null);
  const analysisVersionRef = useRef(0);
  const frameIndexRef = useRef(0);

  const candidatesKey = useMemo(
    () => noteCandidates.map((candidate) => candidate.id + ':' + candidate.frequency.toFixed(5)).join('|'),
    [noteCandidates],
  );

  useEffect(() => {
    let cancelled = false;
    let context: AudioContext | null = null;

    const loadRecording = async () => {
      setState('loading');
      setError('');
      try {
        const response = await fetch('/audio/sajat-d-handpan.mp3');
        if (!response.ok) throw new Error('A saját D-felvétel letöltése nem sikerült.');
        const encoded = await response.arrayBuffer();
        const AudioContextConstructor = window.AudioContext
          || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) throw new Error('Ez a böngésző nem támogatja a hangfájl helyi elemzését.');
        context = new AudioContextConstructor();
        const decoded = await context.decodeAudioData(encoded.slice(0));
        if (cancelled) return;
        const channels = Array.from(
          { length: decoded.numberOfChannels },
          (_, channel) => decoded.getChannelData(channel),
        );
        const samples = downmixChannels(channels);
        if (samples.length < 16384) throw new Error('A felvétel túl rövid az elemzéshez.');
        audioSamplesRef.current = { samples, sampleRate: decoded.sampleRate };
        setProgress(0);
        setState('analyzing');
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'A felvétel dekódolása sikertelen.');
          setState('error');
        }
      } finally {
        if (context && context.state !== 'closed') {
          try { await context.close(); } catch { /* Ignore a browser cleanup error. */ }
        }
      }
    };

    void loadRecording();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const audio = audioSamplesRef.current;
    if (!audio) return;
    let cancelled = false;
    const version = ++analysisVersionRef.current;
    setState('analyzing');
    setFrames([]);
    setFrameIndex(0);
    frameIndexRef.current = 0;
    setProgress(0);
    setError('');

    const run = async () => {
      try {
        const result = await analyzeWavRecordingAsync(
          audio.samples,
          audio.sampleRate,
          {
            fftSize: 16384,
            hopSize: 2048,
            targetHz: targetFrequencyHz,
            peakFloorDb: -82,
            noteCandidates,
          },
          (value) => {
            if (!cancelled && version === analysisVersionRef.current) setProgress(value);
          },
          6,
        );
        if (cancelled || version !== analysisVersionRef.current) return;
        if (result.length === 0) throw new Error('Nem találtam elemezhető hangablakokat a felvételben.');
        setFrames(result);
        setFrameIndex(0);
        frameIndexRef.current = 0;
        setState('ready');
      } catch (cause) {
        if (!cancelled && version === analysisVersionRef.current) {
          setError(cause instanceof Error ? cause.message : 'A hangfelvétel elemzése sikertelen.');
          setState('error');
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [candidatesKey, targetFrequencyHz, noteCandidates]);

  const syncToPlayback = useCallback(() => {
    const player = audioRef.current;
    if (!player || frames.length === 0) return;
    const next = findFrameAtTime(frames, player.currentTime);
    if (next !== frameIndexRef.current) {
      frameIndexRef.current = next;
      setFrameIndex(next);
    }
  }, [audioRef, frames]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    let animationFrame = 0;
    const tick = () => {
      syncToPlayback();
      if (!player.paused && !player.ended) animationFrame = window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      syncToPlayback();
    };
    player.addEventListener('play', start);
    player.addEventListener('pause', stop);
    player.addEventListener('ended', stop);
    player.addEventListener('timeupdate', syncToPlayback);
    player.addEventListener('seeked', syncToPlayback);
    syncToPlayback();
    if (!player.paused && !player.ended) start();
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      player.removeEventListener('play', start);
      player.removeEventListener('pause', stop);
      player.removeEventListener('ended', stop);
      player.removeEventListener('timeupdate', syncToPlayback);
      player.removeEventListener('seeked', syncToPlayback);
    };
  }, [audioRef, syncToPlayback]);

  const current = frames[Math.min(frameIndex, Math.max(0, frames.length - 1))];
  const detected = current?.detectedNote ?? null;
  const labels = ['Alaphang · 1×', 'Oktáv · 2×', '3. parciális · 3×'];
  const resultRows = current?.resonances ?? [];

  return (
    <section className="mt-3 space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950/70 p-3" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">Felvétel-alapú hangfelismerési teszt</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            A hangfájl közvetlen elemzése mikrofon nélkül. A kijelzés a lejátszás pozíciójához igazodik.
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">
          Mikrofon nem szükséges
        </span>
      </div>

      {state === 'loading' && <p className="text-xs text-slate-300">A saját handpanfelvétel dekódolása…</p>}
      {state === 'analyzing' && (
        <div className="space-y-1.5">
          <div className="flex justify-between gap-2 text-xs text-slate-300">
            <span>Spektrumelemzés és hangjelölt-vizsgálat</span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{ width: progress + '%' }} />
          </div>
        </div>
      )}
      {state === 'error' && <p role="alert" className="text-xs text-rose-300">{error}</p>}

      {state === 'ready' && current && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Felismert hang</div>
              <div className="mt-1 text-xl font-black text-cyan-200">{detected?.noteName ?? '—'}</div>
              <div className="text-[10px] text-slate-400">
                {detected ? Math.round(detected.confidence * 100) + '% megbízhatósági pontszám' : 'Nincs egyértelmű jelölt'}
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Elemzett időpont</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">{formatTime(current.timeSeconds)}</div>
              <div className="text-[10px] text-slate-400">A felvétel ablakpozíciója</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Bemeneti szint</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">{current.rmsDb.toFixed(1)} dBFS</div>
              <div className="text-[10px] text-slate-400">A dekódolt felvételből</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Harmonikus ellenőrzés</div>
              <div className={'mt-1 text-sm font-bold ' + (
                current.identifiability?.status === 'identified' ? 'text-emerald-300' :
                current.identifiability?.status === 'ambiguous' ? 'text-amber-300' : 'text-slate-300'
              )}>
                {current.identifiability?.status === 'identified' ? 'Megerősített' :
                  current.identifiability?.status === 'ambiguous' ? 'Bizonytalan' : 'Nem megerősített'}
              </div>
              <div className="text-[10px] text-slate-400">1× / 2× / 3× együtt</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/5">
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 bg-white/[0.04] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Vizsgálat</span><span>Mért frekvencia</span><span>Eltérés</span>
            </div>
            {resultRows.map((row, index) => (
              <div key={labels[index]} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t border-white/5 px-2 py-2 text-xs">
                <span className="text-slate-300">{labels[index]}</span>
                <span className="font-mono tabular-nums text-white">{formatHz(row?.measuredHz)}</span>
                <span className={'font-mono tabular-nums ' + (
                  row?.cents === null || row?.cents === undefined ? 'text-slate-500' :
                  Math.abs(row.cents) <= 5 ? 'text-emerald-300' :
                  Math.abs(row.cents) <= 15 ? 'text-amber-300' : 'text-rose-300'
                )}>{formatCents(row?.cents)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-slate-500">
            Elemzett ablak: {frameIndex + 1}/{frames.length}. A frekvenciák és eltérések a felvétel minden egymást átfedő részablakából készülnek. A felvétel saját hangolási állapotát mérjük, nem ideális referenciahangot.
          </p>
        </>
      )}
    </section>
  );
}

export default OwnDRecordingAnalysis;
