import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REFERENCE_SIGNAL_SCENARIOS,
  generateReferenceSignal,
  REFERENCE_SIGNAL_ANALYSIS_PROFILES,
  REFERENCE_SIGNAL_FFT_SIZE,
  REFERENCE_SIGNAL_SAMPLE_RATE,
  runReferenceSignalBenchmark,
  runReferenceSignalProfileBenchmark,
  summarizeReferenceSignalBenchmark,
} from './referenceSignalBenchmark';

describe('deterministic reference signal benchmark', () => {
  it('contains a useful spread of nominal, detuned, inharmonic and adverse scenarios', () => {
    const ids = new Set(DEFAULT_REFERENCE_SIGNAL_SCENARIOS.map((scenario) => scenario.id));
    assert.ok(ids.has('d3-clean'));
    assert.ok(ids.has('d3-minus-5-cent'));
    assert.ok(ids.has('d3-plus-25-cent'));
    assert.ok(ids.has('third-partial-inharmonic'));
    assert.ok(ids.has('octave-error-candidate'));
    assert.ok(ids.has('weak-fundamental'));
    assert.ok(ids.has('deterministic-noise'));
    assert.ok(ids.has('low-level'));
    assert.ok(ids.has('silence'));
    assert.ok(ids.has('clipped'));
    assert.ok(ids.has('mains-hum-50hz'));
    assert.ok(ids.has('mains-hum-60hz'));
    assert.ok(ids.has('close-double-peak'));
    assert.ok(ids.has('transient-decay'));
  });

  it('generates exactly reproducible synthetic samples from the same scenario and seed', () => {
    const scenario = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.find((item) => item.id === 'deterministic-noise');
    assert.ok(scenario);
    const first = generateReferenceSignal(scenario);
    const second = generateReferenceSignal(scenario);
    assert.ok(first && second);
    assert.equal(first.length, REFERENCE_SIGNAL_FFT_SIZE);
    assert.deepEqual(Array.from(first), Array.from(second));
  });

  it('rejects malformed signal scenarios and impossible sample rates', () => {
    const scenario = DEFAULT_REFERENCE_SIGNAL_SCENARIOS[0];
    assert.equal(generateReferenceSignal({ ...scenario, targetHz: Number.NaN }), null);
    assert.equal(generateReferenceSignal(scenario, 0), null);
    assert.equal(generateReferenceSignal(scenario, REFERENCE_SIGNAL_SAMPLE_RATE, 100), null);
  });

  it('measures clean and detuned 1x/2x/3x partials against their exact synthetic frequencies', () => {
    const selected = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.filter((scenario) =>
      ['d3-clean', 'd3-minus-5-cent', 'd3-plus-5-cent', 'd3-plus-25-cent', 'a3-minus-10-cent', 'd4-plus-1-cent'].includes(scenario.id),
    );
    const results = runReferenceSignalBenchmark(selected);
    assert.equal(results.length, selected.length);
    for (const result of results) {
      assert.equal(result.analysisAvailable, true, result.name);
      for (const partial of result.partials) {
        assert.ok(partial.measuredHz !== null, result.name + ' expected ' + partial.multiplier + 'x partial');
        assert.ok(Math.abs(partial.residualErrorCents ?? Infinity) < 1, result.name + ' residual: ' + partial.residualErrorCents);
      }
    }
  });

  it('flags a candidate one octave above the true synthesized root', () => {
    const scenario = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.find((item) => item.id === 'octave-error-candidate');
    assert.ok(scenario);
    const [result] = runReferenceSignalBenchmark([scenario]);
    assert.ok(result.analysisAvailable);
    assert.ok(Math.abs(result.candidateRootDifferenceCents - 1200) < 1e-9);
    assert.equal(result.identifiabilityStatus, 'unidentified');
    assert.ok(result.identifiabilityReasons.includes('strong-subharmonic'));
    assert.ok(result.partials[0].measuredHz !== null);
    assert.ok(Math.abs(result.partials[0].residualErrorCents ?? Infinity) < 1);
  });

  it('separates designed inharmonicity from analyser residual error', () => {
    const scenario = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.find((item) => item.id === 'third-partial-inharmonic');
    assert.ok(scenario);
    const [result] = runReferenceSignalBenchmark([scenario]);
    const third = result.partials[2];
    assert.ok(third.measuredHz !== null);
    assert.ok(Math.abs((third.measuredCentsFromTarget ?? 0) - 7) < 1);
    assert.ok(Math.abs(third.residualErrorCents ?? Infinity) < 1);
  });

  it('retains all three measurable peaks with deterministic broadband noise', () => {
    const scenario = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.find((item) => item.id === 'deterministic-noise');
    assert.ok(scenario);
    const first = runReferenceSignalBenchmark([scenario])[0];
    const second = runReferenceSignalBenchmark([scenario])[0];
    assert.deepEqual(first.partials, second.partials);
    assert.ok(first.partials.every((partial) => partial.measuredHz !== null));
    assert.ok(first.partials.every((partial) => Math.abs(partial.residualErrorCents ?? Infinity) < 1));
  });

  it('does not manufacture peaks for low-level or silent input', () => {
    const scenarios = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.filter((scenario) =>
      scenario.id === 'low-level' || scenario.id === 'silence',
    );
    const results = runReferenceSignalBenchmark(scenarios);
    assert.equal(results.length, 2);
    assert.ok(results.every((result) => result.partials.every((partial) => partial.measuredHz === null)));
    assert.ok(results.every((result) => result.partials.every((partial) => partial.residualErrorCents === null)));
  });

  it('retains the three measured partials in 50 Hz and 60 Hz interference', () => {
    const humScenarios = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.filter((scenario) =>
      scenario.id === 'mains-hum-50hz' || scenario.id === 'mains-hum-60hz',
    );
    const results = runReferenceSignalBenchmark(humScenarios);
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.ok(result.partials.every((partial) => partial.measuredHz !== null), result.name);
      assert.ok(result.partials.every((partial) => Math.abs(partial.residualErrorCents ?? Infinity) < 2), result.name);
    }
  });

  it('detects a nearby split resonance as a possible double peak', () => {
    const scenario = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.find((item) => item.id === 'close-double-peak');
    assert.ok(scenario);
    const [result] = runReferenceSignalBenchmark([scenario]);
    assert.ok(result.analysisAvailable);
    assert.equal(result.possibleDoublePeak, true);
    assert.ok((result.doublePeakSeparationCents ?? 0) >= 1);
  });

  it('tracks valid frames and the loss of the signal through strike decay', () => {
    const scenario = DEFAULT_REFERENCE_SIGNAL_SCENARIOS.find((item) => item.id === 'transient-decay');
    assert.ok(scenario);
    const [result] = runReferenceSignalBenchmark([scenario]);
    assert.ok(result.analysedFrameCount > 1);
    assert.ok(result.validFundamentalFrameCount > 0);
    assert.ok(result.fundamentalFrameCoverage > 0);
    assert.ok(result.fundamentalFrameCoverage < 1);
    assert.equal(result.firstValidFundamentalSeconds, 0);
    assert.ok((result.lastValidFundamentalSeconds ?? Infinity) > 0);
  });

  it('runs the same difficult cases at multiple sample rates and FFT sizes', () => {
    const results = runReferenceSignalProfileBenchmark();
    assert.equal(results.length, REFERENCE_SIGNAL_ANALYSIS_PROFILES.length);
    assert.deepEqual(results.map((result) => result.profile.id), REFERENCE_SIGNAL_ANALYSIS_PROFILES.map((profile) => profile.id));
    assert.ok(results.every((result) => result.summary.scenarioCount === 7));
    assert.ok(results.every((result) => result.summary.analysedScenarioCount === 7));
    assert.ok(results.every((result) => result.summary.measuredPartialCount > 10));
    assert.ok(results.every((result) => result.summary.worstAbsoluteResidualErrorCents !== null));
  });

  it('summarizes measured windows and residual frequency errors reproducibly', () => {
    const results = runReferenceSignalBenchmark(DEFAULT_REFERENCE_SIGNAL_SCENARIOS);
    const summary = summarizeReferenceSignalBenchmark(results);
    assert.equal(summary.scenarioCount, DEFAULT_REFERENCE_SIGNAL_SCENARIOS.length);
    assert.ok(summary.analysedScenarioCount >= 10);
    assert.ok(summary.measuredPartialCount > 20);
    assert.ok(summary.meanAbsoluteResidualErrorCents !== null);
    assert.ok(summary.worstAbsoluteResidualErrorCents !== null);
    assert.ok(summary.worstAbsoluteResidualErrorCents !== null);
    assert.equal(summary.candidateRootMismatchCount, 1);
    assert.equal(summary.suspectedOctaveErrorCount, 1);
    assert.equal(summary.possibleDoublePeakScenarioCount, 1);
    assert.ok(summary.meanFundamentalFrameCoverage !== null);
    assert.ok(summary.missingPartialCount >= 3);
  });
});
