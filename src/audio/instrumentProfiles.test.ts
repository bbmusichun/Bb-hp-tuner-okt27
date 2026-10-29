import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInstrumentProfiles, resolveActiveInstrumentProfileId, type InstrumentProfile } from './instrumentProfiles';

const fallback: InstrumentProfile = {
  id: 'instrument-default',
  name: 'Saját handpan',
  scaleId: 'd-kurd-9',
  a4Ref: 440,
  partialTargetOffsets: {},
};

describe('instrument profiles', () => {
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
