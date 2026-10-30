import { analyzeWavWindow, type WavFrameAnalysis } from './wavAnalysis';
import type { IdentifiabilityReason, IdentifiabilityStatus } from './fundamentalIdentifiability';

export type ReferenceSignalMultiplier = 1 | 2 | 3;

export interface ReferenceSignalScenario {
  id: string;
  name: string;
  targetHz: number;
  /** Optional true source root. Set below targetHz to exercise octave/partial misidentification. */
  synthesizedRootHz?: number;
  detuneCents: number;
  octaveOffsetCents: number;
  thirdPartialOffsetCents: number;
  fundamentalAmplitude: number;
  octaveAmplitude: number;
  thirdPartialAmplitude: number;
  noiseAmplitude: number;
  noiseSeed: number;
  /** Optional hard clipping level. null means unclipped. */
  clipLevel: number | null;
}

export interface ReferenceSignalBenchmarkPartial {
  multiplier: ReferenceSignalMultiplier;
  expectedHz: number;
  measuredHz: number | null;
  /** Measured deviation from the nominal harmonic target, as shown by Hangoal. */
  measuredCentsFromTarget: number | null;
  /** Residual error against the exact frequency used to synthesize this partial. */
  residualErrorCents: number | null;
  peakDb: number | null;
  prominenceDb: number | null;
}

export type ReferenceSignalBenchmarkIdentifiability = IdentifiabilityStatus | 'not-analysed';

export interface ReferenceSignalBenchmarkResult {
  scenarioId: string;
  name: string;
  targetHz: number;
  /** Actual fundamental in the generated signal, independent of the analyser's selected target. */
  expectedFundamentalHz: number;
  /** Difference between the analyser's nominal target and the true synthesized root. */
  candidateRootDifferenceCents: number;
  candidateRootRatio: number;
  analysisAvailable: boolean;
  rmsDb: number | null;
  identifiabilityStatus: ReferenceSignalBenchmarkIdentifiability;
  identifiabilityReasons: IdentifiabilityReason[];
  partials: ReferenceSignalBenchmarkPartial[];
}

export interface ReferenceSignalBenchmarkSummary {
  scenarioCount: number;
  analysedScenarioCount: number;
  identifiedCount: number;
  ambiguousCount: number;
  unidentifiedCount: number;
  missingFundamentalCount: number;
  candidateRootMismatchCount: number;
  suspectedOctaveErrorCount: number;
  measuredPartialCount: number;
  missingPartialCount: number;
  meanAbsoluteResidualErrorCents: number | null;
  worstAbsoluteResidualErrorCents: number | null;
}

export const REFERENCE_SIGNAL_SAMPLE_RATE = 44100;
export const REFERENCE_SIGNAL_FFT_SIZE = 16384;

/**
 * Deterministic synthetic cases cover clean pitch, signed detuning, inharmonic
 * partials, weak roots, background noise, low level and silence. These are
 * software regression signals, not acoustic recordings or a physical reference.
 */
export const DEFAULT_REFERENCE_SIGNAL_SCENARIOS: readonly ReferenceSignalScenario[] = [
  {
    id: 'd3-clean',
    name: 'D3 · tiszta alaphang és harmonikus felhangok',
    targetHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.5,
    octaveAmplitude: 0.25,
    thirdPartialAmplitude: 0.15,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'd3-minus-5-cent',
    name: 'D3 · −5 cent',
    targetHz: 146.832384,
    detuneCents: -5,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.5,
    octaveAmplitude: 0.25,
    thirdPartialAmplitude: 0.15,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'd3-plus-5-cent',
    name: 'D3 · +5 cent',
    targetHz: 146.832384,
    detuneCents: 5,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.5,
    octaveAmplitude: 0.25,
    thirdPartialAmplitude: 0.15,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'd3-plus-25-cent',
    name: 'D3 · +25 cent',
    targetHz: 146.832384,
    detuneCents: 25,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.5,
    octaveAmplitude: 0.25,
    thirdPartialAmplitude: 0.15,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'a3-minus-10-cent',
    name: 'A3 · −10 cent',
    targetHz: 220,
    detuneCents: -10,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.45,
    octaveAmplitude: 0.22,
    thirdPartialAmplitude: 0.12,
    noiseAmplitude: 0,
    noiseSeed: 0x87654321,
    clipLevel: null,
  },
  {
    id: 'd4-plus-1-cent',
    name: 'D4 · +1 cent',
    targetHz: 293.664768,
    detuneCents: 1,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.45,
    octaveAmplitude: 0.22,
    thirdPartialAmplitude: 0.12,
    noiseAmplitude: 0,
    noiseSeed: 0xabcdef12,
    clipLevel: null,
  },
  {
    id: 'octave-error-candidate',
    name: 'D3 jel · a mérő célja tévesen D4 (oktávhiba)',
    targetHz: 293.664768,
    synthesizedRootHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.5,
    octaveAmplitude: 0.25,
    thirdPartialAmplitude: 0.15,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'third-partial-inharmonic',
    name: 'D3 · 3. parciális +7 cent inharmonicitás',
    targetHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 7,
    fundamentalAmplitude: 0.5,
    octaveAmplitude: 0.25,
    thirdPartialAmplitude: 0.15,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'octave-and-third-inharmonic',
    name: 'D3 · 2. részfelhang −3 / 3. részfelhang +8 cent',
    targetHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: -3,
    thirdPartialOffsetCents: 8,
    fundamentalAmplitude: 0.5,
    octaveAmplitude: 0.25,
    thirdPartialAmplitude: 0.15,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'weak-fundamental',
    name: 'D3 · gyenge alaphang, erős 2×/3×',
    targetHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.025,
    octaveAmplitude: 0.45,
    thirdPartialAmplitude: 0.3,
    noiseAmplitude: 0.001,
    noiseSeed: 0x31415926,
    clipLevel: null,
  },
  {
    id: 'deterministic-noise',
    name: 'D3 · determinisztikus háttérzaj',
    targetHz: 146.832384,
    detuneCents: 2,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.45,
    octaveAmplitude: 0.22,
    thirdPartialAmplitude: 0.12,
    noiseAmplitude: 0.002,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'low-level',
    name: 'D3 · alacsony jelszint',
    targetHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.00002,
    octaveAmplitude: 0.00001,
    thirdPartialAmplitude: 0.000006,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
  {
    id: 'clipped',
    name: 'D3 · szándékosan túlvezérelt jel',
    targetHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0.9,
    octaveAmplitude: 0.5,
    thirdPartialAmplitude: 0.25,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: 0.65,
  },
  {
    id: 'silence',
    name: 'Csend · hamis csúcs ellenőrzése',
    targetHz: 146.832384,
    detuneCents: 0,
    octaveOffsetCents: 0,
    thirdPartialOffsetCents: 0,
    fundamentalAmplitude: 0,
    octaveAmplitude: 0,
    thirdPartialAmplitude: 0,
    noiseAmplitude: 0,
    noiseSeed: 0x12345678,
    clipLevel: null,
  },
];

function validScenario(scenario: ReferenceSignalScenario): boolean {
  return Boolean(
    scenario.id.trim() &&
    scenario.name.trim() &&
    Number.isFinite(scenario.targetHz) && scenario.targetHz >= 20 && scenario.targetHz <= 2000 &&
    (scenario.synthesizedRootHz === undefined || (Number.isFinite(scenario.synthesizedRootHz) && scenario.synthesizedRootHz >= 20 && scenario.synthesizedRootHz <= 2000)) &&
    Number.isFinite(scenario.detuneCents) && Math.abs(scenario.detuneCents) <= 1200 &&
    Number.isFinite(scenario.octaveOffsetCents) && Math.abs(scenario.octaveOffsetCents) <= 1200 &&
    Number.isFinite(scenario.thirdPartialOffsetCents) && Math.abs(scenario.thirdPartialOffsetCents) <= 1200 &&
    [scenario.fundamentalAmplitude, scenario.octaveAmplitude, scenario.thirdPartialAmplitude, scenario.noiseAmplitude]
      .every((value) => Number.isFinite(value) && value >= 0 && value <= 1) &&
    Number.isInteger(scenario.noiseSeed) &&
    (scenario.clipLevel === null || (Number.isFinite(scenario.clipLevel) && scenario.clipLevel > 0 && scenario.clipLevel <= 1)),
  );
}

/** Generate a deterministic mono reference signal from exact known frequencies. */
export function generateReferenceSignal(
  scenario: ReferenceSignalScenario,
  sampleRate = REFERENCE_SIGNAL_SAMPLE_RATE,
  sampleCount = REFERENCE_SIGNAL_FFT_SIZE,
): Float32Array | null {
  if (!validScenario(scenario) ||
      !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isInteger(sampleCount) || sampleCount < 1024 ||
      Math.max(scenario.targetHz, scenario.synthesizedRootHz ?? scenario.targetHz) * 3 *
        Math.pow(2, (scenario.detuneCents + Math.max(Math.abs(scenario.octaveOffsetCents), Math.abs(scenario.thirdPartialOffsetCents))) / 1200) >= sampleRate / 2) {
    return null;
  }

  const fundamentalHz = (scenario.synthesizedRootHz ?? scenario.targetHz) * Math.pow(2, scenario.detuneCents / 1200);
  const octaveHz = scenario.targetHz * 2 * Math.pow(2, (scenario.detuneCents + scenario.octaveOffsetCents) / 1200);
  const thirdPartialHz = scenario.targetHz * 3 * Math.pow(2, (scenario.detuneCents + scenario.thirdPartialOffsetCents) / 1200);
  if (![fundamentalHz, octaveHz, thirdPartialHz].every((frequency) => Number.isFinite(frequency) && frequency > 0 && frequency < sampleRate / 2)) {
    return null;
  }

  const samples = new Float32Array(sampleCount);
  let seed = scenario.noiseSeed >>> 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    let sample =
      scenario.fundamentalAmplitude * Math.sin(2 * Math.PI * fundamentalHz * time) +
      scenario.octaveAmplitude * Math.sin(2 * Math.PI * octaveHz * time) +
      scenario.thirdPartialAmplitude * Math.sin(2 * Math.PI * thirdPartialHz * time);
    if (scenario.noiseAmplitude > 0) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      sample += ((seed / 0x100000000) * 2 - 1) * scenario.noiseAmplitude;
    }
    if (scenario.clipLevel !== null) sample = Math.max(-scenario.clipLevel, Math.min(scenario.clipLevel, sample));
    samples[index] = sample;
  }
  return samples;
}

function missingPartial(multiplier: ReferenceSignalMultiplier, expectedHz: number): ReferenceSignalBenchmarkPartial {
  return {
    multiplier,
    expectedHz,
    measuredHz: null,
    measuredCentsFromTarget: null,
    residualErrorCents: null,
    peakDb: null,
    prominenceDb: null,
  };
}

function toResult(
  scenario: ReferenceSignalScenario,
  frame: WavFrameAnalysis | null,
): ReferenceSignalBenchmarkResult {
  const expectedFundamentalHz = (scenario.synthesizedRootHz ?? scenario.targetHz) * Math.pow(2, scenario.detuneCents / 1200);
  const candidateTargetHz = scenario.targetHz * Math.pow(2, scenario.detuneCents / 1200);
  const expectedFrequencies: [number, number, number] = [
    candidateTargetHz,
    candidateTargetHz * 2 * Math.pow(2, scenario.octaveOffsetCents / 1200),
    candidateTargetHz * 3 * Math.pow(2, scenario.thirdPartialOffsetCents / 1200),
  ];
  const candidateRootRatio = candidateTargetHz / expectedFundamentalHz;
  const candidateRootDifferenceCents = 1200 * Math.log2(candidateRootRatio);

  const partials = ([1, 2, 3] as ReferenceSignalMultiplier[]).map((multiplier, index) => {
    const resonance = frame?.resonances[index];
    const measuredHz = resonance?.measuredHz ?? null;
    const expectedHz = expectedFrequencies[index];
    return measuredHz === null
      ? missingPartial(multiplier, expectedHz)
      : {
          multiplier,
          expectedHz,
          measuredHz,
          measuredCentsFromTarget: resonance?.cents ?? null,
          residualErrorCents: 1200 * Math.log2(measuredHz / expectedHz),
          peakDb: resonance?.peakDb ?? null,
          prominenceDb: resonance?.prominenceDb ?? null,
        };
  });

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    targetHz: scenario.targetHz,
    expectedFundamentalHz,
    candidateRootDifferenceCents,
    candidateRootRatio,
    analysisAvailable: frame !== null,
    rmsDb: frame?.rmsDb ?? null,
    identifiabilityStatus: frame?.identifiability?.status ?? 'not-analysed',
    identifiabilityReasons: frame?.identifiability?.reasons ?? [],
    partials,
  };
}

/** Run the complete deterministic signal suite through the actual WAV analyser. */
export function runReferenceSignalBenchmark(
  scenarios: readonly ReferenceSignalScenario[] = DEFAULT_REFERENCE_SIGNAL_SCENARIOS,
  sampleRate = REFERENCE_SIGNAL_SAMPLE_RATE,
  fftSize = REFERENCE_SIGNAL_FFT_SIZE,
): ReferenceSignalBenchmarkResult[] {
  if (!Number.isInteger(fftSize) || fftSize < 1024 || (fftSize & (fftSize - 1)) !== 0) return [];
  const results: ReferenceSignalBenchmarkResult[] = [];
  for (const scenario of scenarios) {
    if (!validScenario(scenario)) continue;
    const samples = generateReferenceSignal(scenario, sampleRate, fftSize);
    const frame = samples
      ? analyzeWavWindow(samples, sampleRate, {
          fftSize,
          targetHz: scenario.targetHz,
          peakFloorDb: -82,
        })
      : null;
    results.push(toResult(scenario, frame));
  }
  return results;
}

export function summarizeReferenceSignalBenchmark(
  results: readonly ReferenceSignalBenchmarkResult[],
): ReferenceSignalBenchmarkSummary {
  const residualErrors = results.flatMap((scenario) =>
    scenario.partials.flatMap((partial) =>
      partial.residualErrorCents !== null && Number.isFinite(partial.residualErrorCents)
        ? [Math.abs(partial.residualErrorCents)]
        : [],
    ),
  );
  const statuses = results.map((result) => result.identifiabilityStatus);
  return {
    scenarioCount: results.length,
    analysedScenarioCount: results.filter((result) => result.analysisAvailable).length,
    identifiedCount: statuses.filter((status) => status === 'identified').length,
    ambiguousCount: statuses.filter((status) => status === 'ambiguous').length,
    unidentifiedCount: statuses.filter((status) => status === 'unidentified').length,
    missingFundamentalCount: results.filter((result) => result.partials[0]?.measuredHz === null).length,
    candidateRootMismatchCount: results.filter((result) => Math.abs(result.candidateRootDifferenceCents) >= 50).length,
    suspectedOctaveErrorCount: results.filter((result) => Math.abs(Math.abs(result.candidateRootDifferenceCents) - 1200) <= 25).length,
    measuredPartialCount: results.reduce((count, result) => count + result.partials.filter((partial) => partial.measuredHz !== null).length, 0),
    missingPartialCount: results.reduce((count, result) => count + result.partials.filter((partial) => partial.measuredHz === null).length, 0),
    meanAbsoluteResidualErrorCents: residualErrors.length
      ? residualErrors.reduce((sum, error) => sum + error, 0) / residualErrors.length
      : null,
    worstAbsoluteResidualErrorCents: residualErrors.length ? Math.max(...residualErrors) : null,
  };
}
