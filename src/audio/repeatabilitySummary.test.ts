import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRepeatability } from './repeatabilitySummary';
import type { TuningLogEntry } from '../types/tuner';

function log(id: number, scaleId: string, noteName: string, fundamentalCents: number, fifthCents = fundamentalCents, octaveCents = fundamentalCents, instrumentProfileId?: string): TuningLogEntry {
  return {
    id: String(id),
    timestamp: id,
    scaleId,
    instrumentProfileId,
    noteName,
    fundamentalHz: 146.8,
    fundamentalCents,
    fifthHz: 440.4,
    fifthCents,
    octaveHz: 293.6,
    octaveCents,
    overallInTune: true,
  };
}

describe('repeatability summary', () => {
  it('uses median, median absolute deviation, and full range for repeated captures', () => {
    const result = summarizeRepeatability([
      log(1, 'd-kurd-9', 'D3', 1, 2, 3),
      log(2, 'd-kurd-9', 'D3', 2, 4, 6),
      log(3, 'd-kurd-9', 'D3', 100, 6, 9),
    ], 'd-kurd-9', 'D3');

    assert.ok(result);
    assert.equal(result.sampleCount, 3);
    assert.equal(result.fundamental.medianCents, 2);
    assert.equal(result.fundamental.madCents, 1);
    assert.equal(result.fundamental.rangeCents, 99);
    assert.equal(result.thirdPartial.medianCents, 4);
    assert.equal(result.octave.medianCents, 6);
  });

  it('does not combine different notes or scale profiles', () => {
    const result = summarizeRepeatability([
      log(1, 'd-kurd-9', 'D3', 1),
      log(2, 'd-kurd-9', 'D3', 2),
      log(3, 'e-pygmy-9', 'D3', 3),
      log(4, 'd-kurd-9', 'A3', 4),
    ], 'd-kurd-9', 'D3');
    assert.equal(result, null);
  });

  it('keeps repeated measurements from different physical instruments separate', () => {
    const result = summarizeRepeatability([
      log(1, 'd-kurd-9', 'D3', 1, 1, 1, 'instrument-a'),
      log(2, 'd-kurd-9', 'D3', 2, 2, 2, 'instrument-b'),
      log(3, 'd-kurd-9', 'D3', 3, 3, 3, 'instrument-a'),
      log(4, 'd-kurd-9', 'D3', 4, 4, 4, 'instrument-a'),
    ], 'd-kurd-9', 'D3', 10, 'instrument-a');
    assert.ok(result);
    assert.equal(result.sampleCount, 3);
    assert.equal(result.fundamental.medianCents, 3);
  });

  it('uses only the most recent requested number of samples', () => {
    const result = summarizeRepeatability([
      log(1, 'd-kurd-9', 'D3', 100),
      log(2, 'd-kurd-9', 'D3', 1),
      log(3, 'd-kurd-9', 'D3', 2),
      log(4, 'd-kurd-9', 'D3', 3),
    ], 'd-kurd-9', 'D3', 3);
    assert.ok(result);
    assert.equal(result.sampleCount, 3);
    assert.equal(result.fundamental.medianCents, 2);
    assert.equal(result.fundamental.rangeCents, 2);
  });

  it('returns no summary before three captures and rejects invalid limits', () => {
    assert.equal(summarizeRepeatability([log(1, 'd-kurd-9', 'D3', 1), log(2, 'd-kurd-9', 'D3', 2)], 'd-kurd-9', 'D3'), null);
    assert.equal(summarizeRepeatability([], 'd-kurd-9', 'D3', 2), null);
  });

  it('does not summarize non-finite readings', () => {
    const invalid = log(3, 'd-kurd-9', 'D3', Number.NaN);
    assert.equal(summarizeRepeatability([log(1, 'd-kurd-9', 'D3', 1), log(2, 'd-kurd-9', 'D3', 2), invalid], 'd-kurd-9', 'D3'), null);
  });
});
