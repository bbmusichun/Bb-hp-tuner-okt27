import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessFundamentalIdentifiability,
  summarizeFundamentalIdentifiability,
  IDENTIFIABILITY_THRESHOLDS,
  type IdentifiabilityAssessment,
} from './fundamentalIdentifiability';

const RATE = 48000;
const FFT_SIZE = 16384;
const BIN_COUNT = FFT_SIZE / 2;
const BIN_WIDTH = RATE / FFT_SIZE;
const D3 = 146.832384;

/**
 * Build a deterministic dB spectrum from explicit partials. Each partial gets a
 * narrow triangular main lobe so the shared peak finder sees a strict local maximum.
 */
function spectrumFromPartials(partials: { hz: number; db: number }[]): Float32Array {
  const spectrum = new Float32Array(BIN_COUNT).fill(-110);
  for (const { hz, db } of partials) {
    const bin = Math.round(hz / BIN_WIDTH);
    spectrum[bin] = db;
    spectrum[bin - 1] = Math.max(spectrum[bin - 1], db - 3);
    spectrum[bin + 1] = Math.max(spectrum[bin + 1], db - 3);
  }
  return spectrum;
}

/** A realistic tone field: the octave is louder than the fundamental. */
const TONE_FIELD = [
  { hz: D3, db: -30 },
  { hz: D3 * 2, db: -18 },
  { hz: D3 * 3, db: -26 },
];

function frame(assessment: Partial<IdentifiabilityAssessment>): { identifiability: IdentifiabilityAssessment } {
  return {
    identifiability: {
      status: 'identified',
      reasons: [],
      fundamentalHz: null,
      fundamentalLevelDb: null,
      harmonics: [],
      subharmonics: [],
      strongestSubharmonic: null,
      ...assessment,
    },
  };
}

describe('fundamental identifiability', () => {
  it('identifies a handpan tone field rooted at the candidate', () => {
    const result = assessFundamentalIdentifiability(D3, spectrumFromPartials(TONE_FIELD), RATE);
    assert.equal(result.status, 'identified');
    assert.deepEqual(result.reasons, []);
    assert.ok(result.fundamentalHz !== null && Math.abs(result.fundamentalHz - D3) < 2);
    assert.deepEqual(result.harmonics.map((harmonic) => harmonic.present), [true, true]);
    assert.ok(result.harmonics.every((harmonic) => harmonic.consistent));
  });

  it('flags a candidate whose lower root is just as loud (octave error)', () => {
    // Analysing D4 while D3 also rings: D4 has its own upper partials, but the true
    // fundamental sits at candidate / 2 with the same energy, so the root is ambiguous.
    const spectrum = spectrumFromPartials([
      { hz: D3, db: -20 },
      { hz: D3 * 2, db: -18 },
      { hz: D3 * 3, db: -24 },
      { hz: D3 * 4, db: -40 },
      { hz: D3 * 6, db: -46 },
    ]);
    const result = assessFundamentalIdentifiability(D3 * 2, spectrum, RATE);
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(result.reasons, ['strong-subharmonic']);
    assert.equal(result.strongestSubharmonic?.divisor, 2);
    assert.ok(result.strongestSubharmonic?.relativeDb !== null);
  });

  it('does not identify a candidate with no upper partials even above a lower root', () => {
    const spectrum = spectrumFromPartials([
      { hz: D3, db: -20 },
      { hz: D3 * 2, db: -18 },
      { hz: D3 * 3, db: -24 },
    ]);
    const result = assessFundamentalIdentifiability(D3 * 2, spectrum, RATE);
    // The lower root is just as loud *and* the candidate has no series of its own.
    assert.equal(result.status, 'unidentified');
    assert.deepEqual(result.reasons, ['strong-subharmonic', 'missing-octave', 'missing-twelfth']);
  });

  it('keeps the candidate identified when the lower root is clearly weaker', () => {
    const spectrum = spectrumFromPartials([
      { hz: D3 / 2, db: -55 },
      ...TONE_FIELD,
    ]);
    const result = assessFundamentalIdentifiability(D3, spectrum, RATE);
    assert.equal(result.status, 'identified');
    assert.ok(!result.reasons.includes('strong-subharmonic'));
  });

  it('does not identify a lone sine as a handpan fundamental', () => {
    const result = assessFundamentalIdentifiability(D3, spectrumFromPartials([{ hz: D3, db: -20 }]), RATE);
    assert.equal(result.status, 'unidentified');
    assert.ok(result.reasons.includes('missing-octave'));
    assert.ok(result.reasons.includes('missing-twelfth'));
  });

  it('marks an incomplete series as ambiguous rather than identified', () => {
    const spectrum = spectrumFromPartials([{ hz: D3, db: -30 }, { hz: D3 * 2, db: -20 }]);
    const result = assessFundamentalIdentifiability(D3, spectrum, RATE);
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(result.reasons, ['missing-twelfth']);
  });

  it('rejects an octave that does not sit where the measured fundamental predicts it', () => {
    const offOctave = D3 * 2 * Math.pow(2, 90 / 1200);
    const spectrum = spectrumFromPartials([
      { hz: D3, db: -30 },
      { hz: offOctave, db: -20 },
      { hz: D3 * 3, db: -26 },
    ]);
    const result = assessFundamentalIdentifiability(D3, spectrum, RATE);
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(result.reasons, ['inconsistent-octave']);
  });

  it('reports no fundamental instead of a verdict when the window is empty', () => {
    const result = assessFundamentalIdentifiability(D3, new Float32Array(BIN_COUNT).fill(-110), RATE);
    assert.equal(result.status, 'unidentified');
    assert.deepEqual(result.reasons, ['no-fundamental']);
    assert.equal(result.fundamentalHz, null);
    assert.equal(result.strongestSubharmonic, null);
  });

  it('rejects invalid input without throwing', () => {
    const spectrum = spectrumFromPartials(TONE_FIELD);
    assert.equal(assessFundamentalIdentifiability(0, spectrum, RATE).status, 'unidentified');
    assert.equal(assessFundamentalIdentifiability(D3, spectrum, 0).status, 'unidentified');
    assert.equal(assessFundamentalIdentifiability(D3, new Float32Array(0), RATE).status, 'unidentified');
  });
});

describe('identifiability summary', () => {
  const identified = frame({ status: 'identified' });
  const ambiguous = frame({ status: 'ambiguous', reasons: ['strong-subharmonic'] });
  const unidentified = frame({ status: 'unidentified', reasons: ['no-fundamental'] });

  it('calls a recording identified only when most windows agree', () => {
    const summary = summarizeFundamentalIdentifiability([identified, identified, identified, ambiguous]);
    assert.equal(summary.status, 'identified');
    assert.equal(summary.windows, 4);
    assert.equal(summary.identifiedWindows, 3);
    assert.deepEqual(summary.reasons, ['strong-subharmonic']);
  });

  it('reports mixed evidence as ambiguous', () => {
    const summary = summarizeFundamentalIdentifiability([identified, ambiguous, unidentified, unidentified]);
    assert.equal(summary.status, 'ambiguous');
    assert.equal(summary.ambiguousWindows, 1);
    assert.equal(summary.unidentifiedWindows, 2);
  });

  it('does not promote a recording with almost no identified window', () => {
    const summary = summarizeFundamentalIdentifiability([identified, unidentified, unidentified, unidentified, unidentified]);
    assert.equal(summary.status, 'unidentified');
    assert.equal(summary.identifiedWindows, 1);
    assert.equal(summary.identifiedWindows / summary.windows < IDENTIFIABILITY_THRESHOLDS.minimumCoverage, true);
  });

  it('ignores windows without an assessment and reports an empty recording', () => {
    const summary = summarizeFundamentalIdentifiability([{}, {}]);
    assert.equal(summary.status, 'unidentified');
    assert.equal(summary.windows, 0);
    assert.deepEqual(summary.reasons, ['no-fundamental']);
  });
});
