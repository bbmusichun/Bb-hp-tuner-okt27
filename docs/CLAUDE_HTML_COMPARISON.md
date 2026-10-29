# Claude standalone HTML vs. Hangoal application: technical comparison

**Scope.** This review compares the uploaded `bb-tuner-offline (4).html` (standalone HTML/CSS/JavaScript) with the repository's React/TypeScript application as represented by `main`. It is a source-code review, not a claim that either implementation has won a controlled acoustic accuracy test.

## Executive conclusion

Do not replace the Hangoal application with the HTML file wholesale. The HTML is a useful, cohesive working prototype with several user-facing interaction ideas and a distinctive per-band phase-tracking approach. The repository already contains a substantially more testable audio-analysis architecture: spectral peak interpolation, YIN pitch estimation, transient guarding, pitch smoothing/stability tracking, confidence and clipping diagnostics, Scala parsing, instrument profiles, reference-WAV analysis, and a growing automated test suite.

The correct merge strategy is **feature- and algorithm-level migration**, with shared test vectors and explicit acceptance criteria. Port user-facing capabilities when they are missing; port audio algorithms only after comparative signal tests show a measurable improvement.

## Comparison matrix

| Area | Standalone HTML | Hangoal TypeScript app | Assessment / action |
|---|---|---|---|
| Packaging and launch | One self-contained HTML file; convenient to inspect, copy, and run in a compatible browser. | Bundled web app/PWA architecture with modular source files and deployment pipeline. | HTML wins for portability and rapid prototyping; TypeScript app wins for maintainable product development. Preserve the standalone build as a useful test/reference artifact, not as a second production engine. |
| Microphone capture | Requests raw audio with echo cancellation, noise suppression, and auto gain disabled; allows choosing a device. | Requests raw audio and has explicit microphone state/error handling and stream cleanup. | Broadly comparable intent. Verify device selection and lifecycle behavior on iOS/Safari before declaring parity. |
| FFT configuration | Analyser FFT size 32768 and smoothingTimeConstant 0.5. | Live engine uses FFT size 16384 and analyser smoothing 0.05; pitch smoothing is handled separately. | Neither setting is universally better. HTML offers finer nominal bin spacing but heavier/staler spectral averaging; the app responds faster and separates analysis from smoothing. Benchmark on short and long decays, especially D3. |
| Fundamental/note detection | Finds the strongest spectral bin between 55 and 1500 Hz, interpolates the peak parabolically, then looks near its third or second subharmonic if a candidate is within 14 dB. Auto-selects a scale note after repeated nearby detections. | Combines spectral-peak tracking with YIN cross-checking, note-candidate selection, fundamental identifiability checks, and smoothing. | Hangoal has the stronger architecture for rejecting octave/harmonic errors. HTML's compact detector is a useful baseline for test cases, not an automatic replacement. |
| Strobe measurement | Maintains per-band quadrature/phase state in a ScriptProcessorNode callback, estimates phase drift, and converts drift to cents. Each band has its own signal threshold and sideband-based SNR gate. | Tracks configurable bands using the live FFT peak finder and target-relative cents, alongside transient holdoff, confidence, and tuning tolerance. | The HTML's phase/lock-in approach is the most interesting algorithmic candidate to benchmark. However, ScriptProcessorNode is deprecated, and the implementation needs synthetic-tone, detuned-tone, noisy-signal, and real-handpan comparisons before migration. Do not run both engines simultaneously in production. |
| Strobe presentation | Animated per-band bars, signal/no-signal state, threshold coloring, band selection, and a rolling cents stability trace. | Dedicated strobe components, configurable bands, custom targets and offsets, transient handling, and shared measurement state. | Visual concepts can be ported selectively. The existing component system should remain the single UI implementation. |
| Signal quality | Uses a peak threshold and local sideband SNR estimate to decide whether a band is active; displays a rolling cents standard deviation. | Has peak-confidence metrics, transient rejection, input clipping detection, measurement-quality explanations, and diagnostic views. | Hangoal currently has broader diagnostics. Compare the HTML's sideband SNR formula against the repository's prominence/confidence logic using common spectra; don't merge duplicate metrics without evidence. |
| Spectrum | Canvas spectrum with pointer readout for frequency, dB, and frequency relative to the base. | Spectrum, diagnostics, waterfall/spectrogram, pitch benchmark and diagnostic benches. | Hangoal has broader tooling. The HTML's pointer-relative ratio readout is a small UX improvement candidate if missing from the current spectrum UI. |
| Scale catalogue | Bundled popular scales and a larger embedded Scala/temperament catalogue, plus user-created scales. Scala entries are capped to nine notes for the active note list. | Preset scale model, bundled Scala assets/parser, custom scale conversion and selectable notes. | Compare actual scale names, interval arrays, period handling, and labels before importing. Deduplicate by interval data, not by display name. Do not copy the HTML catalogue blindly. |
| Scala import | Reads `.scl` files, supports ratios and cents, and may read inline note labels. Parser is compact and has limited explicit validation. | `parseScalaScl` validates input size/count, positive intervals and ordering (with an explicit option for special source order); conversion is tested. | Repository parser is more defensively validated. Use the HTML catalogue as a source of missing scale data, not as a parser replacement. |
| Strobe target editing | Supports a flexible band list and relative ratios; the HTML's bands are tied to target-frequency multiples. | Custom bands support absolute Hz plus relative ratio/cents modes that remain tied to the selected fundamental, alongside calibration offsets. | The relative target expression is implemented on PR #63; this aligns more closely with Linotune's base-relative target model than resolving every expression once to an absolute Hz value. |
| Profiles and preferences | User profiles, selected scale, reference frequency, transpose, cents correction, active note filtering, and localStorage persistence. | Instrument profiles, A4 reference, scale, partial-target offsets, transposition, readout and reference-tone modes; versioned/validated configuration. | Feature overlap is high. Port any missing controls into the existing profile/config model; avoid a second localStorage schema. |
| Measurement history/export | Saves up to 200 scale measurements to localStorage and exports CSV. | Tuning logs, CSV/JSON backup/config support and repeatability summary features. | Existing app has a more extensible model. Verify that the user-facing measurement workflow covers the HTML's quick save/export path. |
| Reference tone | Per-band sine oscillator with continuous or pulsed modes. | Reference-tone modes and tone-generation support. | Confirm UI parity; port only a missing interaction, not a second audio context or oscillator manager. |
| Tests and validation | Single file; no automated tests were found alongside the uploaded HTML. | Unit tests for pitch, spectra, YIN, clipping, transients, Scala, configuration, WAV analysis, repeatability and other modules. | Hangoal wins on maintainability and regression protection. Build tests around the HTML's distinctive phase tracker before considering migration. |

## Specific HTML techniques worth testing for migration

1. **Per-band phase/lock-in estimator.** The HTML updates quadrature state at each band's target frequency and estimates phase change over time. Test whether it gives a steadier, faster strobe readout than FFT peak tracking at low frequencies and during short decays. Port the mathematics only if results are better across calibrated synthetic signals and recorded handpan samples. If ported, implement it behind the existing TypeScript audio-engine interface; do not retain ScriptProcessorNode in the production design.
2. **Relative-frequency spectrum hover.** The display of Hz, dB, and ratio to the base frequency is a compact and useful diagnostic. Add it only if the existing spectrum interaction does not already provide the same information.
3. **Quick measurement save/export flow.** Compare the HTML's one-action save and per-note CSV with the existing measurement log. If the current workflow takes more steps, port the interaction while writing to the existing log model.
4. **Scale-catalogue content.** Extract scale data and compare interval sequences and period values to bundled Scala files. Add only genuinely missing or corrected entries, with provenance and tests.

## Existing Hangoal advantages to preserve

- Independent YIN pitch estimate and spectral candidate selection.
- Transient detection/holdoff and pitch smoothing.
- Peak confidence, fundamental-identifiability, input-clipping and measurement-quality diagnostics.
- Validated Scala parser and custom-scale conversion.
- Instrument profiles and validated configuration import/export.
- Reference WAV analysis and repeatability-oriented tests.
- Modular components and automated tests.

## Recommended acceptance process

1. Use the same generated signals and WAV samples for both implementations: sine waves, harmonic-rich tones, detuned tones at known cent offsets, low-SNR tones, multiple simultaneous partials, attacks and decays, and silence/noise.
2. Record error in cents, time to stable reading, false-positive rate, octave/fifth mistakes, loss-of-signal behavior, CPU load and memory use. Include the D3/A3/D4 handpan resonances and sample-rate variation.
3. Run the same real handpan recordings and then physical iPhone/Safari tests. A software test alone cannot validate microphone response or acoustic accuracy.
4. Merge a candidate only if it improves a defined metric without regressing another accepted behavior. Keep all measurements reproducible in automated tests.

## Current implementation note

PR #63 adds custom strobe target expressions in absolute Hz, ratio/multiplier (for example 3/2 or x1.5), or cents (for example 700c) relative to the currently selected fundamental. Relative targets stay coupled to the selected note as it changes, matching the supplied Linotune guide's base-relative target concept. The separate Linotune gap matrix is in docs/LINOTUNE_REFERENCE_GAP_ANALYSIS.md. This is an incremental step, not the full merger. Physical microphone validation remains outstanding.
