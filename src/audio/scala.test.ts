import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getScalaReferenceA4, parseScalaScl, scalaToCustomScaleText } from './scala';
import { parseCustomScale } from './instrumentProfiles';

describe('Scala SCL import', () => {
  it('parses cent intervals and removes the period from note degrees', () => {
    const parsed = parseScalaScl('! test\nTest equal scale\n12\n!\n100.0\n200.0\n300.0\n400.0\n500.0\n600.0\n700.0\n800.0\n900.0\n1000.0\n1100.0\n2/1\n');
    assert.ok(parsed);
    assert.equal(parsed.count, 12);
    assert.equal(parsed.intervalsCents.length, 11);
    assert.equal(parsed.periodCents, 1200);
    assert.equal(parsed.degreeLabels.length, 11);
    assert.equal(parsed.periodLabel, undefined);
  });

  it('accepts ratios and produces exact-frequency custom scale rows', () => {
    const parsed = parseScalaScl('Just scale\n5\n5/4\n4/3\n3/2\n5/3\n2/1\n');
    assert.ok(parsed);
    const rows = scalaToCustomScaleText(parsed, 'D3', 146.832384);
    assert.ok(rows);
    const scale = parseCustomScale('Just scale', rows, 'custom-test');
    assert.ok(scale);
    assert.equal(scale.noteCount, 5);
    assert.ok(Math.abs((scale.notes[1].frequencyHz ?? 0) - 146.832384 * Math.pow(2, 386.3137 / 1200)) < 0.1);
  });

  it('preserves note labels and explicit !!reference metadata', () => {
    const parsed = parseScalaScl([
      'Golden Gate (just)',
      '8',
      '135/128 :c#',
      '9/8 :D',
      '5/4 :E',
      '45/32 :F^#',
      '3/2 :G',
      '27/16 :a !!reference 4 442.5 (reference pitch)',
      '15/8 :B',
      '2/1 :C',
    ].join('\n'));
    assert.ok(parsed);
    assert.deepEqual(parsed.degreeLabels, ['c#', 'D', 'E', 'F^#', 'G', 'a', 'B']);
    assert.equal(parsed.periodLabel, 'C');
    assert.deepEqual(parsed.reference, {
      degreeIndex: 6,
      octave: 4,
      frequencyHz: 442.5,
      label: 'a',
    });

    // Source degree spellings are transposed to match the selected tonic while
    // each row keeps the exact ratio-derived frequency.
    const rows = scalaToCustomScaleText(parsed, 'D3', 146.832384);
    assert.ok(rows);
    assert.match(rows, /^D3, 146\.832\nD#3-8c \(f2\), /);
    const expectedSecondFrequency = 146.832384 * Math.pow(2, (1200 * Math.log2(135 / 128)) / 1200);
    assert.ok(rows.includes(', ' + expectedSecondFrequency.toFixed(3)));
    const scale = parseCustomScale('Golden Gate (just)', rows, 'golden-gate-test');
    assert.ok(scale);
    assert.equal(scale.noteCount, 8);
  });

  it('accepts a reference octave without an explicit frequency', () => {
    const parsed = parseScalaScl('Circle of fifths\n3\n700 :G\n900 :A !!reference 4\n1200 :C\n', { preserveSourceOrder: true });
    assert.ok(parsed);
    assert.deepEqual(parsed.reference, { degreeIndex: 2, octave: 4, label: 'A' });
  });

  it('rejects invalid metadata, unordered regular imports, and oversized SCL files', () => {
    assert.equal(parseScalaScl('bad\nnot-a-count\n'), null);
    assert.equal(parseScalaScl('Bad order\n2\n700\n500\n'), null);
    assert.equal(parseScalaScl('Bad reference\n2\n500 :E !!reference four\n1200 :C\n'), null);
    assert.equal(parseScalaScl('Multiple references\n3\n200 :D !!reference 4\n700 :G !!reference 4 440\n1200 :C\n', { preserveSourceOrder: true }), null);
    assert.equal(parseScalaScl('Invalid Hz\n2\n500 :E !!reference 4 3000\n1200 :C\n'), null);

    const sourceOrdered = parseScalaScl('Circle order\n3\n700\n200\n1200\n', { preserveSourceOrder: true });
    assert.deepEqual(sourceOrdered?.intervalsCents, [700, 200]);
    assert.equal(parseScalaScl('Too many\n129\n'), null);
  });
});


describe('Scala reference pitch calibration', () => {
  it('uses an explicitly marked A4 frequency directly', () => {
    const parsed = parseScalaScl('A reference\n2\n500 :A !!reference 4 442.5\n1200 :C\n');
    assert.ok(parsed);
    assert.equal(getScalaReferenceA4(parsed), 442.5);
  });

  it('derives A4 from a non-A reference note and its octave', () => {
    const parsed = parseScalaScl('C reference\n1\n1200 :C !!reference 3 131.2\n');
    assert.ok(parsed);
    const expected = 131.2 * Math.pow(2, 21 / 12);
    assert.ok(Math.abs((getScalaReferenceA4(parsed) ?? 0) - expected) < 1e-9);
  });

  it('does not infer a reference when the frequency or note label is absent', () => {
    const noFrequency = parseScalaScl('Octave only\n2\n500 :A !!reference 4\n1200 :C\n');
    const noLabel = parseScalaScl('Unlabelled reference\n2\n500 !!reference 4 442.5\n1200 :C\n');
    assert.ok(noFrequency);
    assert.ok(noLabel);
    assert.equal(getScalaReferenceA4(noFrequency), null);
    assert.equal(getScalaReferenceA4(noLabel), null);
  });

  it('rejects a reference that would exceed Hangoal A4 calibration limits', () => {
    const parsed = parseScalaScl('Out of range\n1\n1200 :C !!reference 3 140\n');
    assert.ok(parsed);
    assert.equal(getScalaReferenceA4(parsed), null);
  });
});
