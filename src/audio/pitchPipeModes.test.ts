import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStrikePitchPipeTargets,
  nextPitchPipeMode,
  normalizePitchPipeModes,
  pitchPipeModeLabel,
  pitchPipeVoiceId,
} from './pitchPipeModes';

describe('multi-band pitch-pipe modes', () => {
  it('cycles in the documented off → continuous → strike → off order', () => {
    assert.equal(nextPitchPipeMode('off'), 'continuous');
    assert.equal(nextPitchPipeMode('continuous'), 'strike');
    assert.equal(nextPitchPipeMode('strike'), 'off');
    assert.equal(pitchPipeModeLabel('off'), 'Kikapcsolva');
    assert.equal(pitchPipeModeLabel('continuous'), 'Folyamatos hang');
    assert.equal(pitchPipeModeLabel('strike'), 'Ütésre rövid hang');
  });

  it('sanitizes persisted mode state and rejects malformed ids', () => {
    assert.deepEqual(normalizePitchPipeModes({
      fundamental: 'continuous',
      octave: 'strike',
      'custom-1': 'off',
      '': 'continuous',
      ['x'.repeat(81)]: 'strike',
      invalid: 'beep',
    }), {
      fundamental: 'continuous',
      octave: 'strike',
      'custom-1': 'off',
    });
    assert.deepEqual(normalizePitchPipeModes(null), {});
    assert.deepEqual(normalizePitchPipeModes([]), {});
  });

  it('produces isolated voice ids for built-in and custom bands', () => {
    assert.equal(pitchPipeVoiceId('fundamental'), 'strobe:fundamental');
    assert.notEqual(pitchPipeVoiceId('fundamental'), pitchPipeVoiceId('custom-1'));
  });

  it('plays every strike-mode band on the same transient while ignoring off/continuous and invalid targets', () => {
    const modes = {
      fundamental: 'strike',
      fifth: 'continuous',
      octave: 'strike',
      'custom-1': 'strike',
      'custom-2': 'strike',
      disabled: 'off',
    } as const;
    const targets: Record<string, number | null> = {
      fundamental: 146.832,
      octave: 293.665,
      'custom-1': 440.497,
      'custom-2': Number.NaN,
    };
    assert.deepEqual(getStrikePitchPipeTargets(modes, (id) => targets[id] ?? null), [
      { id: 'fundamental', frequencyHz: 146.832 },
      { id: 'octave', frequencyHz: 293.665 },
      { id: 'custom-1', frequencyHz: 440.497 },
    ]);
  });
});
