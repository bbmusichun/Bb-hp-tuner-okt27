import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResonanceMeasurement } from '../types/tuner';
import { isStrikePointValid, summarizeStrikeSamples, type StrikeSample } from './multiStrikeSession';

function measurement(role: 'fundamental' | 'fifth' | 'octave', cents: number, overrides: Partial<ResonanceMeasurement> = {}): ResonanceMeasurement {
  return {
    role, name: role, noteName: 'D3', measuredHz: 146.832 * Math.pow(2, cents / 1200), targetHz: 146.832,
    deviationCents: cents, amplitudeDb: -35, confidence: 0.8, peakAmbiguous: false,
    timestampMs: Date.now(), status: 'valid', ...overrides,
  };
}

function point(role: 'fundamental' | 'fifth' | 'octave', cents: number): StrikeSample['fundamental'] {
  const value = measurement(role, cents);
  return { hz: value.measuredHz!, cents: value.deviationCents!, confidence: value.confidence!, amplitudeDb: value.amplitudeDb! };
}

describe('multi-strike tone-field summary', () => {
  it('uses the median and MAD to limit the influence of one contaminated strike', () => {
    const samples: StrikeSample[] = [
      { fundamental: point('fundamental', 1), fifth: point('fifth', 2), octave: point('octave', 3) },
      { fundamental: point('fundamental', 1.2), fifth: point('fifth', 2.2), octave: point('octave', 3.2) },
      { fundamental: point('fundamental', 1.1), fifth: point('fifth', 2.1), octave: point('octave', 3.1) },
      { fundamental: point('fundamental', 80), fifth: point('fifth', 2.3), octave: point('octave', 3.3) },
    ];
    const result = summarizeStrikeSamples(samples);
    assert.ok(result);
    assert.ok(Math.abs(result.fundamental.medianCents - 1.15) < 1e-9);
    assert.ok(Math.abs(result.fundamental.madCents - 0.1) < 1e-9);
    assert.equal(result.fundamental.acceptedCount, 4);
    assert.equal(result.fundamental.rangeCents, 79);
    assert.ok(Math.abs(result.fifth.medianCents - 2.15) < 1e-9);
    assert.ok(Math.abs(result.octave.medianCents - 3.15) < 1e-9);
  });

  it('aggregates each resonance independently and counts rejected modes', () => {
    const samples: StrikeSample[] = [
      { fundamental: point('fundamental', 1), fifth: point('fifth', 2), octave: point('octave', 3) },
      { fundamental: point('fundamental', 2), fifth: null, octave: point('octave', 4) },
      { fundamental: point('fundamental', 3), fifth: point('fifth', 4), octave: point('octave', 5) },
    ];
    const result = summarizeStrikeSamples(samples);
    assert.ok(result);
    assert.equal(result.fundamental.acceptedCount, 3);
    assert.equal(result.fifth.acceptedCount, 2);
    assert.equal(result.fifth.rejectedCount, 1);
    assert.equal(result.octave.acceptedCount, 3);
  });

  it('requires at least three distinct strike records before producing a session summary', () => {
    assert.equal(summarizeStrikeSamples([{ fundamental: point('fundamental', 1), fifth: point('fifth', 2), octave: point('octave', 3) }]), null);
  });

  it('rejects weak, ambiguous, held and missing resonance measurements', () => {
    assert.equal(isStrikePointValid(measurement('fundamental', 1, { confidence: 0.31 })), false);
    assert.equal(isStrikePointValid(measurement('fundamental', 1, { peakAmbiguous: true })), false);
    assert.equal(isStrikePointValid(measurement('fundamental', 1, { status: 'held' })), false);
    assert.equal(isStrikePointValid(measurement('fundamental', 1, { measuredHz: null })), false);
    assert.equal(isStrikePointValid(measurement('fundamental', 1, { confidence: 0.32 })), true);
  });
});