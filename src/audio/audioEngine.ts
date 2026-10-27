/**
 * BB Tuner Audio Acoustic Engine
 * Real-time microphone input, FFT analysis, multi-resonance tracking (Alaphang, Kvint, Oktáv),
 * parabolic peak interpolation, input dB calculation, and stability tracking.
 */

import { ResonanceMeasurement, MicState } from '../types/tuner';

export class BBAudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private micState: MicState = 'inactive';
  private errorMessage = '';

  // Audio configuration
  private fftSize = 32768; // Longer analysis window for finer low-frequency resolution
  private timeData: Float32Array = new Float32Array(32768);
  private freqData: Float32Array = new Float32Array(4096);

  // Metering & input level
  private inputLevelDb = -100;
  private sampleRate = 48000;
  private previousRms = 0;
  private lastTransientAt = 0;
  private transientPeakRms = 0;
  private transientDetected = false;

  // Pitch stability history (rolling 10 seconds)
  private stabilityHistory: { timestamp: number; cents: number; valid: boolean }[] = [];
  private stabilityRole: 'fundamental' | 'fifth' | 'octave' = 'fundamental';

  // Tone generator for audio reference
  private toneOsc: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;

  public async startMicrophone(): Promise<boolean> {
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.sampleRate = this.audioCtx.sampleRate;

      // Request raw, unadulterated microphone audio without telecom filtering
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.15; // Avoid excessive temporal smearing in tuner measurements
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;

      this.timeData = new Float32Array(this.analyser.fftSize);
      this.freqData = new Float32Array(this.analyser.frequencyBinCount);

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.microphoneStream);
      this.sourceNode.connect(this.analyser);

      this.micState = 'active';
      this.errorMessage = '';
      return true;
    } catch (err: unknown) {
      console.error('Microphone error:', err);
      this.microphoneStream?.getTracks().forEach((track) => track.stop());
      this.microphoneStream = null;
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
    this.inputLevelDb = -100;
    this.previousRms = 0;
    this.lastTransientAt = 0;
    this.transientPeakRms = 0;
    this.transientDetected = false;
    this.stabilityHistory = [];
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
   * Refined parabolic peak interpolation for sub-bin frequency accuracy
   */
  private interpolatePeak(bin: number, spectrum: Float32Array): { freq: number; magDb: number } {
    const binCount = spectrum.length;
    const binWidth = this.sampleRate / (binCount * 2);

    if (bin <= 0 || bin >= binCount - 1) {
      return { freq: bin * binWidth, magDb: spectrum[bin] ?? -100 };
    }

    const alpha = spectrum[bin - 1];
    const beta = spectrum[bin];
    const gamma = spectrum[bin + 1];

    const denom = alpha - 2 * beta + gamma;
    let delta = 0;
    if (Math.abs(denom) > 1e-6) {
      delta = 0.5 * ((alpha - gamma) / denom);
    }
    delta = Math.max(-0.5, Math.min(0.5, delta));

    const peakBin = bin + delta;
    const freq = peakBin * binWidth;
    const magDb = beta - 0.25 * (alpha - gamma) * delta;

    return { freq, magDb };
  }

  /**
   * Find peak in a targeted window around expected frequency
   */
  private findPeakInWindow(
    targetFreq: number,
    windowCents: number,
    spectrum: Float32Array
  ): { freq: number; magDb: number; bin: number } | null {
    const minFreq = targetFreq * Math.pow(2, -windowCents / 1200);
    const maxFreq = targetFreq * Math.pow(2, windowCents / 1200);

    const binCount = spectrum.length;
    const binWidth = this.sampleRate / (binCount * 2);

    const minBin = Math.max(1, Math.floor(minFreq / binWidth));
    const maxBin = Math.min(binCount - 2, Math.ceil(maxFreq / binWidth));

    if (minBin >= maxBin) return null;

    let maxVal = -Infinity;
    let bestBin = -1;

    for (let i = minBin; i <= maxBin; i++) {
      if (spectrum[i] > maxVal && spectrum[i] > spectrum[i - 1] && spectrum[i] > spectrum[i + 1]) {
        maxVal = spectrum[i];
        bestBin = i;
      }
    }

    // Noise floor check
    if (bestBin === -1 || maxVal < -82) {
      return null;
    }

    const { freq, magDb } = this.interpolatePeak(bestBin, spectrum);
    return { freq, magDb, bin: bestBin };
  }

  /**
   * Main multi-resonance analyzer according to functional specification
   */
  /** Detect the most likely struck note from the complete configured scale. Harmonic evidence is
   * combined across f0, 2*f0 and 3*f0; low-confidence/ambiguous frames are rejected. */
  public detectNote(candidates: { id: string; noteName: string; frequency: number }[]): { id: string; noteName: string; frequency: number; confidence: number } | null {
    if (!this.analyser || this.micState !== 'active' || candidates.length === 0) return null;
    this.analyser.getFloatFrequencyData(this.freqData as any);
    const binWidth = this.sampleRate / (this.freqData.length * 2);
    const peakNear = (targetHz: number, centsWindow = 45): { db: number; hz: number } | null => {
      const minHz = targetHz * Math.pow(2, -centsWindow / 1200);
      const maxHz = targetHz * Math.pow(2, centsWindow / 1200);
      const lo = Math.max(1, Math.floor(minHz / binWidth));
      const hi = Math.min(this.freqData.length - 2, Math.ceil(maxHz / binWidth));
      let best = -1;
      for (let i = lo; i <= hi; i++) {
        if (this.freqData[i] > this.freqData[i - 1] && this.freqData[i] >= this.freqData[i + 1] && (best < 0 || this.freqData[i] > this.freqData[best])) best = i;
      }
      if (best < 0 || this.freqData[best] < -78) return null;
      return { db: this.freqData[best], hz: this.interpolatePeak(best, this.freqData).freq };
    };
    const ranked = candidates.map((candidate) => {
      const fundamental = peakNear(candidate.frequency, 65);
      const octave = peakNear(candidate.frequency * 2, 55);
      const third = peakNear(candidate.frequency * 3, 55);
      // A weak/missing fundamental is common in struck metal. Allow partials to contribute,
      // but penalize missing evidence so a loud upper note is not automatically called its subharmonic.
      const baseDb = fundamental?.db ?? -96;
      const octaveEvidence = octave ? Math.max(-24, octave.db - baseDb) * 0.22 : -5;
      const thirdEvidence = third ? Math.max(-24, third.db - baseDb) * 0.18 : -5;
      const fundamentalEvidence = fundamental ? fundamental.db : -13;
      const score = fundamentalEvidence + octaveEvidence + thirdEvidence;
      const confidence = Math.max(0, Math.min(1,
        (fundamental ? (fundamental.db + 90) / 45 : 0) +
        (octave ? 0.12 : 0) + (third ? 0.12 : 0)
      ));
      return { ...candidate, score, confidence, hasFundamental: Boolean(fundamental), partialCount: Number(Boolean(octave)) + Number(Boolean(third)) };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best || best.confidence < 0.18) return null;
    // Without a detected fundamental, require both partials and a larger margin.
    if (!best.hasFundamental && best.partialCount < 2) return null;
    const margin = best.hasFundamental ? 2.5 : 5;
    if (runnerUp && best.score - runnerUp.score < margin) return null;
    return { id: best.id, noteName: best.noteName, frequency: best.frequency, confidence: best.confidence };
  }

  public analyze(
    targetFundamentalHz = 146.50,
    targetFifthHz = 220.00,
    targetOctaveHz = 293.66,
    noteNames = { fundamental: 'D3', fifth: 'A3', octave: 'D4' }
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
  } {
    const now = Date.now();

    if (!this.analyser || this.micState !== 'active') {
      return {
        alap: this.createEmptyResonance('fundamental', 'Alap', noteNames.fundamental, targetFundamentalHz),
        kvint: this.createEmptyResonance('fifth', 'Kvint', noteNames.fifth, targetFifthHz),
        oktav: this.createEmptyResonance('octave', 'Oktáv', noteNames.octave, targetOctaveHz),
        hasSignal: false,
        inputLevelDb: -100,
        sampleRateKhz: Math.round(this.sampleRate / 1000),
        standardDeviationCents: 0,
        transientHoldoff: false,
        highInputLevel: false,
      };
    }

    this.analyser.getFloatFrequencyData(this.freqData as any);
    this.analyser.getFloatTimeDomainData(this.timeData as any);

    // Compute RMS input level and dB
    let sumSquares = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      sumSquares += this.timeData[i] * this.timeData[i];
    }
    const rms = Math.sqrt(sumSquares / this.timeData.length);
    const db = rms > 1e-5 ? Math.max(-100, Math.min(0, 20 * Math.log10(rms))) : -100;
    this.inputLevelDb = Math.round(db);

    const hasSignal = db > -58; // RMS gate for audio presence
    const highInputLevel = db > -8; // Near-full-scale input can clip or distort transients.

    // Detect a sharp attack from the RMS envelope. The FFT frame overlaps the attack,
    // but waiting the full 683 ms window made the tuner unnecessarily sluggish. Hold
    // measurements briefly, then release once the envelope has fallen, with a hard cap.
    const transientDetected = hasSignal && rms > 0.003 &&
      (this.previousRms < 0.001 || rms > this.previousRms * 2.5);
    if (transientDetected) {
      this.lastTransientAt = now;
      this.transientPeakRms = rms;
    }
    this.previousRms = rms;
    const transientElapsed = this.lastTransientAt > 0 ? now - this.lastTransientAt : Infinity;
    const transientDecayed = this.transientPeakRms > 0 && rms <= this.transientPeakRms * 0.55;
    const transientHoldoff = transientElapsed < 450 &&
      (transientElapsed < 180 || !transientDecayed);
    if (!transientHoldoff) this.transientPeakRms = 0;
    this.transientDetected = transientDetected;

    // Search for the 3 resonances:
    // 1. Alaphang (Fundamental): search within ±150 cents of target
    const fPeak = transientHoldoff ? null : this.findPeakInWindow(targetFundamentalHz, 240, this.freqData);
    // Search each resonance independently to reduce masking by a dominant fundamental.
    const qPeak = transientHoldoff ? null : this.findPeakInWindow(targetFifthHz, 240, this.freqData);
    const oPeak = transientHoldoff ? null : this.findPeakInWindow(targetOctaveHz, 240, this.freqData);

    // Construct measurements
    const alap = this.buildResonanceMeasurement(
      'fundamental',
      'Alap',
      noteNames.fundamental,
      fPeak,
      targetFundamentalHz,
      now,
      hasSignal
    );

    const kvint = this.buildResonanceMeasurement(
      'fifth',
      'Kvint',
      noteNames.fifth,
      qPeak,
      targetFifthHz,
      now,
      hasSignal
    );

    const oktav = this.buildResonanceMeasurement(
      'octave',
      'Oktáv',
      noteNames.octave,
      oPeak,
      targetOctaveHz,
      now,
      hasSignal
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
      sampleRateKhz: Math.round(this.sampleRate / 1000),
      standardDeviationCents,
      transientHoldoff,
      highInputLevel,
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
    return this.stabilityHistory;
  }

  private buildResonanceMeasurement(
    role: 'fundamental' | 'fifth' | 'octave',
    name: string,
    noteName: string,
    peak: { freq: number; magDb: number } | null,
    targetHz: number,
    now: number,
    hasSignal: boolean
  ): ResonanceMeasurement {
    if (!hasSignal || !peak) {
      return {
        role,
        name,
        noteName,
        measuredHz: peak ? peak.freq : null,
        targetHz,
        deviationCents: null,
        amplitudeDb: peak ? peak.magDb : null,
        confidence: 0,
        timestampMs: now,
        status: hasSignal ? 'uncertain' : 'no-signal',
      };
    }

    const cents = 1200 * Math.log2(peak.freq / targetHz);
    const confidence = Math.max(0, Math.min(1, (peak.magDb + 100) / 65));
    // Measurement validity is independent of tuning quality: an out-of-tune peak must
    // remain measurable so the strobe can show the direction and magnitude of error.
    const status = confidence > 0.25 && Number.isFinite(cents) ? 'valid' : 'uncertain';

    return {
      role,
      name,
      noteName,
      measuredHz: peak.freq,
      targetHz,
      deviationCents: cents,
      amplitudeDb: peak.magDb,
      confidence,
      timestampMs: now,
      status,
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
      timestampMs: Date.now(),
      status: 'no-signal',
    };
  }

  // Reference tone generator
  public playTone(freqHz: number): void {
    this.stopTone();
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    const now = this.audioCtx.currentTime;
    this.toneGain = this.audioCtx.createGain();
    this.toneGain.gain.setValueAtTime(0.001, now);
    this.toneGain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
    this.toneGain.connect(this.audioCtx.destination);

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
