/**
 * Hangoal akusztikai motor
 * Real-time microphone input, FFT analysis, multi-resonance tracking (Alaphang, 3. parciális, Oktáv),
 * parabolic peak interpolation, input dB calculation, and stability tracking.
 */

import { ResonanceMeasurement, MicState } from '../types/tuner';
import { chooseNoteCandidate, NoteCandidate } from './noteDetection';
import { detectTransientOnset, isTransientHoldoffActive, StablePitchTracker } from './transientGuard';
import { PitchSample, smoothPitchSample } from './pitchSmoothing';
import { estimatePitchYin } from './yinPitch';
import { isNearDigitalClipPeak } from './inputClipping';
import { isUsableSignalLevel } from './signalLevel';
import { isSameMeasurementTarget } from './measurementCache';
import { isReliableResonanceConfidence, isTrackableResonancePeak, resonanceConfidenceFromDb } from './peakConfidence';
import { analyzeSpectralPeakInWindow, findSpectralPeakInWindow, interpolateSpectralPeak } from './spectralPeak';
import { finalizePeakReading } from './resonanceMetrics';
import { fuseAgreeingFrequencyEstimates } from './frequencyFusion';
import { shouldRetryDefaultAudioInput } from './deviceSelection';

export class BBAudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneStream: MediaStream | null = null;
  private autoGainControlStatus: boolean | null = null;
  private lastInputDeviceFallback = false;
  private sourceNode: AudioNode | null = null;
  private mediaElementSourceNode: MediaElementAudioSourceNode | null = null;
  private mediaElementSourceElement: HTMLAudioElement | null = null;
  private inputMode: 'inactive' | 'microphone' | 'media-element' | 'tone' = 'inactive';

  private micState: MicState = 'inactive';
  private errorMessage = '';

  // Audio configuration
  private fftSize = 16384; // Balance low-frequency resolution with the short sustain of struck handpan notes
  private timeData: Float32Array = new Float32Array(16384);
  private freqData: Float32Array = new Float32Array(4096);

  // Metering & input level
  private inputLevelDb = -100;
  private sampleRate = 48000;
  private previousRms = 0;
  private lastTransientAt = 0;
  private transientDetected = false;
  private transientHoldoff = false;

  // Pitch stability history (rolling 10 seconds)
  private stabilityHistory: { timestamp: number; cents: number; valid: boolean }[] = [];
  private stabilityRole: 'fundamental' | 'fifth' | 'octave' = 'fundamental';
  private lastValidResonances: Partial<Record<'fundamental' | 'fifth' | 'octave', { hz: number; targetHz: number; cents: number; amplitudeDb: number; confidence: number; timestampMs: number }>> = {};
  private pitchHistory: Record<'fundamental' | 'fifth' | 'octave', PitchSample[]> = { fundamental: [], fifth: [], octave: [] };
  private stablePitchTrackers: Record<'fundamental' | 'fifth' | 'octave', StablePitchTracker> = {
    fundamental: new StablePitchTracker({ requiredReadings: 4, maxDeviationCents: 5, minConfidence: 0.32 }),
    fifth: new StablePitchTracker({ requiredReadings: 4, maxDeviationCents: 7, minConfidence: 0.32 }),
    octave: new StablePitchTracker({ requiredReadings: 4, maxDeviationCents: 7, minConfidence: 0.32 }),
  };

  // Tone generator for audio reference
  private toneOsc: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;
  private toneSilenceGain: GainNode | null = null;

  public async startMicrophone(preferredDeviceId?: string): Promise<boolean> {
    try {
      if (this.micState === 'active' && this.microphoneStream) return true;
      if (this.inputMode === 'tone') this.stopTone();
      if (this.inputMode === 'media-element') this.stopAudioElementInput();
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        this.micState = 'error';
        this.errorMessage = 'Ez a böngésző nem biztosít mikrofon-hozzáférést. Nyisd meg az alkalmazást támogatott, HTTPS-kapcsolaton.';
        return false;
      }
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.sampleRate = this.audioCtx.sampleRate;

      // Request raw microphone audio without telecom filtering. A selected device is
      // requested with an exact ID; if it has disappeared, retry the default device.
      this.lastInputDeviceFallback = false;
      const baseAudioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        // Ask the browser/OS to normalize microphone level for quiet strikes.
        // Some browsers/devices may ignore this constraint; clipping diagnostics remain active.
        autoGainControl: true,
      };
      if (preferredDeviceId) {
        try {
          this.microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: { ...baseAudioConstraints, deviceId: { exact: preferredDeviceId } },
          });
        } catch (deviceError: unknown) {
          const errorName = deviceError instanceof DOMException
            ? deviceError.name
            : deviceError && typeof deviceError === 'object' && 'name' in deviceError
              ? String((deviceError as { name: unknown }).name)
              : '';
          if (!shouldRetryDefaultAudioInput(errorName, preferredDeviceId)) throw deviceError;
          this.lastInputDeviceFallback = true;
          this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: baseAudioConstraints });
        }
      } else {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: baseAudioConstraints });
      }
      const microphoneTrack = this.microphoneStream.getAudioTracks()[0];
      const trackSettings = typeof microphoneTrack?.getSettings === 'function'
        ? microphoneTrack.getSettings()
        : undefined;
      this.autoGainControlStatus = typeof trackSettings?.autoGainControl === 'boolean'
        ? trackSettings.autoGainControl
        : null;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.05; // Keep attack/sustain changes responsive; pitch smoothing is handled separately
      this.analyser.minDecibels = -100;
      // Do not clamp strong FFT peaks at -10 dB: a flattened peak biases sub-bin interpolation.
      this.analyser.maxDecibels = 0;

      this.timeData = new Float32Array(this.analyser.fftSize);
      this.freqData = new Float32Array(this.analyser.frequencyBinCount);

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.microphoneStream);
      this.sourceNode.connect(this.analyser);
      this.inputMode = 'microphone';

      this.micState = 'active';
      this.errorMessage = '';
      return true;
    } catch (err: unknown) {
      console.error('Microphone error:', err);
      this.microphoneStream?.getTracks().forEach((track) => track.stop());
      this.microphoneStream = null;
      this.autoGainControlStatus = null;
      this.sourceNode?.disconnect();
      this.sourceNode = null;
      this.analyser = null;
      this.micState = 'error';
      const name = err instanceof DOMException ? err.name : '';
      this.errorMessage = name === 'NotAllowedError' || name === 'SecurityError'
        ? 'A mikrofonhoz nincs engedély. Engedélyezd a mikrofont a böngésző beállításaiban, és HTTPS-kapcsolaton nyisd meg az alkalmazást.'
        : name === 'NotFoundError'
        ? 'Nem található mikrofon ezen az eszközön.'
        : err instanceof Error ? err.message : 'Nem sikerült hozzáférni a mikrofonhoz';
      return false;
    }
  }

  /**
   * Routes an HTML audio element through the same analyser used by microphone input.
   * This powers a short prerecorded test without requesting microphone permissions.
   */
  public async startAudioElementInput(element: HTMLAudioElement): Promise<boolean> {
    try {
      if (this.inputMode === 'tone') this.stopTone();
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
      }
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      this.sampleRate = this.audioCtx.sampleRate;

      if (this.microphoneStream) {
        this.microphoneStream.getTracks().forEach((track) => track.stop());
        this.microphoneStream = null;
      }
      this.sourceNode?.disconnect();
      this.sourceNode = null;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.05;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = 0;
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.freqData = new Float32Array(this.analyser.frequencyBinCount);

      if (!this.mediaElementSourceNode || this.mediaElementSourceElement !== element) {
        this.mediaElementSourceNode?.disconnect();
        this.mediaElementSourceNode = this.audioCtx.createMediaElementSource(element);
        this.mediaElementSourceElement = element;
      } else {
        this.mediaElementSourceNode.disconnect();
      }
      // Connect both to the analyser and destination: measurement sees the file while
      // the user can still hear it. Same-origin bundled audio is read locally.
      this.mediaElementSourceNode.connect(this.analyser);
      this.mediaElementSourceNode.connect(this.audioCtx.destination);
      this.sourceNode = this.mediaElementSourceNode;
      this.inputMode = 'media-element';
      this.micState = 'active';
      this.autoGainControlStatus = null;
      this.errorMessage = '';
      this.previousRms = 0;
      this.lastTransientAt = 0;
      this.transientDetected = false;
      this.transientHoldoff = false;
      this.lastValidResonances = {};
      this.pitchHistory = { fundamental: [], fifth: [], octave: [] };
      Object.values(this.stablePitchTrackers).forEach((tracker) => tracker.reset());
      return true;
    } catch (err: unknown) {
      this.mediaElementSourceNode?.disconnect();
      this.sourceNode?.disconnect();
      this.sourceNode = null;
      this.analyser = null;
      this.inputMode = 'inactive';
      this.micState = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'A hangfájl nem csatlakoztatható az elemzőhöz.';
      return false;
    }
  }

  /** Disconnect the prerecorded input from the shared analyser without asking for a microphone. */
  public stopAudioElementInput(): void {
    if (this.inputMode !== 'media-element') return;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.analyser = null;
    this.inputMode = 'inactive';
    this.micState = 'inactive';
    this.inputLevelDb = -100;
    this.previousRms = 0;
    this.lastTransientAt = 0;
    this.transientDetected = false;
    this.transientHoldoff = false;
    this.stabilityHistory = [];
    this.lastValidResonances = {};
    this.pitchHistory = { fundamental: [], fifth: [], octave: [] };
    Object.values(this.stablePitchTrackers).forEach((tracker) => tracker.reset());
  }

  public stopMicrophone(): void {
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach((track) => track.stop());
      this.microphoneStream = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.micState = 'inactive';
    this.inputMode = 'inactive';
    this.autoGainControlStatus = null;
    this.inputLevelDb = -100;
    this.previousRms = 0;
    this.lastTransientAt = 0;
    this.transientDetected = false;
    this.transientHoldoff = false;
    this.stabilityHistory = [];
    this.lastValidResonances = {};
    this.pitchHistory = { fundamental: [], fifth: [], octave: [] };
    Object.values(this.stablePitchTrackers).forEach((tracker) => tracker.reset());
  }

  public getMicState(): MicState {
    return this.micState;
  }

  public getErrorMessage(): string {
    return this.errorMessage;
  }

  public getSampleRate(): number {
    return this.sampleRate;
  }

  /** Returns the reported state of browser-managed mic AGC, or null if unavailable. */
  public getAutoGainControlStatus(): boolean | null {
    return this.autoGainControlStatus;
  }

  public getCurrentInputDeviceId(): string | null {
    const track = this.microphoneStream?.getAudioTracks()[0];
    if (!track || typeof track.getSettings !== 'function') return null;
    const deviceId = track.getSettings().deviceId;
    return typeof deviceId === 'string' && deviceId ? deviceId : null;
  }

  public didFallbackToDefaultInput(): boolean {
    return this.lastInputDeviceFallback;
  }

  /** Browser feature detection; Safari/iOS currently relies on the system audio route. */
  public supportsOutputDeviceSelection(): boolean {
    const AudioCtxClass = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return false;
    const prototype = AudioCtxClass.prototype as unknown as {
      setSinkId?: (deviceId: string) => Promise<void>;
    };
    return typeof prototype.setSinkId === 'function';
  }

  /** Route the shared analyser and generated reference tones to a selected output device. */
  public async setOutputDevice(deviceId: string): Promise<boolean> {
    if (!this.supportsOutputDeviceSelection()) return false;
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtxClass) return false;
        this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
      }
      const context = this.audioCtx as AudioContext & {
        setSinkId?: (selectedDeviceId: string) => Promise<void>;
      };
      if (typeof context.setSinkId !== 'function') return false;
      await context.setSinkId(deviceId);
      return true;
    } catch (error) {
      console.warn('Nem sikerült a hangkimeneti eszköz váltása:', error);
      return false;
    }
  }

  public getInputLevelDb(): number {
    return this.inputLevelDb;
  }

  public getFloatFrequencyData(): Float32Array {
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(this.freqData as any);
    }
    return this.freqData;
  }


  /**
   * Main multi-resonance analyzer according to functional specification
   */
  /** Detect the most likely struck note from the complete configured scale. Harmonic evidence is
   * combined across f0, 2*f0 and 3*f0; low-confidence/ambiguous frames are rejected. */
  public detectNote(candidates: NoteCandidate[]): { id: string; noteName: string; frequency: number; confidence: number } | null {
    if (!this.analyser || this.micState !== 'active' || candidates.length === 0) return null;
    this.analyser.getFloatFrequencyData(this.freqData as any);
    const peakNear = (targetHz: number, centsWindow = 45): { db: number; hz: number; ambiguous?: boolean } | null => {
      const analysis = analyzeSpectralPeakInWindow(
        targetHz,
        centsWindow,
        this.freqData,
        this.sampleRate,
        -78,
      );
      if (!analysis.peak) return null;
      return {
        db: analysis.peak.magDb,
        hz: analysis.peak.freq,
        ambiguous: analysis.ambiguous,
      };
    };
    return chooseNoteCandidate(candidates, peakNear);
  }

  public analyze(
    targetFundamentalHz = 146.832384,
    targetFifthHz = 440.497152,
    targetOctaveHz = 293.664768,
    noteNames = { fundamental: 'D3', fifth: 'A4', octave: 'D4' }
  ): {
    alap: ResonanceMeasurement;
    kvint: ResonanceMeasurement;
    oktav: ResonanceMeasurement;
    hasSignal: boolean;
    inputLevelDb: number;
    sampleRateKhz: number;
    standardDeviationCents: number;
    transientHoldoff: boolean;
    highInputLevel: boolean;
    clippingLikely: boolean;
    yinFrequencyHz: number | null;
    yinClarity: number;
    yinAgreementCents: number | null;
  } {
    const now = Date.now();

    if (!this.analyser || this.micState !== 'active') {
      return {
        alap: this.createEmptyResonance('fundamental', 'Alap', noteNames.fundamental, targetFundamentalHz),
        kvint: this.createEmptyResonance('fifth', '3. parciális', noteNames.fifth, targetFifthHz),
        oktav: this.createEmptyResonance('octave', 'Oktáv', noteNames.octave, targetOctaveHz),
        hasSignal: false,
        inputLevelDb: -100,
        sampleRateKhz: Math.round(this.sampleRate / 100) / 10,
        standardDeviationCents: 0,
        transientHoldoff: false,
        highInputLevel: false,
        clippingLikely: false,
        yinFrequencyHz: null,
        yinClarity: 0,
        yinAgreementCents: null,
      };
    }

    this.analyser.getFloatFrequencyData(this.freqData as any);
    this.analyser.getFloatTimeDomainData(this.timeData as any);
    // Independent time-domain pitch estimate for diagnostic comparison with the FFT tracker.
    // Use a recent 8192-sample window to keep the work bounded on mobile devices.
    const yinWindow = this.timeData.subarray(Math.max(0, this.timeData.length - 8192));
    const yinEstimate = estimatePitchYin(yinWindow, this.sampleRate, { minHz: 60, maxHz: 1000, downsampleFactor: 4 });

    // Compute RMS input level and dB
    let sumSquares = 0;
    let peakAbsolute = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const sample = this.timeData[i];
      sumSquares += sample * sample;
      peakAbsolute = Math.max(peakAbsolute, Math.abs(sample));
    }
    const rms = Math.sqrt(sumSquares / this.timeData.length);
    const clippingLikely = isNearDigitalClipPeak(peakAbsolute);
    const db = rms > 1e-5 ? Math.max(-100, Math.min(0, 20 * Math.log10(rms))) : -100;
    this.inputLevelDb = Math.round(db);

    // Retain quiet late-decay resonances; individual FFT peak strength and stable tracking
    // still decide whether each channel is reliable. The real D3 reference remains measurable
    // around -71 dBFS RMS, while its final noise-level tail falls below this gate.
    const hasSignal = isUsableSignalLevel(db);
    const highInputLevel = db > -8; // Near-full-scale input can clip or distort transients.

    // Detect attacks with a short-time RMS window that overlaps adjacent analysis
    // frames. At a ~30 Hz UI analysis cadence, 1024 samples (~21 ms at 48 kHz)
    // can leave gaps; 2048 samples (~43 ms) reduces the chance of missing a short strike.
    // After onset, the separate holdoff still waits for the full FFT window plus 50 ms
    // so the spectral measurement is not taken from the strike transient itself.
    const shortWindowSize = Math.min(2048, this.timeData.length);
    let shortSumSquares = 0;
    for (let i = this.timeData.length - shortWindowSize; i < this.timeData.length; i++) {
      shortSumSquares += this.timeData[i] * this.timeData[i];
    }
    const shortRms = Math.sqrt(shortSumSquares / shortWindowSize);
    const transientDetected = hasSignal && detectTransientOnset(this.previousRms, shortRms);
    this.previousRms = shortRms;
    if (transientDetected) {
      this.lastTransientAt = now;
      // A fresh strike invalidates the previous reading immediately. Otherwise a new,
      // different note can appear to measure as the old note during the holdoff window
      // because buildResonanceMeasurement intentionally retains valid readings.
      this.lastValidResonances = {};
      this.stabilityHistory = [];
      this.pitchHistory = { fundamental: [], fifth: [], octave: [] };
      Object.values(this.stablePitchTrackers).forEach((tracker) => tracker.reset());
    }
    const transientHoldoff = isTransientHoldoffActive(
      this.lastTransientAt,
      now,
      this.fftSize,
      this.sampleRate,
      50,
    );
    this.transientDetected = transientDetected;
    this.transientHoldoff = transientHoldoff;

    // Search for the 3 resonances:
    // 1. Alaphang (Fundamental): search within ±150 cents of target
    const fundamentalAnalysis = transientHoldoff ? null : analyzeSpectralPeakInWindow(targetFundamentalHz, 150, this.freqData, this.sampleRate);
    const rawFundamentalPeak = fundamentalAnalysis?.peak ?? null;
    // Refine the fundamental only when the independent periodicity estimate strongly agrees
    // with the FFT peak. The FFT remains the primary reference; YIN cannot pull it to an octave.
    const fundamentalPeakIsTrackable = rawFundamentalPeak !== null &&
      isTrackableResonancePeak(
        fundamentalAnalysis?.ambiguous ?? false,
        resonanceConfidenceFromDb(rawFundamentalPeak.magDb),
      );
    const fPeak = fundamentalPeakIsTrackable && rawFundamentalPeak && yinEstimate.frequencyHz !== null
      ? {
          ...rawFundamentalPeak,
          freq: fuseAgreeingFrequencyEstimates(
            rawFundamentalPeak.freq,
            yinEstimate.frequencyHz,
            yinEstimate.clarity,
          ),
        }
      : rawFundamentalPeak;
    // Search each resonance independently to reduce masking by a dominant fundamental.
    const fifthAnalysis = transientHoldoff ? null : analyzeSpectralPeakInWindow(targetFifthHz, 150, this.freqData, this.sampleRate);
    const octaveAnalysis = transientHoldoff ? null : analyzeSpectralPeakInWindow(targetOctaveHz, 150, this.freqData, this.sampleRate);
    const qPeak = fifthAnalysis?.peak ?? null;
    const oPeak = octaveAnalysis?.peak ?? null;

    // Construct measurements
    const alap = this.buildResonanceMeasurement(
      'fundamental',
      'Alap',
      noteNames.fundamental,
      fPeak,
      targetFundamentalHz,
      now,
      hasSignal,
      fundamentalAnalysis?.ambiguous ?? false
    );

    const kvint = this.buildResonanceMeasurement(
      'fifth',
      '3. parciális',
      noteNames.fifth,
      qPeak,
      targetFifthHz,
      now,
      hasSignal,
      fifthAnalysis?.ambiguous ?? false
    );

    const oktav = this.buildResonanceMeasurement(
      'octave',
      'Oktáv',
      noteNames.octave,
      oPeak,
      targetOctaveHz,
      now,
      hasSignal,
      octaveAnalysis?.ambiguous ?? false
    );

    // Stability history follows the currently displayed resonance. Exclude transient and
    // invalid frames; never synthesize zero-cent samples for missing measurements.
    const stabilityMeasurement = this.stabilityRole === 'fundamental'
      ? alap
      : this.stabilityRole === 'fifth' ? kvint : oktav;
    if (!transientHoldoff && stabilityMeasurement.status === 'valid' && stabilityMeasurement.deviationCents !== null) {
      this.stabilityHistory.push({ timestamp: now, cents: stabilityMeasurement.deviationCents, valid: true });
    }

    const tenSecAgo = now - 10000;
    while (this.stabilityHistory.length > 0 && this.stabilityHistory[0].timestamp < tenSecAgo) {
      this.stabilityHistory.shift();
    }
    const validPoints = this.stabilityHistory.filter((point) => point.valid && Number.isFinite(point.cents));
    let standardDeviationCents = 0;
    if (validPoints.length > 2) {
      const mean = validPoints.reduce((acc, point) => acc + point.cents, 0) / validPoints.length;
      const variance = validPoints.reduce((acc, point) => acc + Math.pow(point.cents - mean, 2), 0) / validPoints.length;
      standardDeviationCents = Math.sqrt(variance);
    }

    return {
      alap,
      kvint,
      oktav,
      hasSignal,
      inputLevelDb: this.inputLevelDb,
      sampleRateKhz: Math.round(this.sampleRate / 100) / 10,
      standardDeviationCents,
      transientHoldoff,
      highInputLevel,
      clippingLikely,
      yinFrequencyHz: yinEstimate.frequencyHz,
      yinClarity: yinEstimate.clarity,
      // Keep the agreement diagnostic independent of the fusion performed for the readout.
      yinAgreementCents: yinEstimate.frequencyHz !== null && rawFundamentalPeak !== null
        ? 1200 * Math.log2(yinEstimate.frequencyHz / rawFundamentalPeak.freq)
        : null,
    };
  }

  public setStabilityRole(role: 'fundamental' | 'fifth' | 'octave'): void {
    if (this.stabilityRole !== role) {
      this.stabilityRole = role;
      this.stabilityHistory = [];
    }
  }

  public resetStabilityHistory(): void {
    this.stabilityHistory = [];
  }

  public getStabilityHistory(): { timestamp: number; cents: number; valid: boolean }[] {
    return this.stabilityHistory.map((point) => ({ ...point }));
  }

  private buildResonanceMeasurement(
    role: 'fundamental' | 'fifth' | 'octave',
    name: string,
    noteName: string,
    peak: { freq: number; magDb: number } | null,
    targetHz: number,
    now: number,
    hasSignal: boolean,
    peakAmbiguous = false
  ): ResonanceMeasurement {
    // Never accept a spectral peak when the time-domain gate says there is no usable signal.
    const rawPeak = hasSignal ? peak : null;
    const confidence = rawPeak ? resonanceConfidenceFromDb(rawPeak.magDb) : 0;
    const trackable = rawPeak !== null && isTrackableResonancePeak(peakAmbiguous, confidence);
    let currentPeak = rawPeak;

    if (trackable && rawPeak) {
      const smoothed = smoothPitchSample(this.pitchHistory[role], rawPeak.freq, now);
      this.pitchHistory[role] = smoothed.history;
      currentPeak = { ...rawPeak, freq: smoothed.frequencyHz };
    } else {
      // A weak, ambiguous, or missing peak must not enter the median history or
      // complete a stability run. Keep a visible raw reading where available.
      this.pitchHistory[role] = [];
      this.stablePitchTrackers[role].reset();
    }

    const stability = trackable && rawPeak
      ? this.stablePitchTrackers[role].observe({ frequencyHz: rawPeak.freq, confidence, timestampMs: now })
      : { stable: false, frequencyHz: null, count: 0 };
    const finalized = finalizePeakReading(
      currentPeak,
      stability.stable ? stability.frequencyHz : null,
      targetHz,
    );
    currentPeak = finalized.peak;
    const cents = finalized.deviationCents;
    // Handpan resonances can decay at different rates. Keep the last valid reading
    // visible for 8 s after the live peak disappears, explicitly marked as held rather
    // than live. This gives the player time to read the value after a strike while
    // preserving a clear distinction between a live measurement and a retained result.
    const status = currentPeak && hasSignal
      ? trackable && stability.stable && isReliableResonanceConfidence(confidence) && cents !== null && Number.isFinite(cents) ? 'valid' : 'uncertain'
      : 'no-signal';
    if (status === 'valid' && currentPeak && cents !== null) {
      this.lastValidResonances[role] = {
        hz: currentPeak.freq,
        targetHz,
        cents,
        amplitudeDb: currentPeak.magDb,
        confidence,
        timestampMs: now,
      };
    }
    const cached = this.lastValidResonances[role];
    // A held reading is only reusable for the exact same target. When AUTO changes
    // notes, never show the previous note's frequency/cents against the new target.
    const sameTarget = cached !== undefined && isSameMeasurementTarget(cached.targetHz, targetHz);
    const cachedIsFresh = sameTarget && cached !== undefined && now - cached.timestampMs <= 8000;

    return {
      role,
      name,
      noteName,
      measuredHz: currentPeak ? currentPeak.freq : cachedIsFresh ? cached!.hz : null,
      targetHz,
      deviationCents: cents !== null ? cents : cachedIsFresh ? cached!.cents : null,
      amplitudeDb: currentPeak ? currentPeak.magDb : cachedIsFresh ? cached!.amplitudeDb : null,
      confidence: currentPeak ? confidence : cachedIsFresh ? cached!.confidence : 0,
      peakAmbiguous: Boolean(currentPeak && peakAmbiguous),
      timestampMs: currentPeak ? now : cachedIsFresh ? cached!.timestampMs : now,
      status: !currentPeak && cachedIsFresh ? 'held' : status,
    };
  }

  private createEmptyResonance(
    role: 'fundamental' | 'fifth' | 'octave',
    name: string,
    noteName: string,
    targetHz: number
  ): ResonanceMeasurement {
    return {
      role,
      name,
      noteName,
      measuredHz: null,
      targetHz,
      deviationCents: null,
      amplitudeDb: null,
      confidence: 0,
      peakAmbiguous: false,
      timestampMs: Date.now(),
      status: 'no-signal',
    };
  }

  // Reference tone generator. When no microphone/file source is active, feed the
  // generated sine into the shared analyser as well as the speaker so every view uses
  // the same live measurement state. Strike cues during microphone measurement remain
  // output-only and never contaminate the microphone input.
  public playTone(freqHz: number): void {
    if (!Number.isFinite(freqHz) || freqHz <= 0) return;
    this.stopTone();
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    const now = this.audioCtx.currentTime;
    const useToneAsAnalysisInput = this.inputMode === 'inactive';

    if (useToneAsAnalysisInput) {
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.05;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = 0;
      this.toneSilenceGain = this.audioCtx.createGain();
      this.toneSilenceGain.gain.setValueAtTime(0, now);
      this.analyser.connect(this.toneSilenceGain);
      this.toneSilenceGain.connect(this.audioCtx.destination);
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.freqData = new Float32Array(this.analyser.frequencyBinCount);
      this.sampleRate = this.audioCtx.sampleRate;
      this.inputMode = 'tone';
      this.micState = 'active';
      this.autoGainControlStatus = null;
      this.errorMessage = '';
      this.previousRms = 0;
      this.lastTransientAt = 0;
      this.transientDetected = false;
      this.transientHoldoff = false;
      this.lastValidResonances = {};
      this.pitchHistory = { fundamental: [], fifth: [], octave: [] };
      Object.values(this.stablePitchTrackers).forEach((tracker) => tracker.reset());
    }

    this.toneGain = this.audioCtx.createGain();
    this.toneGain.gain.setValueAtTime(0.001, now);
    this.toneGain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
    this.toneGain.connect(this.audioCtx.destination);
    if (this.inputMode === 'tone' && this.analyser) {
      this.toneGain.connect(this.analyser);
    }

    this.toneOsc = this.audioCtx.createOscillator();
    this.toneOsc.type = 'sine';
    this.toneOsc.frequency.setValueAtTime(freqHz, now);
    this.toneOsc.connect(this.toneGain);
    this.toneOsc.start(now);
  }

  public stopTone(): void {
    const oscillator = this.toneOsc;
    const gain = this.toneGain;
    const context = this.audioCtx;
    // Clear current references immediately so a delayed cleanup cannot stop a newer tone.
    this.toneOsc = null;
    this.toneGain = null;
    if (!gain || !context) {
      try { oscillator?.stop(); } catch { /* oscillator may already be stopped */ }
      oscillator?.disconnect();
      gain?.disconnect();
      return;
    }
    const now = context.currentTime;
    const toneWasAnalysisInput = this.inputMode === 'tone';
    if (toneWasAnalysisInput) {
      // Stop the common analysis loop from reading a stale tone frame immediately.
      this.analyser = null;
      this.toneSilenceGain?.disconnect();
      this.toneSilenceGain = null;
      this.inputMode = 'inactive';
      this.micState = 'inactive';
      this.inputLevelDb = -100;
      this.previousRms = 0;
      this.lastTransientAt = 0;
      this.transientDetected = false;
      this.transientHoldoff = false;
      this.stabilityHistory = [];
      this.lastValidResonances = {};
      this.pitchHistory = { fundamental: [], fifth: [], octave: [] };
      Object.values(this.stablePitchTrackers).forEach((tracker) => tracker.reset());
    }
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.012);
    } catch {
      // Context may have been closed while stopping.
    }
    window.setTimeout(() => {
      try { oscillator?.stop(); } catch { /* oscillator may already be stopped */ }
      oscillator?.disconnect();
      gain.disconnect();
    }, 80);
  }
}

export const bbAudioEngine = new BBAudioEngine();
