import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePartialInharmonicity } from './partialInharmonicity';
import type { WavFrameAnalysis } from './wavAnalysis';

const D3 = 146.832384;

function frame(
  octaveOffsetCents = 6,
  thirdOffsetCents = -4,
  options: { confidence?: number; frequency?: number; weakPartial?: boolean } = {},
): WavFrameAnalysis {
  const f0 = D3 * Math.pow(2, 2 / 1200);
  const octave = f0 * 2 * Math.pow(2, octaveOffsetCents / 1200);
  const third = f0 * 3 * Math.pow(2, thirdOffsetCents / 1200);
  const strong = !options.weakPartial;
  return {
    timeSeconds: 0.2,
    rmsDb: -24,
    detectedNote: {
      id: 'D3',
      noteName: 'D3',
      frequency: options.frequency ?? D3,
      confidence: options.confidence ?? 0.9,
    },
    resonances: [
      { targetHz: D3, measuredHz: f0, cents: 2, peakDb: -30, prominenceDb: 24 },
      { targetHz: D3 * 2, measuredHz: strong ? octave : null, cents: octaveOffsetCents + 2, peakDb: strong ? -35 : -88, prominenceDb: strong ? 20 : 2 },
      { targetHz: D3 * 3, measuredHz: strong ? third : null, cents: thirdOffsetCents + 2, peakDb: strong ? -38 : -88, prominenceDb: strong ? 18 : 2 },
    ],
  };
}

describe('partial inharmonicity estimate', () => {
  it('normalizes the partials to the measured fundamental, not the named note target', () => {
    const result = estimatePartialInharmonicity(Array.from({ length: 6 }, () => frame()), D3);
    assert.equal(result.reliable, true);
    assert.equal(result.sampleCount, 6);
    assert.ok(Math.abs((result.octaveCents ?? 0) - 6) < 1e-8);
    assert.ok(Math.abs((result.thirdPartialCents ?? 0) + 4) < 1e-8);
  });

  it('uses the median so one inconsistent window cannot dominate the estimate', () => {
    const values = [6, 6.1, 5.9, 6.05, 43, 6.02].map((cents) => frame(cents, -4));
    const result = estimatePartialInharmonicity(values, D3);
    assert.equal(result.reliable, true);
    assert.ok(Math.abs((result.octaveCents ?? 0) - 6.025) < 0.1);
  });

  it('does not claim reliable calibration from weak partials or mismatched notes', () => {
    const weak = Array.from({ length: 8 }, () => frame(6, -4, { weakPartial: true }));
    assert.equal(estimatePartialInharmonicity(weak, D3).reliable, false);
    const wrongNote = Array.from({ length: 8 }, () => frame(6, -4, { frequency: D3 * Math.pow(2, 90 / 1200) }));
    assert.equal(estimatePartialInharmonicity(wrongNote, D3).sampleCount, 0);
  });

  it('requires repeated stable windows and sufficient coverage', () => {
    const result = estimatePartialInharmonicity([frame(), frame(), frame()], D3);
    assert.equal(result.reliable, false);
  });
});
