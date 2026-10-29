import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chooseNoteCandidate, NoteCandidate, SpectralPeak } from './noteDetection';

const d3: NoteCandidate = { id: 'd3', noteName: 'D3', frequency: 146.832 };
const a3: NoteCandidate = { id: 'a3', noteName: 'A3', frequency: 220.0 };

function mappedPeaks(peaks: Array<{ hz: number; db: number }>) {
  return (targetHz: number): SpectralPeak | null => {
    const peak = peaks.find((candidate) => Math.abs(candidate.hz - targetHz) < 2.0);
    return peak ? { hz: peak.hz, db: peak.db } : null;
  };
}

describe('conservative spectral note detection', () => {
  it('selects a candidate with strong fundamental and corroborating partials', () => {
    const detect = mappedPeaks([
      { hz: d3.frequency, db: -38 },
      { hz: d3.frequency * 2, db: -47 },
      { hz: d3.frequency * 3, db: -45 },
    ]);
    assert.equal(chooseNoteCandidate([d3, a3], detect)?.id, 'd3');
  });

  it('rejects similarly scored fundamentals rather than guessing', () => {
    const candidates = [
      { id: 'n1', noteName: 'N1', frequency: 200 },
      { id: 'n2', noteName: 'N2', frequency: 220 },
    ];
    const detect = (hz: number) =>
      Math.abs(hz - 200) < 0.1 || Math.abs(hz - 220) < 0.1 ? { hz, db: -40 } : null;
    assert.equal(chooseNoteCandidate(candidates, detect), null);
  });

  it('can recover a missing fundamental only when both partials are present', () => {
    const detect = mappedPeaks([
      { hz: d3.frequency * 2, db: -40 },
      { hz: d3.frequency * 3, db: -43 },
    ]);
    assert.equal(chooseNoteCandidate([d3, a3], detect)?.id, 'd3');
  });

  it('rejects a missing fundamental when only one partial is found', () => {
    const detect = mappedPeaks([{ hz: d3.frequency * 2, db: -35 }]);
    assert.equal(chooseNoteCandidate([d3, a3], detect), null);
  });

  it('prefers the candidate whose detected peak is closer to its target frequency', () => {
    const candidates = [
      { id: 'a3', noteName: 'A3', frequency: 220 },
      { id: 'd3', noteName: 'D3', frequency: 146.832 },
    ];
    const peaks = [
      { hz: 220.8, db: -40 },
      { hz: 146.9, db: -42 },
      { hz: 293.8, db: -50 },
      { hz: 440.6, db: -48 },
      { hz: 440.5, db: -41 },
    ];
    const detect = (targetHz: number): SpectralPeak | null => {
      const match = peaks.filter(p => Math.abs(1200 * Math.log2(p.hz / targetHz)) < 65)
        .sort((a, b) => Math.abs(a.hz - targetHz) - Math.abs(b.hz - targetHz))[0];
      return match ?? null;
    };
    assert.equal(chooseNoteCandidate(candidates, detect)?.id, 'd3');
  });

  it('ignores invalid candidate frequencies', () => {
    const invalid = { id: 'bad', noteName: 'bad', frequency: Number.NaN };
    assert.equal(chooseNoteCandidate([invalid], () => null), null);
  });
});


describe('robust note recognition for detuned handpan notes', () => {
  it('recognizes a note that is substantially sharp when its harmonics agree', () => {
    const shifted = d3.frequency * Math.pow(2, 100 / 1200);
    const peaks = [
      { hz: shifted, db: -35 },
      { hz: shifted * 2, db: -43 },
      { hz: shifted * 3, db: -46 },
    ];
    const detect = (targetHz: number, centsWindow = 45): SpectralPeak | null => {
      const match = peaks
        .filter((p) => Math.abs(1200 * Math.log2(p.hz / targetHz)) <= centsWindow)
        .sort((a, b) => Math.abs(1200 * Math.log2(a.hz / targetHz)) - Math.abs(1200 * Math.log2(b.hz / targetHz)))[0];
      return match ?? null;
    };
    assert.equal(chooseNoteCandidate([d3, a3], detect)?.id, 'd3');
  });
});
