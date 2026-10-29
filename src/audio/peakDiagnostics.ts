import { findSpectralPeakInWindow, type SpectralPeakMeasurement } from './spectralPeak';

export interface PeakInspection {
  targetHz: number;
  primary: SpectralPeakMeasurement | null;
  secondary: SpectralPeakMeasurement | null;
  noiseFloorDb: number | null;
  separationCents: number | null;
  levelDifferenceDb: number | null;
  possibleDoublePeak: boolean;
}

/** Median spectral level in a frequency range. The median limits the influence of a few strong partials. */
export function estimateNoiseFloorDb(
  spectrum: Float32Array,
  sampleRate: number,
  minHz = 20,
  maxHz = Math.min(20000, sampleRate / 2),
): number | null {
  if (
    spectrum.length < 3 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Number.isFinite(minHz) || !Number.isFinite(maxHz) ||
    minHz < 0 || maxHz <= minHz
  ) return null;

  const binWidth = sampleRate / (spectrum.length * 2);
  const start = Math.max(1, Math.ceil(minHz / binWidth));
  const end = Math.min(spectrum.length - 2, Math.floor(maxHz / binWidth));
  const values: number[] = [];
  for (let i = start; i <= end; i++) {
    const db = spectrum[i];
    if (Number.isFinite(db) && db >= -120 && db <= 6) values.push(db);
  }
  if (values.length < 5) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/** Return discrete local maxima in a frequency interval, strongest first. */
export function findLocalSpectralPeaks(
  spectrum: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  minimumPeakDb = -82,
  maxPeaks = 8,
  minBinDistance = 2,
): SpectralPeakMeasurement[] {
  if (
    spectrum.length < 3 ||
    !Number.isFinite(sampleRate) || sampleRate <= 0 ||
    !Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 0 || maxHz <= minHz ||
    !Number.isFinite(minimumPeakDb) || maxPeaks < 1 || minBinDistance < 1
  ) return [];

  const binWidth = sampleRate / (spectrum.length * 2);
  const start = Math.max(1, Math.ceil(minHz / binWidth));
  const end = Math.min(spectrum.length - 2, Math.floor(maxHz / binWidth));
  if (start > end) return [];

  const candidates: SpectralPeakMeasurement[] = [];
  for (let i = start; i <= end; i++) {
    const db = spectrum[i];
    if (
      Number.isFinite(db) && db >= minimumPeakDb &&
      db > spectrum[i - 1] && db >= spectrum[i + 1]
    ) {
      candidates.push({
        ...{ freq: i * binWidth, magDb: db, bin: i },
      });
    }
  }
  candidates.sort((a, b) => b.magDb - a.magDb);

  const selected: SpectralPeakMeasurement[] = [];
  for (const peak of candidates) {
    if (selected.some((other) => Math.abs(other.bin - peak.bin) < minBinDistance)) continue;
    selected.push(peak);
    if (selected.length >= maxPeaks) break;
  }
  return selected;
}

/**
 * Inspect peaks around one target without changing the tuner result.
 * A possible double peak is only a heuristic: two sufficiently strong, separated maxima
 * may be a split mode, beating, a nearby partial, or an environmental sound.
 */
export function inspectTargetPeak(
  spectrum: Float32Array,
  sampleRate: number,
  targetHz: number,
  windowCents = 150,
  minimumPeakDb = -82,
): PeakInspection {
  const invalid: PeakInspection = {
    targetHz,
    primary: null,
    secondary: null,
    noiseFloorDb: null,
    separationCents: null,
    levelDifferenceDb: null,
    possibleDoublePeak: false,
  };
  if (!Number.isFinite(targetHz) || targetHz <= 0 || !Number.isFinite(windowCents) || windowCents < 0) return invalid;

  const lowHz = targetHz * Math.pow(2, -windowCents / 1200);
  const highHz = targetHz * Math.pow(2, windowCents / 1200);
  const peaks = findLocalSpectralPeaks(spectrum, sampleRate, lowHz, highHz, minimumPeakDb, 10, 2);
  const primary = findSpectralPeakInWindow(targetHz, windowCents, spectrum, sampleRate, minimumPeakDb);
  if (!primary) {
    return { ...invalid, noiseFloorDb: estimateNoiseFloorDb(spectrum, sampleRate, lowHz, highHz) };
  }

  const binWidth = sampleRate / (spectrum.length * 2);
  const primaryBin = primary.freq / binWidth;
  const secondary = peaks
    .filter((peak) => Math.abs(peak.bin - primaryBin) >= 2)
    .filter((peak) => peak.magDb > primary.magDb - 30)[0] ?? null;
  const noiseFloorDb = estimateNoiseFloorDb(spectrum, sampleRate, lowHz, highHz);
  const separationCents = secondary
    ? 1200 * Math.log2(Math.max(primary.freq, secondary.freq) / Math.min(primary.freq, secondary.freq))
    : null;
  const levelDifferenceDb = secondary ? primary.magDb - secondary.magDb : null;
  const secondaryHasContrast = secondary !== null && noiseFloorDb !== null && secondary.magDb >= noiseFloorDb + 10;
  const possibleDoublePeak = secondary !== null &&
    Math.abs(primary.magDb - secondary.magDb) <= 12 &&
    secondaryHasContrast &&
    separationCents !== null && separationCents >= 1;

  return {
    targetHz,
    primary,
    secondary,
    noiseFloorDb,
    separationCents,
    levelDifferenceDb,
    possibleDoublePeak,
  };
}
