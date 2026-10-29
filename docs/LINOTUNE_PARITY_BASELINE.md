# Linotune-level baseline: feature acceptance map

This document translates the supplied Linotune 1.14 guide into an independent BB Tuner implementation plan. It is not a copy of Linotune's code or executable.

## Included reference data

- All 35 .scl files from the supplied archive are bundled under public/scales/.
- public/scales/catalog.json indexes every bundled scale for the in-app selector.
- The in-app Scala selector loads bundled scales directly; users do not need to upload these supplied files.
- The manual import remains available for additional user-provided .scl files.
- The parser preserves source degree order, including the supplied non-monotonic Circle of Fifths and Sacred Solfeggio lists. It does not silently sort their intervals.

## Functional parity checklist

| Reference feature | BB Tuner baseline |
| --- | --- |
| Strobe bands with arbitrary offsets | Partial: three resonance bands exist; editable arbitrary bands remain to implement. |
| Continuous / strike-triggered / off reference tone | Partial: target sine tone exists; per-band three-state modes remain to implement. |
| Base frequency, cents offset, concert reference | Partial: A4 calibration and per-note 2x/3x offsets exist; full global base/transposition model remains. |
| Pitch dial with note and octave selection | Partial: handpan tone-field selection exists; full chromatic dial/octave/transposition is not yet equivalent. |
| Modal note enable/disable and transposition | Not yet equivalent. |
| Automatic pitch detection and single-shot/continuous modes | Partial: microphone detection exists; interaction semantics need parity tests. |
| Exact peak spectrum, peak hover values, noise-floor suppression, doubled-peak inspection | Partial: spectrum and peak estimation exist; detailed peak inspector and doubled-peak diagnostics remain. |
| Hz / cents / note / just-ratio readout modes | Partial: Hz and cents are present; configurable ratio and note-name display modes remain. |
| Keyboard control and front/rear settings panel | Not yet equivalent. |
| Input clipping/level and performance feedback | Partial: input-level metadata exists; live clipping and frame-rate indicators remain. |
| Save and restore tuning configuration | Partial: instrument profiles and preferences exist; complete session/configuration parity needs acceptance tests. |

## Quality gates

1. Every bundled SCL file is selectable without a user upload.
2. Interval ratios and cents values map to expected frequencies; source order is never silently rewritten.
3. Microphone tests cover quiet input, clipping, background noise, strike transients, and doubled peaks.
4. Frequency accuracy is tested against an external reference; software-generated sine tests alone are insufficient.
5. The production build and automated tests pass before merging.
6. Physical-device acceptance covers iPhone Safari/PWA and desktop browsers.

## Important distinction

Bundling reference files and exposing the Scala library is only one part of parity. The application must not be described as fully Linotune-equivalent until the remaining feature checklist is implemented and acoustic/device acceptance tests pass.
