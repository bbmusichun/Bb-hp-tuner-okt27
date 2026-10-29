import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEditableKeyboardTarget, resolveHangoalKeyboardAction } from './keyboardShortcuts';

test('maps navigation and tuning keys to actions', () => {
  assert.equal(resolveHangoalKeyboardAction('ArrowLeft'), 'previous-note');
  assert.equal(resolveHangoalKeyboardAction('ArrowRight'), 'next-note');
  assert.equal(resolveHangoalKeyboardAction('ArrowUp'), 'previous-resonance');
  assert.equal(resolveHangoalKeyboardAction('ArrowDown'), 'next-resonance');
  assert.equal(resolveHangoalKeyboardAction(' ', 'Space'), 'toggle-microphone');
  assert.equal(resolveHangoalKeyboardAction('d'), 'cycle-detection');
  assert.equal(resolveHangoalKeyboardAction('R'), 'toggle-reference-tone');
  assert.equal(resolveHangoalKeyboardAction('?'), 'show-shortcuts');
});

test('ignores unknown keys', () => {
  assert.equal(resolveHangoalKeyboardAction('x'), null);
  assert.equal(resolveHangoalKeyboardAction('Escape'), null);
});

test('prevents shortcuts from hijacking editable or interactive controls', () => {
  for (const tag of ['input', 'textarea', 'select', 'button', 'a', 'summary']) {
    assert.equal(isEditableKeyboardTarget(tag), true);
  }
  assert.equal(isEditableKeyboardTarget('div', true), true);
  assert.equal(isEditableKeyboardTarget('div'), false);
});
