import React, { useEffect, useRef, useState } from 'react';
import { findSpectralPeakInWindow } from '../audio/spectralPeak';

const TARGETS = [
  { id: 'D3', label: 'D3 alaphang', hz: 146.832384 },
  { id: 'A3', label: 'A3 hang', hz: 220 },
  { id: 'D4', label: 'D4 oktáv', hz: 293.664768 },
  { id: 'A4-ET', label: 'A4 egyenletes temperálás (440 Hz)', hz: 440 },
  { id: 'D3-3x', label: 'D3 harmadik részfelhang (3×)', hz: 146.832384 * 3 },
] as const;
const DETUNINGS = [-40, -10, 0, 10, 40] as const;
const FFT_SIZES = [8192, 16384, 32768] as const;
const DEFAULT_TARGET = TARGETS[0];
const DEFAULT_FFT_SIZE = 16384;

type Measurement = {
  targetHz: number;
  generatedHz: number;
  measuredHz: number | null;
  peakDb: number | null;
  accuracyErrorCents: number | null;
  tuningDeviationCents: number | null;
  expectedDeviationCents: number;
  settled: boolean;
  sampleRate: number;
  fftSize: number;
};

function centsBetween(measuredHz: number | null, referenceHz: number): number | null {
  return measuredHz !== null &&
    Number.isFinite(measuredHz) &&
    measuredHz > 0 &&
    Number.isFinite(referenceHz) &&
    referenceHz > 0
    ? 1200 * Math.log2(measuredHz / referenceHz)
    : null;
}

function formatHz(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(6);
}

function formatCents(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(3)} cent`;
}

/**
 * Digital reference lab. An AudioContext sine oscillator with a known requested
 * frequency is analysed by the same pure spectral-peak helper used by the live tuner.
 * No microphone or potentially out-of-tune handpan recording is used.
 */
export default function SineReferenceBench() {
  const [targetId, setTargetId] = useState<string>(DEFAULT_TARGET.id);
  const [detuningCents, setDetuningCents] = useState<number>(0);
  const [fftSize, setFftSize] = useState<number>(DEFAULT_FFT_SIZE);
  const [listening, setListening] = useState(false);
  const [activeMode, setActiveMode] = useState<'digital' | 'acoustic' | null>(null);
  const [tonePlaying, setTonePlaying] = useState(false);
  const [error, setError] = useState('');
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const signalGainRef = useRef<GainNode | null>(null);
  const silentOutputRef = useRef<GainNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const toneStopTimerRef = useRef<number | null>(null);
  const tonePlayingRef = useRef(false);
  const rafRef = useRef(0);
  const targetHzRef = useRef<number>(DEFAULT_TARGET.hz);
  const generatedHzRef = useRef<number>(DEFAULT_TARGET.hz);
  const detuningRef = useRef(0);
  const fftSizeRef = useRef(DEFAULT_FFT_SIZE);
  const settledAfterRef = useRef(0);
  const lastUiUpdateRef = useRef(0);

  const selectedTarget = TARGETS.find((target) => target.id === targetId) ?? DEFAULT_TARGET;
  const generatedHz = selectedTarget.hz * Math.pow(2, detuningCents / 1200);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    if (toneStopTimerRef.current !== null) window.clearTimeout(toneStopTimerRef.current);
    toneStopTimerRef.current = null;
    tonePlayingRef.current = false;
    setTonePlaying(false);

    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
    microphoneSourceRef.current?.disconnect();
    microphoneSourceRef.current = null;

    const oscillator = oscillatorRef.current;
    oscillatorRef.current = null;
    try { oscillator?.stop(); } catch { /* oscillator may already have stopped */ }
    oscillator?.disconnect();
    signalGainRef.current?.disconnect();
    signalGainRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    silentOutputRef.current?.disconnect();
    silentOutputRef.current = null;

    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') void context.close();

    setListening(false);
    setActiveMode(null);
    setMeasurement(null);
  };

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (toneStopTimerRef.current !== null) window.clearTimeout(toneStopTimerRef.current);
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneSourceRef.current?.disconnect();
    try { oscillatorRef.current?.stop(); } catch { /* already stopped */ }
    oscillatorRef.current?.disconnect();
    signalGainRef.current?.disconnect();
    analyserRef.current?.disconnect();
    silentOutputRef.current?.disconnect();
    void contextRef.current?.close();
  }, []);

  useEffect(() => {
    targetHzRef.current = selectedTarget.hz;
    generatedHzRef.current = generatedHz;
    detuningRef.current = detuningCents;
    fftSizeRef.current = fftSize;

    const context = contextRef.current;
    const oscillator = oscillatorRef.current;
    if (!context || !oscillator || context.state === 'closed') return;

    // A changed reference starts a new settling interval; do not grade the transition.
    oscillator.frequency.setValueAtTime(generatedHz, context.currentTime);
    settledAfterRef.current = performance.now() + (fftSize / context.sampleRate) * 1000 + 50;
    setMeasurement(null);
  }, [selectedTarget.hz, generatedHz, detuningCents, fftSize]);

  const start = async (mode: 'digital' | 'acoustic') => {
    setError('');
    setMeasurement(null);

    try {
      if (
        mode === 'acoustic' &&
        (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function')
      ) {
        throw new Error('A mikrofonos akusztikus teszt nem érhető el ebben a böngészőben. Használj HTTPS-kapcsolatot és engedélyezett mikrofont.');
      }

      const context = new window.AudioContext({ latencyHint: 'interactive' });
      contextRef.current = context;
      await context.resume();

      const analyser = context.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0.05;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;

      if (mode === 'acoustic') {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        microphoneStreamRef.current = stream;
        const microphoneSource = context.createMediaStreamSource(stream);
        microphoneSourceRef.current = microphoneSource;
        microphoneSource.connect(analyser);
      }

      const oscillator = context.createOscillator();
      oscillatorRef.current = oscillator;
      oscillator.type = 'sine';

      const signalGain = context.createGain();
      signalGainRef.current = signalGain;
      // Acoustic mode uses a deliberately low output level. Actual loudness is still
      // controlled by the device's hardware volume; start quietly.
      signalGain.gain.setValueAtTime(mode === 'acoustic' ? 0.035 : 0.1, context.currentTime);

      const silentOutput = context.createGain();
      silentOutputRef.current = silentOutput;
      silentOutput.gain.setValueAtTime(0, context.currentTime);

      oscillator.frequency.setValueAtTime(generatedHz, context.currentTime);
      oscillator.connect(signalGain);
      if (mode === 'digital') {
        signalGain.connect(analyser);
      } else {
        signalGain.connect(context.destination);
      }
      // Analyser output is muted but connected to a destination so the graph is evaluated.
      analyser.connect(silentOutput);
      silentOutput.connect(context.destination);
      oscillator.start();

      targetHzRef.current = selectedTarget.hz;
      generatedHzRef.current = generatedHz;
      detuningRef.current = detuningCents;
      fftSizeRef.current = fftSize;
      settledAfterRef.current = performance.now() + (fftSize / context.sampleRate) * 1000 + 50;
      lastUiUpdateRef.current = 0;
      setListening(true);
      setActiveMode(mode);
      const isAcoustic = mode === 'acoustic';
      tonePlayingRef.current = isAcoustic;
      setTonePlaying(isAcoustic);

      // The external tone runs for only four seconds to limit exposure. Keep the last
      // valid measurement visible afterwards, while leaving the session active until stopped.
      if (isAcoustic) {
        toneStopTimerRef.current = window.setTimeout(() => {
          try { oscillatorRef.current?.stop(); } catch { /* already stopped */ }
          oscillatorRef.current?.disconnect();
          oscillatorRef.current = null;
          signalGainRef.current?.disconnect();
          signalGainRef.current = null;
          tonePlayingRef.current = false;
          toneStopTimerRef.current = null;
          setTonePlaying(false);
        }, 4000);
      }

      const frequencyData = new Float32Array(analyser.frequencyBinCount);
      const loop = () => {
        const activeAnalyser = analyserRef.current;
        const activeContext = contextRef.current;
        if (!activeAnalyser || !activeContext || activeContext.state === 'closed') return;

        // When the acoustic tone ends, freeze the last reading instead of replacing it
        // with room noise or a stale spectral maximum.
        if (mode === 'acoustic' && !tonePlayingRef.current) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        activeAnalyser.getFloatFrequencyData(frequencyData);
        const expectedToneHz = generatedHzRef.current;
        const targetHz = targetHzRef.current;
        const peak = findSpectralPeakInWindow(
          expectedToneHz,
          150,
          frequencyData,
          activeContext.sampleRate,
          -82,
        );
        const measuredHz = peak?.freq ?? null;
        const now = performance.now();
        const settled = now >= settledAfterRef.current;

        const next: Measurement = {
          targetHz,
          generatedHz: expectedToneHz,
          measuredHz,
          peakDb: peak?.magDb ?? null,
          accuracyErrorCents: centsBetween(measuredHz, expectedToneHz),
          tuningDeviationCents: centsBetween(measuredHz, targetHz),
          expectedDeviationCents: detuningRef.current,
          settled,
          sampleRate: activeContext.sampleRate,
          fftSize: fftSizeRef.current,
        };

        // Avoid rerendering at the audio callback rate; measurement still updates 10x/s.
        if (now - lastUiUpdateRef.current >= 100) {
          lastUiUpdateRef.current = now;
          setMeasurement(next);
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nem sikerült elindítani a referenciajelet.');
      stop();
    }
  };

  const errorCents = measurement?.accuracyErrorCents ?? null;
  const passed = measurement?.settled === true &&
    errorCents !== null &&
    Math.abs(errorCents) < 1;

  return (
    <main className="min-h-screen bg-[#070a0e] px-4 py-5 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-400">BB Tuner · Digitális labor</p>
            <h1 className="mt-1 text-2xl font-bold">Szinuszreferencia önellenőrzés</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Két külön teszt: hangtalan digitális önellenőrzés és halk, hangszórón lejátszott szinusz mikrofonos visszamérése.
              Az első az algoritmust, a második az eszköz akusztikus bemeneti útját is vizsgálja.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/?benchmark=1" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300">Valós handpan labor</a>
            <a href="/?benchmark=wav" className="rounded-xl border border-cyan-500/40 px-3 py-2 text-sm text-cyan-200">WAV-elemzés</a>
            <a href="/" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300">Vissza</a>
          </div>
        </header>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="font-semibold">1. Pontos referencia beállítása</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm text-slate-300">
              Referenciahang
              <select
                value={targetId}
                disabled={listening}
                onChange={(event) => setTargetId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
              >
                {TARGETS.map((target) => (
                  <option key={target.id} value={target.id}>{target.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Szándékos eltérés
              <select
                value={detuningCents}
                disabled={listening}
                onChange={(event) => setDetuningCents(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-50"
              >
                {DETUNINGS.map((cents) => (
                  <option key={cents} value={cents}>{cents > 0 ? '+' : ''}{cents} cent</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              FFT-ablak
              <select
                value={fftSize}
                disabled={listening}
                onChange={(event) => setFftSize(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 disabled:opacity-50"
              >
                {FFT_SIZES.map((size) => <option key={size} value={size}>{size} minta</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {!listening ? (
              <>
                <button onClick={() => void start('digital')} className="rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-slate-950">
                  Digitális önellenőrzés (hangtalan)
                </button>
                <button onClick={() => void start('acoustic')} className="rounded-xl border border-cyan-500/50 px-4 py-2.5 font-semibold text-cyan-200">
                  Mikrofonos akusztikus teszt
                </button>
              </>
            ) : (
              <button onClick={stop} className="rounded-xl border border-rose-500/60 px-4 py-2.5 font-semibold text-rose-300">
                Teszt leállítása
              </button>
            )}
            <span className="self-center text-xs text-slate-500">Mintavétel: {measurement?.sampleRate ? `${(measurement.sampleRate / 1000).toFixed(1)} kHz` : '—'}</span>
          </div>
          {activeMode === 'acoustic' && (
            <p className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3 text-sm text-cyan-100">
              A készülék halk szinuszt játszik le legfeljebb 4 másodpercig, és a mikrofont méri. Kezdd alacsony készülék-hangerővel,
              tartsd a mikrofont a hangszórótól távolabb, és állítsd le, ha túl hangos vagy gerjed.
            </p>
          )}
          {activeMode === 'digital' && (
            <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-400">
              Digitális mód: nincs mikrofon és nincs hallható hang. A mért jel közvetlenül a program által generált referencia.
            </p>
          )}
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">2. Referencia és mérési eredmény</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-sm text-slate-400">Névleges cél</div>
              <div className="mt-2 font-mono text-lg">{formatHz(measurement?.targetHz ?? selectedTarget.hz)} Hz</div>
              <p className="mt-1 text-xs text-slate-500">A hangoló célfrekvenciája</p>
            </article>
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-sm text-slate-400">Digitálisan generált</div>
              <div className="mt-2 font-mono text-lg">{formatHz(measurement?.generatedHz ?? generatedHz)} Hz</div>
              <p className="mt-1 text-xs text-slate-500">Matematikai referencia ± kiválasztott centeltérés</p>
            </article>
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-sm text-slate-400">Mért spektrumcsúcs</div>
              <div className="mt-2 font-mono text-lg">{formatHz(measurement?.measuredHz ?? null)} Hz</div>
              <p className="mt-1 text-xs text-slate-500">FFT csúcsinterpoláció · {measurement?.peakDb == null ? '—' : `${measurement.peakDb.toFixed(1)} dB`}</p>
            </article>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-sm text-slate-400">Mérési hiba a pontos szinuszhoz képest</div>
              <div className="mt-2 font-mono text-2xl">{formatCents(errorCents)}</div>
              <p className="mt-1 text-xs text-slate-500">Ez mutatja, mennyire pontosan méri a szoftver az ismert digitális frekvenciát.</p>
            </article>
            <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-sm text-slate-400">Mért eltérés a névleges céltól</div>
              <div className="mt-2 font-mono text-2xl">{formatCents(measurement?.tuningDeviationCents ?? null)}</div>
              <p className="mt-1 text-xs text-slate-500">Várt eltérés: {detuningCents > 0 ? '+' : ''}{detuningCents} cent</p>
            </article>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{activeMode === 'acoustic' ? 'Akusztikus mérőlánc állapota' : 'Digitális mérőlánc állapota'}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  FFT: {measurement?.fftSize ?? fftSize} · mintavétel: {measurement?.sampleRate ? `${(measurement.sampleRate / 1000).toFixed(1)} kHz` : '—'}.
                  {activeMode === 'acoustic' ? ' A referencia 4 másodperc után leáll, az utolsó mérés látható marad.' : ' A teszt csak a teljes FFT-ablak feltöltése után minősít.'}
                </p>
              </div>
              <div className={`rounded-xl px-3 py-2 text-sm font-bold ${!listening ? 'bg-slate-800 text-slate-300' : !measurement?.settled ? 'bg-amber-500/15 text-amber-300' : passed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                {!listening ? 'Várakozás' : !measurement?.settled ? 'Stabilizálódás' : passed ? 'PASS · <1 cent' : 'FIGYELEM · pontatlan'}
              </div>
            </div>
            {listening && measurement?.settled && !passed && (
              <p className="mt-3 text-sm text-rose-200">
                {activeMode === 'acoustic'
                  ? 'Az akusztikus visszamérés hibája 1 cent fölött van vagy nem talált megbízható csúcsot. Ellenőrizd a hangerőt, a mikrofon engedélyét, a távolságot és a környezeti zajt.'
                  : 'A digitális referencia mérése túllépi az 1 centes hibahatárt. Ezt a módot a mikrofonos hangolás kalibrálása előtt javítani kell.'}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 p-4">
          <h2 className="font-semibold">3. Mit bizonyít ez a teszt?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            A teszt a böngésző digitális audióútját és ugyanazt a spektrumcsúcs-algoritmust ellenőrzi,
            amelyet a fő hangoló használ. Az elvárt frekvencia a program által beállított szinusz frekvenciája,
            nem egy handpan felvétel becsült hangmagassága.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Fontos különbség: a D3 harmadik részfelhangjának referenciaértéke 3 × 146.832384 = 440.497152 Hz,
            míg az egyenletesen temperált A4 célértéke 440.000000 Hz. A különbség körülbelül +1.96 cent.
            Ezek eltérő célok, ezért a hangolónak világosan meg kell különböztetnie a felhangarány szerinti
            referenciaértéket és a temperált hangjegy célfrekvenciáját.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            A digitális mód a szoftveres frekvenciamérést vizsgálja. Az akusztikus mód ezen felül a digitális szinuszkimenetet,
            a hangszórót, a szobát, a mikrofont és az eszköz bemeneti láncát is teszteli, ezért az eredmény zaj- és pozíciófüggő.
            Professzionális abszolút kalibrációhoz továbbra is hitelesített külső frekvenciareferencia szükséges; a böngésző által
            kért frekvencia önmagában nem hitelesített mérőszabvány.
          </p>
        </section>
      </div>
    </main>
  );
}
