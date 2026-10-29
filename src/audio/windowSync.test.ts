import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWindowSyncRequest, createWindowSyncState, normalizeWindowSyncMessage } from './windowSync';
import type { ToneFieldNote } from '../types/tuner';

const note: ToneFieldNote = {
  id: 'note_0_D3',
  noteName: 'D3',
  sourceNoteName: 'D3',
  frequency: 146.832384,
  octaveFreq: 293.664768,
  fifthFreq: 440.497152,
  positionIndex: 0,
};

describe('multi-window master/slave sync message contract', () => {
  it('creates and validates state containing the exact 1x/2x/3x targets', () => {
    const message = createWindowSyncState('master-tab', 3, {
      target: note,
      a4Ref: 440,
      transposeSemitones: 2,
      selectedRole: 'fifth',
      toleranceOverrideCents: 2.5,
      toleranceMode: 'auto',
      strobeSensitivity: 1.25,
    });
    assert.ok(message);
    assert.equal(message.type, 'state');
    if (message?.type !== 'state') return;
    assert.equal(message.target.frequency, note.frequency);
    assert.equal(message.target.octaveFreq, note.octaveFreq);
    assert.equal(message.target.fifthFreq, note.fifthFreq);
    assert.equal(message.selectedRole, 'fifth');
    assert.equal(message.transposeSemitones, 2);
  });

  it('creates valid request messages and rejects malformed peer identifiers', () => {
    assert.deepEqual(createWindowSyncRequest('slave-tab'), { type: 'request-state', senderId: 'slave-tab' });
    assert.equal(createWindowSyncRequest(''), null);
    assert.equal(createWindowSyncRequest('x'.repeat(101)), null);
    assert.equal(normalizeWindowSyncMessage({ type: 'request-state', senderId: 'peer' })?.type, 'request-state');
  });

  it('rejects invalid frequencies, tolerance, role, offset and sensitivity rather than applying them', () => {
    const valid = createWindowSyncState('master', 1, {
      target: note,
      a4Ref: 440,
      transposeSemitones: 0,
      selectedRole: 'fundamental',
      toleranceOverrideCents: null,
      toleranceMode: 'auto',
      strobeSensitivity: 1,
    });
    assert.ok(valid);
    if (!valid || valid.type !== 'state') return;
    assert.equal(normalizeWindowSyncMessage({ ...valid, a4Ref: 900 }), null);
    assert.equal(normalizeWindowSyncMessage({ ...valid, transposeSemitones: 13 }), null);
    assert.equal(normalizeWindowSyncMessage({ ...valid, selectedRole: 'invalid' }), null);
    assert.equal(normalizeWindowSyncMessage({ ...valid, toleranceOverrideCents: 99 }), null);
    assert.equal(normalizeWindowSyncMessage({ ...valid, strobeSensitivity: 5 }), null);
    assert.equal(normalizeWindowSyncMessage({ ...valid, target: { ...valid.target, frequency: -1 } }), null);
    assert.equal(normalizeWindowSyncMessage({ ...valid, target: { ...valid.target, fifthFreq: Number.NaN } }), null);
    assert.equal(normalizeWindowSyncMessage({ ...valid, sequence: -1 }), null);
  });

  it('normalizes the sender id and preserves optional target labels', () => {
    const request = normalizeWindowSyncMessage({ type: 'request-state', senderId: '  tablet ' });
    assert.deepEqual(request, { type: 'request-state', senderId: 'tablet' });
    const valid = createWindowSyncState('master', 0, {
      target: { ...note, sourceNoteName: undefined },
      a4Ref: 442,
      transposeSemitones: -12,
      selectedRole: 'octave',
      toleranceOverrideCents: 20,
      toleranceMode: 'off',
      strobeSensitivity: 0.25,
    });
    assert.equal(valid?.type, 'state');
    if (valid?.type === 'state') assert.equal(valid.target.sourceNoteName, undefined);
  });
});
