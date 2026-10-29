import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScalaNoteLabel, parseScalaScl, scalaToCustomScaleText } from './scala';
import { parseCustomScale } from './instrumentProfiles';

describe('Scala SCL import', () => {
  it('parses cent intervals and removes the period from note degrees', () => {
    const parsed = parseScalaScl('! test\nTest equal scale\n12\n!\n100.0\n200.0\n300.0\n400.0\n500.0\n600.0\n700.0\n800.0\n900.0\n1000.0\n1100.0\n2/1\n');
    assert.ok(parsed);
    assert.equal(parsed.count, 12);
    assert.equal(parsed.intervalsCents.length, 11);
    assert.equal(parsed.periodCents, 1200);
    assert.equal(parsed.reference.degreeIndex, 8);
    assert.equal(parsed.reference.octave, 4);
    assert.equal(parsed.reference.explicit, false);
  });

  it('accepts ratio intervals and creates exact-frequency custom scale rows', () => {
    const parsed = parseScalaScl('Just scale\n5\n5/4\n4/3\n3/2\n5/3\n2/1\n');
    assert.ok(parsed);
    const rows = scalaToCustomScaleText(parsed, 'D3', 146.832384);
    assert.ok(rows);
    const scale = parseCustomScale('Just scale', rows, 'custom-test');
    assert.ok(scale);
    assert.equal(scale.noteCount, 5);
    assert.ok(Math.abs((scale.notes[1].frequencyHz ?? 0) - 146.832384 * Math.pow(2, 386.3137 / 1200)) < 0.1);
  });

  it('preserves Linotune-style labels and reference metadata', () => {
    const parsed = parseScalaScl([
      'Halo just scale',
      '6',
      '9/8 :D',
      '5/4 :E',
      '45/32 :F^#',
      '701.955 :G',
      '15/8 :B',
      '2/1 :C !!reference 3 131.2',
    ].join('\n'));
    assert.ok(parsed);
    assert.deepEqual(parsed.degreeLabels, ['D', 'E', 'F♯', 'G', 'B']);
    assert.deepEqual(parsed.reference, { degreeIndex: -1, octave: 3, frequencyHz: 131.2, explicit: true });
    const rows = scalaToCustomScaleText(parsed, 'C3', 131.2);
    assert.ok(rows);
    assert.ok(rows.startsWith('C3, 131.200\nD, '));
    const scale = parseCustomScale('Halo just scale', rows, 'custom-halo');
    assert.ok(scale);
    assert.equal(scale.notes[1].name, 'D');
  });

  it('normalizes Linotune accidental suffixes and preserves unknown suffixes', () => {
    assert.equal(normalizeScalaNoteLabel('B^B'), 'B𝄫');
    assert.equal(normalizeScalaNoteLabel('F^b'), 'F↓');
    assert.equal(normalizeScalaNoteLabel('F^d'), 'F♭');
    assert.equal(normalizeScalaNoteLabel('F^+'), 'F↑');
    assert.equal(normalizeScalaNoteLabel('F^#'), 'F♯');
    assert.equal(normalizeScalaNoteLabel('F^x'), 'F𝄪');
    assert.equal(normalizeScalaNoteLabel('F^q'), 'Fq');
  });

  it('rejects malformed references, duplicate reference markers, and invalid scales', () => {
    assert.equal(parseScalaScl('bad\nnot-a-count\n'), null);
    assert.equal(parseScalaScl('Bad order\n2\n700\n500\n'), null);
    assert.equal(parseScalaScl('Bad ref\n2\n500 :G !!reference 3 0\n2/1 :C !!reference 4 440\n'), null);
    assert.equal(parseScalaScl('Two refs\n3\n500 :G !!reference 3\n700 :B !!reference 4\n2/1 :C\n'), null);
    const sourceOrdered = parseScalaScl('Circle order\n3\n700\n200\n1200\n', { preserveSourceOrder: true });
    assert.deepEqual(sourceOrdered?.intervalsCents, [700, 200]);
    assert.equal(parseScalaScl('Too many\n129\n'), null);
  });
});
