/**
 * Reference-pitch refinement.
 *
 * The FFT peak remains the primary estimate. When an independent time-domain
 * estimator (YIN) strongly agrees with it, fuse the two in log-frequency space.
 * This can reduce sub-bin jitter without allowing an octave/neighbor error from
 * one estimator to pull the tuner away from the actual spectral peak.
 */

export interface FrequencyFusionOptions {
  minimumClarity?: number;
  maximumAgreementCents?: number;
  maximumIndependentWeight?: number;
}

export function fuseAgreeingFrequencyEstimates(
  spectralHz: number,
  periodicHz: number | null,
  periodicClarity: number,
  options: FrequencyFusionOptions = {},
): number {
  if (!Number.isFinite(spectralHz) || spectralHz <= 0) return Number.NaN;
  if (!Number.isFinite(periodicHz) || (periodicHz ?? 0) <= 0 ||
      !Number.isFinite(periodicClarity)) return spectralHz;

  const minimumClarity = options.minimumClarity ?? 0.82;
  const maximumAgreementCents = options.maximumAgreementCents ?? 10;
  const maximumWeight = options.maximumIndependentWeight ?? 0.35;
  if (!Number.isFinite(minimumClarity) || minimumClarity < 0 || minimumClarity > 1 ||
      !Number.isFinite(maximumAgreementCents) || maximumAgreementCents <= 0 ||
      !Number.isFinite(maximumWeight) || maximumWeight < 0 || maximumWeight > 0.5 ||
      periodicClarity < minimumClarity) return spectralHz;

  const agreementCents = Math.abs(1200 * Math.log2((periodicHz as number) / spectralHz));
  if (!Number.isFinite(agreementCents) || agreementCents > maximumAgreementCents) return spectralHz;

  // Use a bounded YIN weight: the spectral peak remains authoritative (at least 65%).
  const claritySpan = Math.max(1e-6, 1 - minimumClarity);
  const clarityWeight = Math.max(0, Math.min(1, (periodicClarity - minimumClarity) / claritySpan));
  const independentWeight = maximumWeight * clarityWeight;
  if (independentWeight <= 0) return spectralHz;

  return Math.exp(
    Math.log(spectralHz) * (1 - independentWeight) +
    Math.log(periodicHz as number) * independentWeight,
  );
}
