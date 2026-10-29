import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHangoalFullConfiguration } from './fullConfiguration';
import type { InstrumentProfile } from './instrumentProfiles';

const fallbackProfile: InstrumentProfile = {
  id: 'instrument-default',
  name: 'Saját handpan',
  scaleId: 'd-kurd-9',
  a4Ref: 440,
  partialTargetOffsets: {},
};

const validEntry = {
  id: 'log-1',
  timestamp: 1760000000000,
  noteName: 'D3',
  fundamentalHz: 146.83,
  fundamentalCents: 0.1,
  fifthHz: 440.49,
  fifthCents: -0.2,
  octaveHz: 293.66,
  octaveCents: 0.3,
  overallInTune: true,
  fundamentalTargetHz: 146.832,
  fifthTargetHz: 440.497,
  octaveTargetHz: 293.665,
  audioSampleRateHz: 48000,
  inputLevelDbfs: -12,
};

const validBackup = () => ({
  schemaVersion: 2,
  exportedAt: '2026-10-29T00:00:00.000Z',
  settings: {
    autoDetect: true,
    autoDetectionMode: 'single-shot',
    toleranceOverrideCents: 2,
    transposeSemitones: -3,
    readoutMode: 'ratio',
    referenceToneMode: 'off',
    activeInstrumentProfileId: 'instrument-default',
    instrumentProfiles: [fallbackProfile],
  },
  disabledToneNotesByScale: { 'd-kurd-9': ['note-1'] },
  customStrobeBands: [
    { id: 'custom-440', name: '440 Hz', source: 'custom', targetHz: 440, centsOffset: 0, enabled: true },
  ],
  measurements: [validEntry],
});

test('parses a complete validated bundle and preserves its settings', () => {
  const result = parseHangoalFullConfiguration(validBackup(), ['d-kurd-9'], fallbackProfile);
  assert.ok(result);
  assert.equal(result.settings.autoDetectionMode, 'single-shot');
  assert.equal(result.settings.transposeSemitones, -3);
  assert.equal(result.settings.readoutMode, 'ratio');
  assert.equal(result.settings.referenceToneMode, 'off');
  assert.equal(result.settings.activeInstrumentProfileId, 'instrument-default');
  assert.deepEqual(result.disabledToneNotesByScale, { 'd-kurd-9': ['note-1'] });
  assert.equal(result.customStrobeBands[0].targetHz, 440);
  assert.equal(result.measurements.length, 1);
});

test('rejects unsupported schema or missing required sections', () => {
  assert.equal(parseHangoalFullConfiguration({ ...validBackup(), schemaVersion: 1 }, ['d-kurd-9'], fallbackProfile), null);
  assert.equal(parseHangoalFullConfiguration({ schemaVersion: 2, settings: {} }, ['d-kurd-9'], fallbackProfile), null);
  assert.equal(parseHangoalFullConfiguration(null, ['d-kurd-9'], fallbackProfile), null);
});

test('rejects invalid or mismatched active profile identity', () => {
  const backup = validBackup();
  backup.settings.activeInstrumentProfileId = 'missing-id';
  assert.equal(parseHangoalFullConfiguration(backup, ['d-kurd-9'], fallbackProfile), null);
});

test('rejects invalid tuning values, mode names and non-custom bands', () => {
  const invalidTranspose = validBackup();
  invalidTranspose.settings.transposeSemitones = 13;
  assert.equal(parseHangoalFullConfiguration(invalidTranspose, ['d-kurd-9'], fallbackProfile), null);

  const invalidReadout = validBackup();
  invalidReadout.settings.readoutMode = 'spectrogram';
  assert.equal(parseHangoalFullConfiguration(invalidReadout, ['d-kurd-9'], fallbackProfile), null);

  const wrongBand = validBackup();
  wrongBand.customStrobeBands[0].source = 'fundamental';
  assert.equal(parseHangoalFullConfiguration(wrongBand, ['d-kurd-9'], fallbackProfile), null);
});

test('rejects malformed log entries and duplicate log ids', () => {
  const malformed = validBackup();
  malformed.measurements[0].fundamentalHz = -10;
  assert.equal(parseHangoalFullConfiguration(malformed, ['d-kurd-9'], fallbackProfile), null);

  const duplicateIds = validBackup();
  duplicateIds.measurements.push({ ...validEntry });
  assert.equal(parseHangoalFullConfiguration(duplicateIds, ['d-kurd-9'], fallbackProfile), null);
});
