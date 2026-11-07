/**
 * Temporal pitch estimator for struck instruments.
 *
 * A single FFT frame can jump between spectral bins or briefly lock onto a
 * neighbouring resonance. Keep the last accepted pitch visible while a
 * competing pitch is checked across several consecutive frames. Only a
 * persistent, internally consistent new cluster may replace the readout.
 */
export interface PitchSample {
  frequencyHz: number;
  timestampMs: number;
  /** Candidate samples are tracked separately and never enter the live median until confirmed. */
  candidate?: boolean;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function smoothPitchSample(
  history: PitchSample[],
  frequencyHz: number,
  timestampMs: number,
  options: {
    windowSize?: number;
    resetAfterMs?: number;
    jumpThresholdCents?: number;
    candidateMatchCents?: number;
    candidateConfirmations?: number;
  } = {},
): { frequencyHz: number; history: PitchSample[] } {
  const windowSize = options.windowSize ?? 5;
  const resetAfterMs = options.resetAfterMs ?? 1200;
  const jumpThresholdCents = options.jumpThresholdCents ?? 12;
  const candidateMatchCents = options.candidateMatchCents ?? 4;
  const candidateConfirmations = Math.max(2, Math.floor(options.candidateConfirmations ?? 3));

  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || !Number.isFinite(timestampMs)) {
    return { frequencyHz, history: [] };
  }

  const recent = history.filter((sample) =>
    Number.isFinite(sample.frequencyHz) &&
    sample.frequencyHz > 0 &&
    Number.isFinite(sample.timestampMs) &&
    timestampMs >= sample.timestampMs &&
    timestampMs - sample.timestampMs <= resetAfterMs
  );
  const accepted = recent.filter((sample) => !sample.candidate);
  const pending = recent.filter((sample) => sample.candidate);
  const previousMedian = median(accepted.map((sample) => sample.frequencyHz));

  // Initial lock: there is no previous pitch to protect, so begin building the
  // first cluster immediately. The engine's independent stability gate still
  // controls when this reading is considered valid.
  if (!Number.isFinite(previousMedian) && pending.length === 0) {
    const next = [{ frequencyHz, timestampMs }];
    return { frequencyHz, history: next };
  }

  const jumpCents = Number.isFinite(previousMedian)
    ? Math.abs(1200 * Math.log2(frequencyHz / previousMedian))
    : Number.POSITIVE_INFINITY;

  if (Number.isFinite(previousMedian) && jumpCents <= jumpThresholdCents) {
    const next = [...accepted, { frequencyHz, timestampMs }].slice(-windowSize);
    return {
      frequencyHz: median(next.map((sample) => sample.frequencyHz)),
      history: next,
    };
  }

  // A distant peak is not allowed to replace the displayed pitch immediately.
  // It must form its own tight cluster for several consecutive analysis frames.
  const pendingMedian = median(pending.map((sample) => sample.frequencyHz));
  const matchesPending = Number.isFinite(pendingMedian) &&
    Math.abs(1200 * Math.log2(frequencyHz / pendingMedian)) <= candidateMatchCents;
  const nextPending = matchesPending
    ? [...pending, { frequencyHz, timestampMs, candidate: true }]
    : [{ frequencyHz, timestampMs, candidate: true }];

  if (nextPending.length >= candidateConfirmations) {
    const confirmed = nextPending
      .map(({ frequencyHz: hz, timestampMs: at }) => ({ frequencyHz: hz, timestampMs: at }))
      .slice(-windowSize);
    return {
      frequencyHz: median(confirmed.map((sample) => sample.frequencyHz)),
      history: confirmed,
    };
  }

  return {
    frequencyHz: Number.isFinite(previousMedian) ? previousMedian : frequencyHz,
    history: [...accepted, ...nextPending].slice(-(windowSize + candidateConfirmations - 1)),
  };
}
