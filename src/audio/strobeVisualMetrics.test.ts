import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { strobeContrastFromDb, strobeSharpnessFromCents } from './strobeVisualMetrics';

describe('Hangoal-inspired strobe visual metrics', () => {
  it('maps dBFS peak levels to a bounded visual contrast range', () => {
    assert.equal(strobeContrastFromDb(null), 0);
    assert.equal(strobeContrastFromDb(Number.NaN), 0);
    assert.equal(strobeContrastFromDb(-100), 0);
    assert.equal(strobeContrastFromDb(-82), 0);
    assert.equal(strobeContrastFromDb(-56), 0.5);
    assert.equal(strobeContrastFromDb(-30), 1);
    assert.equal(strobeContrastFromDb(0), 1);
  });

  it('does not call one or two frames stable', () => {
    assert.equal(strobeSharpnessFromCents([]), 0.35);
    assert.equal(strobeSharpnessFromCents([0, 0]), 0.35);
  });

  it('renders stable readings sharper than variable readings', () => {
    const stable = strobeSharpnessFromCents([2, 2.1, 1.9, 2, 2.05]);
    const variable = strobeSharpnessFromCents([-12, 8, -5, 11, 0]);
    assert.equal(stable, 1);
    assert.ok(variable < stable);
    assert.equal(strobeSharpnessFromCents([-20, 20, -15, 15]), 0);
  });

  it('ignores non-finite stability samples', () => {
    assert.equal(strobeSharpnessFromCents([2, Number.NaN, 2.1, 1.9]), 1);
  });
});
