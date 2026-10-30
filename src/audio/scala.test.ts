import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScalaScl, resolveScalaReferenceAnchor, scalaToCustomScaleText } from './scala';
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

describe('Scala !!reference anchor resolution', () => {
  it('derives the tonic from a named reference degree using the current A4 calibration', () => {
    const parsed = parseScalaScl(
      'Circle of fifths\n3\n700 :G\n900 :A !!reference 4\n1200 :C\n',
      { preserveSourceOrder: true },
    );
    assert.ok(parsed);
    const anchor = resolveScalaReferenceAnchor(parsed, 440);
    assert.ok(anchor);
    assert.equal(anchor.referenceName, 'A4');
    assert.equal(anchor.referenceHz, 440);
    assert.ok(Math.abs(anchor.rootFrequencyHz - 261.6255653) < 0.001);
    const changedA4 = resolveScalaReferenceAnchor(parsed, 442);
    assert.ok(changedA4);
    assert.ok(Math.abs(changedA4.referenceHz - 442) < 1e-9);
    assert.ok(Math.abs(changedA4.rootFrequencyHz - 261.6255653 * 442 / 440) < 0.001);
  });

  it('uses explicit reference Hz as authoritative and computes the marked degree ratio', () => {
    const parsed = parseScalaScl(
      'Golden Gate (just)\n8\n135/128 :c#\n9/8 :D\n5/4 :E\n45/32 :F^#\n3/2 :G\n27/16 :a !!reference 4 442.5\n15/8 :B\n2/1 :C\n',
    );
    assert.ok(parsed);
    const anchor = resolveScalaReferenceAnchor(parsed, 440);
    assert.ok(anchor);
    assert.equal(anchor.referenceHz, 442.5);
    assert.ok(Math.abs(anchor.intervalCents - 1200 * Math.log2(27 / 16)) < 1e-9);
    assert.ok(Math.abs(anchor.rootFrequencyHz - 442.5 / (27 / 16)) < 1e-9);
    assert.equal(anchor.referenceName, 'A4');
  });

  it('supports solfege labels only when the SCL file includes explicit Hz', () => {
    const explicit = parseScalaScl(
      'Sacred Solfeggio\n3\n396/174 :Ut\n417/174 :Re\n528/174 :Mi !!reference 4 528.0\n',
    );
    assert.ok(explicit);
    const anchor = resolveScalaReferenceAnchor(explicit);
    assert.ok(anchor);
    assert.equal(anchor.referenceName, 'Mi4');
    assert.equal(anchor.referenceHz, 528);

    const implicit = parseScalaScl('Solfeggio\n2\n3/2 :Mi !!reference 4\n2/1 :C\n');
    assert.ok(implicit);
    assert.equal(resolveScalaReferenceAnchor(implicit), null);
  });

  it('uses the supplied A4 calibration for exact-frequency note labels and cent annotations', () => {
    const parsed = parseScalaScl('A4 anchored scale\n3\n500 :E\n900 :A !!reference 4\n1200 :C\n', { preserveSourceOrder: true });
    assert.ok(parsed);
    const anchor = resolveScalaReferenceAnchor(parsed, 442);
    assert.ok(anchor);
    const rootLabel = 'C4+' + Math.round(1200 * Math.log2(anchor.rootFrequencyHz / 442 / Math.pow(2, (60 - 69) / 12))) + 'c';
    const rows = scalaToCustomScaleText(parsed, rootLabel, anchor.rootFrequencyHz, 442);
    assert.ok(rows);
    assert.ok(rows.startsWith(rootLabel + ', ' + anchor.rootFrequencyHz.toFixed(3)));
    assert.equal(scalaToCustomScaleText(parsed, 'C4+2.5c', anchor.rootFrequencyHz, 442), null);
  });

  it('handles a reference marker on the period row and rejects impossible anchor data', () => {
    const period = parseScalaScl('Octave reference\n2\n700 :G\n2/1 :C !!reference 4 261.625565\n');
    assert.ok(period);
    const anchor = resolveScalaReferenceAnchor(period);
    assert.ok(anchor);
    assert.equal(anchor.intervalCents, 1200);
    assert.ok(Math.abs(anchor.rootFrequencyHz - 130.8127825) < 1e-6);

    const noMarker = parseScalaScl('No marker\n2\n700 :G\n2/1 :C\n');
    assert.ok(noMarker);
    assert.equal(resolveScalaReferenceAnchor(noMarker), null);
    assert.equal(resolveScalaReferenceAnchor(period, 500), null);
  });
});
