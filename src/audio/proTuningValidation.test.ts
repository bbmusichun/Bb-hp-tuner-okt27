import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resonanceConfidenceFromDb, isReliableResonanceConfidence } from './peakConfidence';
import { chooseNoteCandidate, NoteCandidate, SpectralPeak } from './noteDetection';
import { StablePitchTracker, requiredTransientHoldoffMs, isTransientHoldoffActive } from './transientGuard';

test('resonance confidence is bounded and rejects non-finite dB readings', () => {
  assert.equal(resonanceConfidenceFromDb(Number.NaN), 0);
  assert.equal(resonanceConfidenceFromDb(Number.POSITIVE_INFINITY), 0);
  assert.equal(resonanceConfidenceFromDb(-120), 0);
  assert.equal(resonanceConfidenceFromDb(-35), 1);
  assert.ok(resonanceConfidenceFromDb(-70) > resonanceConfidenceFromDb(-80));
  assert.equal(isReliableResonanceConfidence(resonanceConfidenceFromDb(-80)), false);
  assert.equal(isReliableResonanceConfidence(resonanceConfidenceFromDb(-79)), true);
  assert.equal(isReliableResonanceConfidence(Number.NaN), false);
});

test('note selection uses fundamental and partial corroboration and rejects ambiguous candidates', () => {
  const candidates: NoteCandidate[] = [
    { id: 'D3', noteName: 'D3', frequency: 146.83 },
    { id: 'E3', noteName: 'E3', frequency: 164.81 },
  ];
  const peakNear = (targetHz: number): SpectralPeak | null => {
    // Synthetic spectrum contains a coherent D3 family, but no E3 family.
    const dTargets = [146.83, 293.66, 440.49];
    const dLevels = [-34, -40, -45];
    for (let i = 0; i < dTargets.length; i++) {
      if (Math.abs(1200 * Math.log2(targetHz / dTargets[i])) < 15) {
        return { hz: dTargets[i], db: dLevels[i] };
      }
    }
    return null;
  };
  const detected = chooseNoteCandidate(candidates, peakNear);
  assert.equal(detected?.id, 'D3');

  const ambiguous = chooseNoteCandidate(candidates, () => ({ hz: 150, db: -40 }));
  assert.equal(ambiguous, null);
});

test('stable pitch tracker requires consecutive compatible readings and resets on a jump', () => {
  const tracker = new StablePitchTracker({ requiredReadings: 4, maxDeviationCents: 5, minConfidence: 0.3 });
  for (let i = 0; i < 3; i++) {
    assert.equal(tracker.observe({ frequencyHz: 146.83, confidence: 0.8, timestampMs: 100 + i * 50 }).stable, false);
  }
  const stable = tracker.observe({ frequencyHz: 146.84, confidence: 0.8, timestampMs: 250 });
  assert.equal(stable.stable, true);
  assert.ok(stable.frequencyHz !== null && Math.abs(stable.frequencyHz - 146.83) < 0.02);

  const jump = tracker.observe({ frequencyHz: 164.81, confidence: 0.8, timestampMs: 300 });
  assert.equal(jump.stable, false);
  assert.equal(jump.count, 1);

  const weak = tracker.observe({ frequencyHz: 146.83, confidence: 0.1, timestampMs: 350 });
  assert.equal(weak.stable, false);
  assert.equal(weak.count, 0);
});

test('transient holdoff covers one FFT window plus configured guard', () => {
  assert.equal(requiredTransientHoldoffMs(16384, 48000, 50), 16384 / 48000 * 1000 + 50);
  assert.equal(isTransientHoldoffActive(1000, 1100, 16384, 48000, 50), true);
  assert.equal(isTransientHoldoffActive(1000, 1500, 16384, 48000, 50), false);
  assert.equal(isTransientHoldoffActive(1000, 900, 16384, 48000, 50), false);
});
