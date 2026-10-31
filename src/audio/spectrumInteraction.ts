export type SpectrumZoomRole = 'all' | 'fundamental' | 'octave' | 'fifth';

export interface SpectrumTargetFrequencies {
  fundamentalHz: number;
  octaveHz: number;
  fifthHz: number;
}

export interface SpectrumFrequencyRange {
  lowHz: number;
  highHz: number;
}

export interface SpectrumPlotBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SpectrumCursorReadout {
  frequencyHz: number;
  dbfs: number;
  ratioToFundamental: number;
  centsFromFundamental: number;
}

/** Full overview range: a little below the fundamental through the 3× partial. */
export function getSpectrumFrequencyRange(baseHz: number): SpectrumFrequencyRange {
  const base = Number.isFinite(baseHz) && baseHz > 0 ? baseHz : 146.83;
  return {
    lowHz: Math.max(20, base * Math.pow(2, -1 / 12)),
    highHz: base * 3 * Math.pow(2, 1 / 12),
  };
}

/**
 * Focus one resonance without changing the analyser, target values, or measurements.
 * The default ±300-cent window keeps nearby doubled/competing peaks visible.
 */
export function getSpectrumZoomRange(
  baseHz: number,
  targets: SpectrumTargetFrequencies,
  zoomRole: SpectrumZoomRole,
  halfWidthCents = 300,
): SpectrumFrequencyRange {
  if (zoomRole === 'all') return getSpectrumFrequencyRange(baseHz);

  const base = Number.isFinite(baseHz) && baseHz > 0 ? baseHz : 146.83;
  const fallback = zoomRole === 'fundamental' ? base : zoomRole === 'octave' ? base * 2 : base * 3;
  const candidate = targets[zoomRole === 'fundamental' ? 'fundamentalHz' : zoomRole === 'octave' ? 'octaveHz' : 'fifthHz'];
  const target = Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
  const width = Number.isFinite(halfWidthCents) ? Math.max(50, Math.min(1200, halfWidthCents)) : 300;
  return {
    lowHz: Math.max(20, target * Math.pow(2, -width / 1200)),
    highHz: target * Math.pow(2, width / 1200),
  };
}

/** Map a canvas pointer position to frequency, dBFS and ratio relative to the fundamental. */
export function getSpectrumCursorReadout(
  x: number,
  y: number,
  plot: SpectrumPlotBounds,
  range: SpectrumFrequencyRange,
  fundamentalHz: number,
  minDb = -100,
  maxDb = -20,
): SpectrumCursorReadout | null {
  if (![x, y, plot.left, plot.top, plot.width, plot.height, range.lowHz, range.highHz, fundamentalHz, minDb, maxDb]
    .every(Number.isFinite) ||
    plot.width <= 0 || plot.height <= 0 || range.lowHz <= 0 || range.highHz <= range.lowHz ||
    fundamentalHz <= 0 || maxDb <= minDb) return null;

  const relativeX = (x - plot.left) / plot.width;
  const relativeY = (y - plot.top) / plot.height;
  if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) return null;

  const frequencyHz = range.lowHz + relativeX * (range.highHz - range.lowHz);
  const dbfs = maxDb - relativeY * (maxDb - minDb);
  const ratioToFundamental = frequencyHz / fundamentalHz;
  return {
    frequencyHz,
    dbfs,
    ratioToFundamental,
    centsFromFundamental: 1200 * Math.log2(ratioToFundamental),
  };
}
