import React, { useEffect, useRef, useState } from 'react';
import { findSpectralPeakInWindow } from '../audio/spectralPeak';

const TARGETS = [
  { key: 'fundamental', label: 'D3 alaphang (1×)', hz: 146.832384 },
  { key: 'octave', label: 'D4 oktáv (2×)', hz: 293.664768 },
  { key: 'third', label: 'D3 harmadik részrezgése (3×)', hz: 440.497152 },
] as const;

type Reading = {
  hz: number | null;
  cents: number | null;
  peakDb: number | null;
};

const emptyReadings = (): Record<string, Reading> => Object.fromEntries(
  TARGETS.map((target) => [target.key, { hz: null, cents: null, peakDb: null }]),
);

export default function LiveMicDiagnosticBench() {
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [inputDb, setInputDb] = useState(-100);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [readings, setReadings] = useState<Record<string, Reading>>(emptyReadings);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const aliveRef = useRef(false);
  const lastUiUpdateRef = useRef(0);
  const startingRef = useRef(false);
  const startGenerationRef = useRef(0);

  const stop = () => {
    startGenerationRef.current += 1;
    aliveRef.current = false;
    cancelAnimationFrame(frameRef.current);
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    startingRef.current = false;
    setStarting(false);
    setStreaming(false);
    if (contextRef.current?.state === 'running') void contextRef.current.suspend().catch(() => undefined);
    setInputDb(-100);
    setSampleRate(null);
    setReadings(emptyReadings());
    setLastUpdate(null);
  };

  const start = async () => {
    if (startingRef.current || aliveRef.current) return;
    startingRef.current = true;
    const generation = ++startGenerationRef.current;
    setStarting(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('A böngésző nem biztosít mikrofon-hozzáférést. HTTPS-kapcsolat szükséges.');
      }
      const context = contextRef.current ?? new AudioContext({ latencyHint: 'interactive' });
      contextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      if (generation !== startGenerationRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      // Permission may resolve after unmount or cancellation; never attach a stale stream.
      if (generation !== startGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 16384;
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = -100;
      analyser.maxDecibels = 0; // Preserve strong spectral peak shape for sub-bin interpolation.
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      streamRef.current = stream;
      analyserRef.current = analyser;
      setSampleRate(context.sampleRate);
      setStreaming(true);
      aliveRef.current = true;

      const spectrum = new Float32Array(analyser.frequencyBinCount);
      const waveform = new Float32Array(analyser.fftSize);
      const tick = (timestamp: number) => {
        if (!aliveRef.current || !analyserRef.current) return;
        const activeAnalyser = analyserRef.current;
        activeAnalyser.getFloatFrequencyData(spectrum);
        activeAnalyser.getFloatTimeDomainData(waveform);
        let sum = 0;
        for (const sample of waveform) sum += sample * sample;
        const rms = Math.sqrt(sum / waveform.length);
        const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;

        // Keep audio analysis running at frame rate, but update React state at 10 Hz.
        if (timestamp - lastUiUpdateRef.current >= 100) {
          lastUiUpdateRef.current = timestamp;
          setInputDb(dbfs);
          const next: Record<string, Reading> = {};
          for (const target of TARGETS) {
            // Suppress spectral peaks when the microphone input is effectively silent.
            const peak = dbfs > -65
              ? findSpectralPeakInWindow(target.hz, 150, spectrum, context.sampleRate, -82)
              : null;
            next[target.key] = peak
              ? {
                  hz: peak.freq,
                  cents: 1200 * Math.log2(peak.freq / target.hz),
                  peakDb: peak.magDb,
                }
              : { hz: null, cents: null, peakDb: null };
          }
          setReadings(next);
          setLastUpdate(Date.now());
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (cause) {
      if (generation !== startGenerationRef.current) return;
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      setError(cause instanceof Error ? cause.message : 'Nem sikerült elindítani a mikrofont.');
      setStreaming(false);
    } finally {
      if (generation === startGenerationRef.current) {
        startingRef.current = false;
        setStarting(false);
      }
    }
  };

  useEffect(() => () => {
    startGenerationRef.current += 1;
    aliveRef.current = false;
    cancelAnimationFrame(frameRef.current);
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
  }, []);

  const format = (value: number | null, digits = 2) =>
    value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, color: '#e8eaf0', background: '#111318', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ color: '#93a4bd', letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>BB TUNER · ENGINE DIAGNOSTICS</p>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Élő mikrofon – nyers mérési teszt</h1>
      <p style={{ color: '#b7c0ce', lineHeight: 1.6 }}>
        Ez a teszt közvetlenül a mikrofon spektrumát méri, a fő hangoló simítása és korábbi értéket megtartó logikája nélkül.
        Üsd meg a D3 Dinget, majd figyeld, hogy a jelszint és a három nyers mérés frissül-e.
      </p>
      <button onClick={streaming ? stop : start} disabled={starting} style={{ border: 0, borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: starting ? 'wait' : 'pointer', opacity: starting ? 0.75 : 1, background: streaming ? '#9f3039' : '#e0b15b', color: '#171717' }}>
        {streaming ? 'Mikrofon leállítása' : starting ? 'Mikrofon indítása…' : 'Mikrofon indítása'}
      </button>
      {error && <p role="alert" style={{ color: '#ff9292' }}>{error}</p>}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 20 }}>
        <div style={{ padding: 16, border: '1px solid #303642', borderRadius: 10 }}>
          <div style={{ color: '#93a4bd', fontSize: 13 }}>Bemeneti RMS-szint</div>
          <strong style={{ fontSize: 26 }}>{format(inputDb, 1)} dBFS</strong>
          <div style={{ height: 6, background: '#303642', borderRadius: 6, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, (inputDb + 100)))}%`, background: '#e0b15b' }} />
          </div>
        </div>
        <div style={{ padding: 16, border: '1px solid #303642', borderRadius: 10 }}>
          <div style={{ color: '#93a4bd', fontSize: 13 }}>Mintavétel</div>
          <strong style={{ fontSize: 26 }}>{sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : '—'}</strong>
          <div style={{ color: '#93a4bd', fontSize: 12, marginTop: 8 }}>FFT: 16 384 minta · nincs spektrális simítás</div>
        </div>
      </section>
      <section style={{ marginTop: 18, border: '1px solid #303642', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: 14, background: '#1c2028', fontWeight: 700 }}>Nyers frekvenciamérések</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead><tr style={{ color: '#93a4bd', textAlign: 'left' }}>
              {['Komponens', 'Cél (Hz)', 'Mért (Hz)', 'Eltérés (cent)', 'Csúcsszint (dB)'].map((label) => <th key={label} style={{ padding: 12, borderBottom: '1px solid #303642', fontSize: 12 }}>{label}</th>)}
            </tr></thead>
            <tbody>{TARGETS.map((target) => {
              const reading = readings[target.key] ?? { hz: null, cents: null, peakDb: null };
              return <tr key={target.key}>
                <td style={{ padding: 12, borderBottom: '1px solid #252a33' }}>{target.label}</td>
                <td style={{ padding: 12, fontVariantNumeric: 'tabular-nums' }}>{target.hz.toFixed(3)}</td>
                <td style={{ padding: 12, fontVariantNumeric: 'tabular-nums', color: reading.hz === null ? '#ff9292' : '#f1f3f7' }}>{format(reading.hz, 3)}</td>
                <td style={{ padding: 12, fontVariantNumeric: 'tabular-nums' }}>{format(reading.cents, 2)}</td>
                <td style={{ padding: 12, fontVariantNumeric: 'tabular-nums' }}>{format(reading.peakDb, 1)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
      <p style={{ color: '#93a4bd', fontSize: 13, marginTop: 14 }}>
        {streaming ? 'Mérés aktív: az értékek folyamatosan frissülnek.' : 'A mikrofon még nincs elindítva.'}
        {lastUpdate ? ` Utolsó frissítés: ${new Date(lastUpdate).toLocaleTimeString()}.` : ''}
      </p>
      <p style={{ color: '#b7c0ce', fontSize: 13, lineHeight: 1.6 }}>
        Megjegyzés: a 3× komponens célfrekvenciája 440,497 Hz, nem a temperált A4 440,000 Hz. A nyers mérés diagnosztikai célú, nem hitelesített hangolási bizonyítvány.
      </p>
    </main>
  );
}
