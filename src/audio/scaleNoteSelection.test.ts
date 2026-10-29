import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDisableToneNote, getEnabledToneNotes, normalizeDisabledToneNotes } from './scaleNoteSelection';

const notes = [
  { id: 'ding', positionIndex: 0 },
  { id: 'note-a', positionIndex: 1 },
  { id: 'note-b', positionIndex: 2 },
];

test('normalizes disabled-note storage and removes duplicates or malformed entries', () => {
  assert.deepEqual(normalizeDisabledToneNotes({
    'd-kurd': ['ding', 'ding', '', 4, 'note-a'],
    '': ['ignore'],
    'bad-array': 'ding',
  }), { 'd-kurd': ['ding', 'note-a'] });
  assert.deepEqual(normalizeDisabledToneNotes(null), {});
});

test('filters disabled notes while preserving source order', () => {
  assert.deepEqual(getEnabledToneNotes(notes, ['note-a']), [notes[0], notes[2]]);
});

test('preserves at least one enabled target when persisted state disables every note', () => {
  assert.deepEqual(getEnabledToneNotes(notes, ['ding', 'note-a', 'note-b']), [notes[0]]);
  assert.deepEqual(getEnabledToneNotes([], ['unused']), []);
});

test('prevents disabling the final active target but allows re-enabling a disabled note', () => {
  assert.equal(canDisableToneNote(notes, ['note-a', 'note-b'], 'ding'), false);
  assert.equal(canDisableToneNote(notes, ['ding', 'note-b'], 'ding'), true);
  assert.equal(canDisableToneNote(notes, [], 'note-a'), true);
});
