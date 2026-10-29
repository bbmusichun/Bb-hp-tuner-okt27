import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScalaScl, scalaToCustomScaleText } from './scala';
import { parseCustomScale } from './instrumentProfiles';

describe('Scala SCL import', () => {
  it('parses cent intervals and removes the period from note degrees', () => {
    const parsed = parseScalaScl('! test\nTest equal scale\n12\n!\n100.0\n200.0\n300.0\n400.0\n500.0\n600.0\n700.0\n800.0\n900.0\n1000.0\n1100.0\n2/1\n');
    assert.ok(parsed);
    assert.equal(parsed.count, 12);
    assert.equal(parsed.intervalsCents.length, 11);
    assert.equal(parsed.periodCents, 1200);
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

  it('rejects invalid, unordered, and oversized SCL files', () => {
    assert.equal(parseScalaScl('bad\nnot-a-count\n'), null);
    assert.equal(parseScalaScl('Bad order\n2\n700\n500\n'), null);
    assert.equal(parseScalaScl('Too many\n129\n'), null);
  });
});
