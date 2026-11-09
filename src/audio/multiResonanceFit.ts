import { refineFrequencyBySineFit } from './sineFitRefinement';

const WINDOW_CACHE = new Map<number, Float64Array>();

function getWeights(length: number): Float64Array {
  const cached = WINDOW_CACHE.get(length);
  if (cached) return cached;
  const weights = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)) +
      0.08 * Math.cos(4 * Math.PI * i / (length - 1));
    weights[i] = window * window;
  }
  WINDOW_CACHE.set(length, weights);
  return weights;
}

function solve(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (!Number.isFinite(a[pivot][column]) || Math.abs(a[pivot][column]) < 1e-12) return null;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    for (let j = column; j <= size; j++) a[column][j] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = a[row][column];
      for (let j = column; j <= size; j++) a[row][j] -= factor * a[column][j];
    }
  }
  const result = a.map((row) => row[size]);
  return result.every(Number.isFinite) ? result : null;
}

interface ModeBasis {
  frequencyHz: number;
  cosine: Float64Array;
  sine: Float64Array;
}

/** Fit DC and every available resonance together at fixed trial frequencies. */
function fitModeAmplitudes(
  samples: Float32Array,
  sampleRate: number,
  frequencies: number[],
  weights: Float64Array,
): { dc: number; modes: number[][] } | null {
  const length = samples.length;
  const bases: ModeBasis[] = frequencies.map((frequencyHz) => {
    const cosine = new Float64Array(length);
    const sine = new Float64Array(length);
    const step = 2 * Math.PI * frequencyHz / sampleRate;
    const cs = Math.cos(step), sn = Math.sin(step);
    let c = 1, s = 0;
    for (let i = 0; i < length; i++) {
      cosine[i] = c;
      sine[i] = s;
      const nextC = c * cs - s * sn;
      s = s * cs + c * sn;
      c = nextC;
    }
    return { frequencyHz, cosine, sine };
  });
  const columns: Float64Array[] = [new Float64Array(length)];
  columns[0].fill(1);
  for (const basis of bases) columns.push(basis.cosine, basis.sine);

  const size = columns.length;
  const gram = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const rhs = new Array<number>(size).fill(0);
  for (let i = 0; i < length; i++) {
    const w = weights[i];
    const x = samples[i];
    for (let row = 0; row < size; row++) {
      const weighted = w * columns[row][i];
      rhs[row] += weighted * x;
      for (let column = 0; column <= row; column++) {
        gram[row][column] += weighted * columns[column][i];
      }
    }
  }
  for (let row = 0; row < size; row++) {
    for (let column = row + 1; column < size; column++) gram[row][column] = gram[column][row];
  }
  const coefficients = solve(gram, rhs);
  if (!coefficients) return null;
  return {
    dc: coefficients[0],
    bases,
    modes: bases.map((_, index) => [coefficients[1 + index * 2], coefficients[2 + index * 2]]),
  };
}

/**
 * Refine the fundamental, octave and compound-fifth candidates as one signal model.
 * The three modes are never constrained to integer frequency ratios. A joint
 * least-squares amplitude/phase fit removes cross-partial leakage before each
 * frequency is refined independently against the residual waveform.
 */
export function refineIndependentResonances(
  samples: Float32Array,
  sampleRate: number,
  candidatesHz: readonly (number | null)[],
  searchCents = 8,
): (number | null)[] {
  if (candidatesHz.length !== 3 || samples.length < 1024 ||
      !Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(searchCents) || searchCents <= 0 || searchCents > 30) {
    return [null, null, null];
  }
  const valid = candidatesHz
    .map((frequencyHz, index) => ({ frequencyHz, index }))
    .filter((item): item is { frequencyHz: number; index: number } =>
      item.frequencyHz !== null && Number.isFinite(item.frequencyHz) && item.frequencyHz > 0);
  if (!valid.length) return [null, null, null];
  if (valid.length === 1) {
    const only = valid[0];
    const result = refineFrequencyBySineFit(samples, sampleRate, only.frequencyHz, searchCents);
    return candidatesHz.map((_, index) => index === only.index ? result : null);
  }

  let frequencies = valid.map((item) => item.frequencyHz);
  const weights = getWeights(samples.length);

  // Two short variable-projection passes: jointly refit each mode's amplitude and
  // phase, then subtract the other two modes while optimizing this mode's frequency.
  for (let pass = 0; pass < 2; pass++) {
    const fitted = fitModeAmplitudes(samples, sampleRate, frequencies, weights);
    if (!fitted) break;
    const next = [...frequencies];
    for (let modeIndex = 0; modeIndex < valid.length; modeIndex++) {
      const residual = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        let value = samples[i] - fitted.dc;
        for (let other = 0; other < valid.length; other++) {
          if (other === modeIndex) continue;
          const [cosine, sine] = fitted.modes[other];
          value -= cosine * fitted.bases[other].cosine[i] + sine * fitted.bases[other].sine[i];
        }
        residual[i] = value;
      }
      const refined = refineFrequencyBySineFit(residual, sampleRate, frequencies[modeIndex], searchCents);
      if (refined !== null) next[modeIndex] = refined;
    }
    frequencies = next;
  }

  const result: (number | null)[] = [null, null, null];
  valid.forEach((item, index) => { result[item.index] = frequencies[index]; });
  return result;
}
