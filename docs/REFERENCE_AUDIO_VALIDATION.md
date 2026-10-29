# Reference audio validation and measurement limits

This document describes the checks that are possible with reference audio and what those checks can and cannot prove.

## Why a generated sine is not a calibration

A digitally generated sine has a known sample rate and generated period, so it is useful for testing pitch tracking, FFT interpolation and cents arithmetic. It does not pass through the physical microphone, analogue front end, operating-system processing, environmental reflections or the instrument itself. It therefore cannot validate the complete acoustic measurement chain.

## Recommended validation workflow

1. Use deterministic generated signals to regression-test algorithm behavior.
2. Use known-frequency WAV recordings to verify the offline analysis path.
3. Use a real handpan and repeat strikes to evaluate stability under a fixed recording setup.
4. Compare against an independently calibrated frequency reference and document the setup before making absolute accuracy claims.

Record the device model, operating system, browser, microphone path, distance to the instrument, room conditions, input level, reference instrument and resulting frequency/cents differences.

## Interpreting quality and identifiability

The peak-quality and fundamental-identifiability checks use engineering thresholds to describe the signal observed by the software. They are diagnostic aids, not calibrated confidence intervals. A strong, repeatable spectrum can still be offset by microphone or operating-system behavior, and a handpan may have inharmonic partials. Review ambiguous and unidentified readings instead of presenting a single peak as a confirmed fundamental.

## Hangoal measurement quality feedback

The WAV-based multi-window quality assessment provides human-readable Hungarian feedback about repeatability and important limitations. “Ismételhető mérés” means only that coverage, stability, signal level, and local peak prominence pass the current software criteria. It is not calibrated confidence, certified measurement uncertainty, or proof of absolute accuracy against an external frequency reference.

Quality reasons are labeled separately: no measurement, too few windows, low coverage, unstable frequency, weak peak, or low peak prominence. The text feedback does not modify measured frequency or cents deviation. Real microphone and device testing remains a required release check.
