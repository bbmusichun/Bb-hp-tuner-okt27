export interface AnalysisRateWindow {
  startedAtMs: number;
  frameCount: number;
}

export interface AnalysisRateSample {
  window: AnalysisRateWindow;
  fps: number | null;
}

/** Count completed analysis ticks and emit a rolling rate at most once per window. */
export function recordAnalysisFrame(
  current: AnalysisRateWindow,
  nowMs: number,
  windowMs = 1000,
): AnalysisRateSample {
  if (!Number.isFinite(nowMs) || nowMs < current.startedAtMs || !Number.isFinite(windowMs) || windowMs < 100) {
    return { window: current, fps: null };
  }
  const frameCount = current.frameCount + 1;
  const elapsedMs = nowMs - current.startedAtMs;
  if (elapsedMs < windowMs) {
    return { window: { ...current, frameCount }, fps: null };
  }
  const fps = Math.max(0, Math.min(240, Math.round((frameCount * 1000) / Math.max(1, elapsedMs))));
  return { window: { startedAtMs: nowMs, frameCount: 0 }, fps };
}
