# Hangoal baseline: feature acceptance map

This document defines the functional baseline for the Hangoal handpan tuner from the supplied feature guide. Runtime behavior is implemented independently in the Hangoal codebase.

## Included reference data

- All 35 supplied .scl files are bundled under public/scales/.
- public/scales/catalog.json indexes every bundled scale for the in-app selector.
- The in-app Scala selector loads bundled scales directly; users do not need to upload the built-in files.
- Manual import remains available for additional user-provided .scl files.
- Source degree order is preserved for bundled presets that intentionally use a non-monotonic list. Standard user imports are validated as ascending intervals by default.

## Functional acceptance checklist

| Capability | Current baseline / remaining work |
| --- | --- |
| Strobe bands with arbitrary offsets | The three original resonance bands remain, with an additional editor for up to eight custom target-frequency bands. Custom bands support enable/disable, rename, Hz target, cent offset, live FFT peak search, cents readout and local persistence. Physical-device accuracy acceptance remains open. |
| Continuous / strike-triggered / off reference tone | Partial: target sine tone exists; per-band three-state modes remain to implement. |
| Base frequency, cents offset, concert reference | Partial: A4 calibration and per-note 2x/3x offsets exist; full global base/transposition model remains. |
| Pitch dial with note and octave selection | Partial: handpan tone-field selection exists; full chromatic dial/octave/transposition remains. |
| Modal note enable/disable and transposition | Not yet implemented to acceptance level. |
| Automatic pitch detection and single-shot/continuous modes | Partial: microphone detection exists; interaction semantics need acceptance tests. |
| Exact peak spectrum, peak hover values, noise-floor suppression, doubled-peak inspection | Partial: spectrum and peak estimation exist; detailed peak inspector and doubled-peak diagnostics remain. |
| Hz / cents / note / just-ratio readout modes | Partial: Hz and cents are present; configurable ratio and note-name display modes remain. |
| Keyboard control and front/rear settings panel | Not yet implemented to acceptance level. |
| Input clipping/level and performance feedback | Partial: input-level metadata exists; live clipping and frame-rate indicators remain. |
| Save and restore tuning configuration | Partial: instrument profiles and preferences exist; full configuration restore needs acceptance tests. |

## Quality gates

1. Every bundled SCL file is selectable without a user upload.
2. Interval ratios and cents values map to expected frequencies; source order is never silently rewritten.
3. Microphone tests cover quiet input, clipping, background noise, strike transients, and doubled peaks.
4. Frequency accuracy is tested against an external reference; software-generated sine tests alone are insufficient.
5. The production build and automated tests pass before merging.
6. Physical-device acceptance covers iPhone Safari/PWA and desktop browsers.

Bundling scale data is only one part of the baseline. Do not describe the application as production-validated until the feature checklist and acoustic/device acceptance tests pass.
