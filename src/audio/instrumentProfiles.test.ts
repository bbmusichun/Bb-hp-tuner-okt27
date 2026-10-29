import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInstrumentProfiles, parseCustomScale, parseInstrumentProfileBackup, resolveActiveInstrumentProfileId, type InstrumentProfile } from './instrumentProfiles';

const fallback: InstrumentProfile = {
  id: 'instrument-default',
  name: 'Saját handpan',
  scaleId: 'd-kurd-9',
  a4Ref: 440,
  partialTargetOffsets: {},
};

describe('custom instrument scales', () => {
  it('keeps exact target frequencies instead of rounding to temperament', () => {
    const scale = parseCustomScale('My D Kurd', 'D3, 146.900\nA3, 220.500\nBb3, 233.300', 'custom-test');
    assert.ok(scale);
    assert.equal(scale.noteCount, 3);
    assert.equal(scale.notes[0].frequencyHz, 146.9);
    assert.equal(scale.notes[1].frequencyHz, 220.5);
    assert.equal(scale.root, 'D3');
  });

  it('rejects duplicate names, malformed rows, out-of-range frequencies and invalid counts', () => {
    assert.equal(parseCustomScale('Bad', 'D3, 146\nD3, 147', 'custom-bad'), null);
    assert.equal(parseCustomScale('Bad', 'D3 146\nA3, 220', 'custom-bad'), null);
    assert.equal(parseCustomScale('Bad', 'D3, 19\nA3, 220', 'custom-bad'), null);
    assert.equal(parseCustomScale('Bad', 'D3, 146', 'custom-bad'), null);
  });
});

describe('instrument profiles', () => {
  it('restores valid custom scales from saved profile records', () => {
    const customScale = parseCustomScale('Custom D', 'D3, 146.91\nA3, 220.49', 'custom-instrument-default');
    assert.ok(customScale);
    const profiles = normalizeInstrumentProfiles([{ ...fallback, scaleId: customScale.id, customScale }], ['d-kurd-9'], fallback);
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].customScale?.notes[0].frequencyHz, 146.91);
  });

  it('imports a valid versioned profile backup with custom targets', () => {
    const customScale = parseCustomScale('Custom D', 'D3, 146.91\nA3, 220.49', 'custom-instrument-default');
    assert.ok(customScale);
    const result = parseInstrumentProfileBackup({
      schemaVersion: 1,
      exportedAt: '2026-10-29T00:00:00.000Z',
      profiles: [{ ...fallback, scaleId: customScale.id, customScale }],
    }, ['d-kurd-9'], fallback);
    assert.ok(result);
    assert.equal(result[0].customScale?.notes[0].frequencyHz, 146.91);
  });

  it('rejects malformed profile backups atomically', () => {
    assert.equal(parseInstrumentProfileBackup({ schemaVersion: 2, profiles: [fallback] }, ['d-kurd-9'], fallback), null);
    assert.equal(parseInstrumentProfileBackup({ schemaVersion: 1, profiles: [{ id: 'invalid' }] }, ['d-kurd-9'], fallback), null);
    assert.equal(parseInstrumentProfileBackup({ schemaVersion: 1, profiles: [fallback, fallback] }, ['d-kurd-9'], fallback), null);
  });

  it('keeps independently configured physical instruments', () => {
    const profiles = normalizeInstrumentProfiles([
      fallback,
      { ...fallback, id: 'instrument-2', name: 'Másik handpan', a4Ref: 442 },
    ], ['d-kurd-9'], fallback);

    assert.equal(profiles.length, 2);
    assert.equal(profiles[0].a4Ref, 440);
    assert.equal(profiles[1].a4Ref, 442);
  });

  it('drops invalid, duplicate, and unsupported profile records', () => {
    const profiles = normalizeInstrumentProfiles([
      fallback,
      { ...fallback, id: 'instrument-default', name: 'Duplicate ID' },
      { ...fallback, id: 'bad-scale', scaleId: 'not-a-preset' },
      { ...fallback, id: 'bad-a4', a4Ref: 900 },
      { ...fallback, id: 'bad-name', name: '   ' },
    ], ['d-kurd-9'], fallback);

    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, 'instrument-default');
  });

  it('falls back safely when storage is empty or malformed', () => {
    assert.deepEqual(normalizeInstrumentProfiles(null, ['d-kurd-9'], fallback), [fallback]);
    assert.deepEqual(normalizeInstrumentProfiles([{ id: 4 }], ['d-kurd-9'], fallback), [fallback]);
  });

  it('resolves a missing active profile to the first available profile', () => {
    const profiles = [fallback, { ...fallback, id: 'instrument-2', name: 'Másik' }];
    assert.equal(resolveActiveInstrumentProfileId('missing', profiles), 'instrument-default');
    assert.equal(resolveActiveInstrumentProfileId('instrument-2', profiles), 'instrument-2');
  });
});
