/**
 * BB Tuner – Handpan tuning analyzer
 * Pixel-perfect implementation of the functional specification and visual design.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Menu,
  Settings,
  Mic,
  MicOff,
  BarChart2,
  Activity,
  Layers,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { bbAudioEngine } from './audio/audioEngine';
import { PRESET_SCALES, midiToFreq, freqToNoteAndCents } from './audio/scales';
import { BBNavTab, HandpanScale, ResonanceMeasurement, ToneFieldNote, TuningLogEntry } from './types/tuner';
import { BBStrobeBands } from './components/BBStrobeBands';
import { BBSpectrum } from './components/BBSpectrum';
import { BBCards } from './components/BBCards';
import { BBStabilityGraph } from './components/BBStabilityGraph';
import { BBHangmezoView } from './components/BBHangmezoView';
import { BBMeresekView } from './components/BBMeresekView';
import { BBSettingsModal } from './components/BBSettingsModal';
import { BBSpectrogram } from './components/BBSpectrogram';

function isValidTuningLogEntry(value: unknown): value is TuningLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<TuningLogEntry>;
  return typeof entry.id === 'string' &&
    typeof entry.noteName === 'string' &&
    typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp) &&
    typeof entry.fundamentalHz === 'number' && Number.isFinite(entry.fundamentalHz) && entry.fundamentalHz > 0 &&
    typeof entry.fundamentalCents === 'number' && Number.isFinite(entry.fundamentalCents) &&
    typeof entry.fifthHz === 'number' && Number.isFinite(entry.fifthHz) && entry.fifthHz > 0 &&
    typeof entry.fifthCents === 'number' && Number.isFinite(entry.fifthCents) &&
    typeof entry.octaveHz === 'number' && Number.isFinite(entry.octaveHz) && entry.octaveHz > 0 &&
    typeof entry.octaveCents === 'number' && Number.isFinite(entry.octaveCents) &&
    typeof entry.overallInTune === 'boolean';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<BBNavTab>('hangolas');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const autoDetectionRef = useRef<{ id: string; count: number } | null>(null);

  // Calibration and Scale
  const [a4Ref, setA4Ref] = useState<number>(440);
  const [currentScale, setCurrentScale] = useState<HandpanScale>(PRESET_SCALES[0]); // D Kurd 9

  // Selected resonance focus for the main display and stability graph
  const [selectedRole, setSelectedRole] = useState<'fundamental' | 'fifth' | 'octave'>('fundamental');

  // Compute tone field notes with current A4
  const toneNotes: ToneFieldNote[] = useMemo(() => {
    return currentScale.notes.map((n, idx) => {
      const f0 = midiToFreq(n.midi, a4Ref);
      // Handpan acoustic resonances:
      // Fundamental: f0 (e.g. D3 = 146.83 Hz)
      // Traditional handpan partials: fundamental (1x), octave (2x), compound fifth (3x).
      // The third partial is not the ordinary 1.5x musical fifth.
      return {
        id: `note_${idx}_${n.name}`,
        noteName: n.name,
        frequency: f0,
        fifthFreq: f0 * 3.0,
        octaveFreq: f0 * 2.0,
        positionIndex: idx,
      };
    });
  }, [currentScale, a4Ref]);

  // Selected tone field note (default Ding D3)
  const [selectedNote, setSelectedNote] = useState<ToneFieldNote>(toneNotes[0]);

  useEffect(() => {
    if (toneNotes.length > 0) {
      setSelectedNote(toneNotes[0]);
    }
  }, [toneNotes]);

  // Note names for the 3 resonances of the selected note
  const resonanceNoteNames = useMemo(() => {
    // If D3 is selected: Alap = D3, oktáv = D4, 3. parciális = A4
    // Otherwise calculate octave and fifth names
    return {
      fundamental: selectedNote.noteName,
      fifth: freqToNoteAndCents(selectedNote.fifthFreq, a4Ref).note,
      octave: freqToNoteAndCents(selectedNote.octaveFreq, a4Ref).note,
    };
  }, [selectedNote, a4Ref]);

  // The stability graph and dispersion readout use the same selected resonance.
  useEffect(() => {
    bbAudioEngine.setStabilityRole(selectedRole);
    setStandardDeviationCents(0);
  }, [selectedRole]);

  // Stability samples belong to a single selected note; don't mix different targets.
  const previousNoteIdRef = useRef(selectedNote.id);
  useEffect(() => {
    if (previousNoteIdRef.current !== selectedNote.id) {
      bbAudioEngine.resetStabilityHistory();
      setStandardDeviationCents(0);
      previousNoteIdRef.current = selectedNote.id;
    }
  }, [selectedNote.id]);

  // Live Audio Analysis State
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [hasSignal, setHasSignal] = useState(false);
  const [inputLevelDb, setInputLevelDb] = useState(-100);
  const [transientHoldoff, setTransientHoldoff] = useState(false);
  const [highInputLevel, setHighInputLevel] = useState(false);
  const [sampleRateKhz, setSampleRateKhz] = useState(48);
  const [standardDeviationCents, setStandardDeviationCents] = useState(0);

  // The 3 resonance measurements
  const [alap, setAlap] = useState<ResonanceMeasurement>({
    role: 'fundamental',
    name: 'Alap',
    noteName: 'D3',
    measuredHz: null,
    targetHz: 146.50,
    deviationCents: null,
    amplitudeDb: null,
    confidence: 0,
    timestampMs: Date.now(),
    status: 'no-signal',
  });

  const [kvint, setKvint] = useState<ResonanceMeasurement>({
    role: 'fifth',
    name: 'Kvint',
    noteName: 'A3',
    measuredHz: null,
    targetHz: 220.00,
    deviationCents: null,
    amplitudeDb: null,
    confidence: 0,
    timestampMs: Date.now(),
    status: 'no-signal',
  });

  const [oktav, setOktav] = useState<ResonanceMeasurement>({
    role: 'octave',
    name: 'Oktáv',
    noteName: 'D4',
    measuredHz: null,
    targetHz: 293.66,
    deviationCents: null,
    amplitudeDb: null,
    confidence: 0,
    timestampMs: Date.now(),
    status: 'no-signal',
  });

  // Measurements Log
  const [logs, setLogs] = useState<TuningLogEntry[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('bb-tuner-measurements-v1') || '[]');
      return Array.isArray(parsed) ? parsed.filter(isValidTuningLogEntry) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try { localStorage.setItem('bb-tuner-measurements-v1', JSON.stringify(logs)); } catch (error) { console.warn('Nem sikerült menteni a mérési naplót:', error); }
  }, [logs]);

  // Audio Analysis Loop (~30 Hz)
  useEffect(() => {
    let animId = 0;
    let lastTick = performance.now();

    function loop(now: number) {
      if (now - lastTick >= 33) {
        lastTick = now;

        if (autoDetect) {
          const detected = bbAudioEngine.detectNote(
            toneNotes.map((note) => ({ id: note.id, noteName: note.noteName, frequency: note.frequency }))
          );
          if (detected) {
            if (autoDetectionRef.current?.id === detected.id) {
              autoDetectionRef.current.count += 1;
            } else {
              autoDetectionRef.current = { id: detected.id, count: 1 };
            }
            const matched = toneNotes.find((note) => note.id === detected.id);
            // Require three consecutive matching frames to avoid note changes from a single transient.
            if (matched && matched.id !== selectedNote.id && autoDetectionRef.current.count >= 3) setSelectedNote(matched);
          } else {
            autoDetectionRef.current = null;
          }
        }

        const result = bbAudioEngine.analyze(
          selectedNote.frequency,
          selectedNote.fifthFreq,
          selectedNote.octaveFreq,
          resonanceNoteNames
        );

        if (result) {
          setHasSignal(result.hasSignal);
          setInputLevelDb(result.inputLevelDb);
          setTransientHoldoff(result.transientHoldoff);
          setHighInputLevel(result.highInputLevel);
          setSampleRateKhz(result.sampleRateKhz);
          setStandardDeviationCents(result.standardDeviationCents);

          // Always propagate all three channels, including NO_SIGNAL/UNCERTAIN.
          // Never leave stale or demo values on screen after the sound disappears.
          setAlap(result.alap);
          setKvint(result.kvint);
          setOktav(result.oktav);
        }
      }

      if (isListening) {
        animId = requestAnimationFrame(loop);
      }
    }

    if (isListening) {
      animId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animId);
  }, [isListening, selectedNote, resonanceNoteNames, autoDetect, toneNotes]);

  // Toggle microphone
  const handleToggleMic = async () => {
    if (isListening) {
      bbAudioEngine.stopMicrophone();
      setIsListening(false);
      setMicError('');
      setHasSignal(false);
      setInputLevelDb(-100);
      setTransientHoldoff(false);
      setHighInputLevel(false);
      const clearMeasurement = (m: ResonanceMeasurement, targetHz: number): ResonanceMeasurement => ({
        ...m, measuredHz: null, targetHz, deviationCents: null, amplitudeDb: null,
        confidence: 0, timestampMs: Date.now(), status: 'no-signal',
      });
      setAlap(clearMeasurement(alap, selectedNote.frequency));
      setKvint(clearMeasurement(kvint, selectedNote.fifthFreq));
      setOktav(clearMeasurement(oktav, selectedNote.octaveFreq));
    } else {
      setMicError('');
      const ok = await bbAudioEngine.startMicrophone();
      if (ok) {
        setIsListening(true);
      } else {
        setMicError(bbAudioEngine.getErrorMessage() || 'A mikrofon nem indítható el. Ellenőrizd az engedélyeket.');
      }
    }
  };

  // Capture measurement to logbook
  const handleCaptureSnapshot = () => {
    if (![alap, kvint, oktav].every((m) => m.status === 'valid' && m.measuredHz !== null && m.deviationCents !== null)) return;
    const newEntry: TuningLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: Date.now(),
      noteName: selectedNote.noteName,
      fundamentalHz: alap.measuredHz!,
      fundamentalCents: alap.deviationCents!,
      fifthHz: kvint.measuredHz!,
      fifthCents: kvint.deviationCents!,
      octaveHz: oktav.measuredHz!,
      octaveCents: oktav.deviationCents!,
      overallInTune:
        Math.abs(alap.deviationCents!) <= 3 &&
        Math.abs(kvint.deviationCents!) <= 3 &&
        Math.abs(oktav.deviationCents!) <= 3,
    };
    setLogs((prev) => [newEntry, ...prev]);
  };

  // Determine active resonance details for Section B header
  const activeResonance = selectedRole === 'fundamental' ? alap : selectedRole === 'fifth' ? kvint : oktav;
  const activeCents = activeResonance.deviationCents;
  const isNearTune = activeResonance.status === 'valid' && activeCents !== null && Math.abs(activeCents) <= 3.0;

  // Textual assessment (e.g. "(kissé magas)", "(kissé mély)", "(pontos)")
  const assessmentText = !hasSignal
    ? ''
    : activeResonance.status !== 'valid' || activeCents === null
    ? '(nem mérhető biztosan)'
    : isNearTune
    ? '(pontos)'
    : activeCents !== null && activeCents > 0
    ? '(kissé magas)'
    : '(kissé mély)';

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#f1f5f9] flex flex-col items-center justify-start antialiased selection:bg-[#f59e0b]/30">
      {/* Mobile container constrained to smartphone frame width */}
      <div className="w-full max-w-[420px] min-h-screen flex flex-col justify-between px-3.5 pt-2 pb-24 relative select-none">
        
        {/* ================= SECTION A: HEADER & MIKROFONÁLLAPOT ================= */}
        {micError && (
          <div role="alert" className="mx-1 mt-2 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {micError}
          </div>
        )}
        <div>
          {/* Header Bar */}
          <header className="flex items-center justify-between py-1.5 px-1">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 text-slate-300 hover:text-white transition"
              title="Menü"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* BB Tuner title */}
            <div className="text-center leading-none">
              <div className="text-lg font-black tracking-tight flex items-center justify-center gap-1">
                <span className="text-[#f59e0b]">BB</span>
                <span className="text-white">Tuner</span>
              </div>
              <div className="text-[10px] text-slate-400 font-normal tracking-wide mt-0.5">
                Handpan tuning analyzer
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAutoDetect((value) => !value)}
                className={`px-2 py-1 rounded-full border text-[10px] font-semibold ${autoDetect ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400'}`}
                title="Automatikus hangfelismerés kapcsolása"
              >
                AUTO {autoDetect ? 'BE' : 'KI'}
              </button>
              <button onClick={() => setIsSettingsOpen(true)} className="p-1 text-slate-300 hover:text-white transition" title="Beállítások">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Microphone Status Bar */}
          <div className="flex items-center justify-between py-2 px-1 text-xs">
            {/* Left: Mic state dot & label */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  isListening
                    ? 'bg-[#10b981] shadow-[0_0_8px_#10b981]'
                    : 'bg-slate-600'
                }`}
              />
              <span className={`text-[11px] font-medium ${isListening ? 'text-slate-200' : 'text-slate-400'}`}>
                {isListening ? 'Mikrofon aktív' : 'Mikrofon inaktív'}
              </span>
            </div>

            {/* Right: Sample rate, input level dB, and LED meter */}
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span>{sampleRateKhz} kHz</span>
              <span className="text-slate-600">|</span>
              <span className="w-11 text-right">{isListening && hasSignal ? `${inputLevelDb} dB` : '-∞ dB'}</span>

              {/* 8-segment LED VU meter matching screenshot */}
              <div className="flex items-center gap-[2px] ml-1">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((barIdx) => {
                  // Thresholds: -60, -50, -40, -30, -20, -12, -6, -2 dB
                  const thresholds = [-60, -50, -40, -30, -22, -14, -8, -3];
                  const isLit = isListening && hasSignal && inputLevelDb >= thresholds[barIdx];

                  let colorClass = 'bg-[#10b981]'; // Green (bars 0-4)
                  if (barIdx >= 5 && barIdx <= 6) colorClass = 'bg-[#f59e0b]'; // Yellow/Amber
                  if (barIdx === 7) colorClass = 'bg-[#f43f5e]'; // Red peak

                  return (
                    <div
                      key={barIdx}
                      className={`w-[3px] h-3 rounded-[1px] transition-opacity duration-75 ${
                        isLit ? `${colorClass} opacity-100 shadow-[0_0_4px_currentColor]` : 'bg-slate-800 opacity-40'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {isListening && (transientHoldoff || highInputLevel) && (
          <div role="status" className={`mx-1 mb-2 rounded-md border px-2 py-1.5 text-[11px] ${highInputLevel ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
            {highInputLevel
              ? 'Túl erős bemeneti jel – üss finomabban vagy távolítsd a mikrofont a hangszertől.'
              : 'Ütés tranziensének kiszűrése – várj a zengő sustain szakaszra.'}
          </div>
        )}

        {/* ================= TAB 1: MAIN TUNING SCREEN ================= */}
        {activeTab === 'hangolas' && (
          <div className="flex flex-col gap-1.5 flex-1 justify-between">
            {/* ================= SECTION B: MAIN PITCH & STROBE BANDS ================= */}
            <div>
              {/* Main Pitch Row (Large D3, +2.3 cent, Alaphang dropdown) */}
              <div className="flex items-start justify-between px-1 pt-1 pb-1">
                {/* Note Name & Frequency */}
                <div className="flex flex-col">
                  <span className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-none">
                    {selectedNote.noteName}
                  </span>
                  <span className="text-sm font-mono text-slate-300 font-semibold mt-1">
                    {alap.measuredHz ? `${alap.measuredHz.toFixed(2)} Hz` : `${selectedNote.frequency.toFixed(2)} Hz`}
                  </span>
                </div>

                {/* Deviation Cents & Assessment */}
                <div className="flex flex-col items-center justify-center pt-0.5">
                  <div
                    className={`text-xl sm:text-2xl font-mono font-bold tracking-tight ${
                      activeCents !== null && isNearTune ? 'text-[#10b981]' : activeCents !== null && Math.abs(activeCents) > 10 ? 'text-[#f43f5e]' : 'text-[#f59e0b]'
                    }`}
                  >
                    {activeCents !== null && activeResonance.status === 'valid' ? `${activeCents > 0 ? '+' : ''}${activeCents.toFixed(1)} cent` : '— cent'}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {assessmentText}
                  </div>
                </div>

                {/* Resonance Role Selector Pill */}
                <button
                  onClick={() => {
                    const roles: ('fundamental' | 'fifth' | 'octave')[] = ['fundamental', 'fifth', 'octave'];
                    const nextIdx = (roles.indexOf(selectedRole) + 1) % roles.length;
                    setSelectedRole(roles[nextIdx]);
                  }}
                  className="px-2.5 py-1.5 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-medium flex items-center gap-1 hover:bg-[#f59e0b]/20 transition"
                >
                  <span>{selectedRole === 'fundamental' ? 'Alaphang' : selectedRole === 'fifth' ? '3. parciális' : 'Oktáv'}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Three Stroboscope Bands (Alap, Kvint, Oktáv) */}
              <BBStrobeBands
                alap={alap}
                kvint={kvint}
                oktav={oktav}
                hasSignal={hasSignal}
                selectedRole={selectedRole}
                onSelectRole={setSelectedRole}
              />
            </div>

            {/* ================= SECTION C: FREQUENCY SPECTRUM ================= */}
            <BBSpectrum
              alap={alap}
              kvint={kvint}
              oktav={oktav}
              hasSignal={hasSignal}
              onSelectPeak={setSelectedRole}
            />

            {/* ================= SECTION D: THREE MEASUREMENT CARDS ================= */}
            <BBCards
              alap={alap}
              kvint={kvint}
              oktav={oktav}
              hasSignal={hasSignal}
              selectedRole={selectedRole}
              onSelectRole={setSelectedRole}
            />

            {/* ================= SECTION E: FREQUENCY STABILITY GRAPH ================= */}
            <BBStabilityGraph
              roleName={selectedRole === 'fundamental' ? 'Alaphang' : selectedRole === 'fifth' ? '3. parciális' : 'Oktáv'}
              hasSignal={hasSignal}
              currentCents={activeCents ?? 0}
              standardDeviationCents={standardDeviationCents}
            />
          </div>
        )}

        {/* ================= TAB 2: DETAILED SPECTRUM VIEW ================= */}
        {activeTab === 'spektrum' && (
          <div className="flex-1 flex flex-col gap-3 py-2">
            <BBSpectrum
              alap={alap}
              kvint={kvint}
              oktav={oktav}
              hasSignal={hasSignal}
              onSelectPeak={setSelectedRole}
            />
            <BBSpectrogram active={isListening} />
            <BBStabilityGraph
              roleName={selectedRole === 'fundamental' ? 'Alaphang' : selectedRole === 'fifth' ? '3. parciális' : 'Oktáv'}
              hasSignal={hasSignal}
              currentCents={activeCents ?? 0}
              standardDeviationCents={standardDeviationCents}
            />
            <div className="p-3 rounded-xl bg-[#0b0f14] border border-white/5 text-xs text-slate-300">
              <div className="font-bold text-white mb-1">Részletes Spektrális Csúcsok:</div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] mt-2">
                <div className="p-2 rounded bg-slate-900/60 border border-white/5">
                  <div className="text-[#f59e0b] font-sans font-semibold">1× Alaphang</div>
                  <div>{alap.measuredHz ? `${alap.measuredHz.toFixed(2)} Hz` : '--'}</div>
                  <div className="text-slate-400">Amp: {alap.amplitudeDb ? `${alap.amplitudeDb.toFixed(1)} dB` : '--'}</div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-white/5">
                  <div className="text-[#c084fc] font-sans font-semibold">3× Parciális</div>
                  <div>{kvint.measuredHz ? `${kvint.measuredHz.toFixed(2)} Hz` : '--'}</div>
                  <div className="text-slate-400">Amp: {kvint.amplitudeDb ? `${kvint.amplitudeDb.toFixed(1)} dB` : '--'}</div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-white/5">
                  <div className="text-[#38bdf8] font-sans font-semibold">2× Oktáv</div>
                  <div>{oktav.measuredHz ? `${oktav.measuredHz.toFixed(2)} Hz` : '--'}</div>
                  <div className="text-slate-400">Amp: {oktav.amplitudeDb ? `${oktav.amplitudeDb.toFixed(1)} dB` : '--'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: HANGMEZŐ (TONE FIELD MAP) ================= */}
        {activeTab === 'hangmezo' && (
          <div className="flex-1 flex flex-col justify-center">
            <BBHangmezoView
              notes={toneNotes}
              selectedNote={selectedNote}
              onSelectNote={setSelectedNote}
              hasSignal={hasSignal}
              alapCents={alap.deviationCents}
            />
          </div>
        )}

        {/* ================= TAB 4: MÉRÉSEK (LOGBOOK & EXPORT) ================= */}
        {activeTab === 'meresek' && (
          <div className="flex-1 flex flex-col">
            <BBMeresekView
              logs={logs}
              onClearLogs={() => setLogs([])}
              onCapture={handleCaptureSnapshot}
              canCapture={[alap, kvint, oktav].every((m) => m.status === 'valid' && m.measuredHz !== null && m.deviationCents !== null)}
              hasSignal={hasSignal}
            />
          </div>
        )}

        {/* ================= SECTION 8: BOTTOM NAVIGATION DOCK & GOLDEN MIC BUTTON ================= */}
        <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-[400px] rounded-2xl bg-[#0d121a]/95 border border-white/10 px-3 py-2 flex items-center justify-between text-slate-400 shadow-2xl backdrop-blur-md">
          {/* Tab 1: Hangolás */}
          <button
            onClick={() => setActiveTab('hangolas')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'hangolas' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Hangolás</span>
            {activeTab === 'hangolas' && (
              <span className="w-3 h-0.5 bg-[#f59e0b] rounded-full mt-0.5" />
            )}
          </button>

          {/* Tab 2: Spektrum */}
          <button
            onClick={() => setActiveTab('spektrum')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'spektrum' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Spektrum</span>
          </button>

          {/* Center Floating Golden Mic Button (Exact match to screenshot!) */}
          <div className="relative -mt-6">
            <button
              onClick={handleToggleMic}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.35)] transition-transform active:scale-95 border-2 ${
                isListening
                  ? 'bg-gradient-to-br from-[#f59e0b] via-[#fbbf24] to-[#d97706] text-slate-950 border-white/40 ring-4 ring-[#f59e0b]/20'
                  : 'bg-gradient-to-br from-[#d97706] to-[#b45309] text-slate-950 border-[#f59e0b]/40 hover:opacity-95'
              }`}
              title={isListening ? 'Mérés Leállítása' : 'Mérés Indítása'}
            >
              {isListening ? (
                <Mic className="w-6 h-6 text-slate-950" />
              ) : (
                <MicOff className="w-6 h-6 text-slate-950" />
              )}
            </button>
          </div>

          {/* Tab 3: Hangmező */}
          <button
            onClick={() => setActiveTab('hangmezo')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'hangmezo' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Hangmező</span>
          </button>

          {/* Tab 4: Mérések */}
          <button
            onClick={() => setActiveTab('meresek')}
            className={`flex flex-col items-center gap-0.5 w-14 transition ${
              activeTab === 'meresek' ? 'text-[#f59e0b]' : 'hover:text-white'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight">Mérések</span>
          </button>
        </nav>

        {/* Settings & Scale Modal */}
        <BBSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          a4Ref={a4Ref}
          onChangeA4={setA4Ref}
          selectedScaleId={currentScale.id}
          onSelectScale={setCurrentScale}
          sampleRateKhz={sampleRateKhz}
        />
      </div>
    </div>
  );
}
