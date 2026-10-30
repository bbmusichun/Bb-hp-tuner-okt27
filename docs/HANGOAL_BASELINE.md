# Hangoal baseline: feature acceptance map

This document defines the functional baseline for the Hangoal handpan tuner from the supplied feature guide. Runtime behavior is implemented independently in the Hangoal codebase.

## Included reference data

- All 35 supplied .scl files are bundled under public/scales/.
- public/scales/catalog.json indexes every bundled scale for the in-app selector.
- The in-app Scala selector loads bundled scales directly; users do not need to upload the built-in files.
- Manual import remains available for additional user-provided .scl files.
- Scala `!!reference` metadata can be resolved into an absolute scale-root frequency from the marked degree. Explicit Hz is authoritative; otherwise a standard pitch label is resolved through the current A4 reference. Applying the anchor is an explicit, opt-in import choice; the global A4 setting is never changed. The resulting exact-frequency note list is saved with the instrument profile.
- Source degree order is preserved for bundled presets that intentionally use a non-monotonic list. Standard user imports are validated as ascending intervals by default.

## Reproducible synthetic reference benchmark

- The offline WAV laboratory can generate and analyse 18 deterministic software signals using the actual production WAV analyser.
- Coverage includes clean D3, A3 and D4 notes; signed detuning (−10 to +25 cents); independent 2×/3× inharmonic offsets; a deliberately wrong octave target; a weak root with stronger upper partials; deterministic broadband noise; low-level input; clipping; and silence.
- Every measurable partial is compared with the exact frequency used to generate that component. The report keeps target deviation separate from residual analyser error, so an inharmonic partial is not incorrectly treated as an analyser failure.
- The octave-error case reports the difference between the selected candidate target and the true generated root, as well as the analyser's identifiability reasons.
- The transient/decay case analyses overlapping frames and reports how many windows retain a measurable fundamental, plus the first and last valid frame times.
- The split-peak case uses the production peak inspection heuristic to report a possible nearby double resonance.
- A five-profile sweep compares 44.1 kHz at FFT 8192/16384/32768 and 48 kHz at FFT 16384/32768. It reports per-profile residual frequency error and valid fundamental-frame coverage.
- Synthetic results are repeatable and suitable for regression testing. They are not an external frequency standard and do not validate microphone response, room acoustics, handpan radiation or absolute physical accuracy.
- Remaining benchmark work: add an automated latency/UI-FPS and processor-load report, extend profile coverage to 96 kHz and alternative window functions, and validate signal thresholds against actual recorded handpan data. Physical comparison against an external calibrated reference remains mandatory.

## Functional acceptance checklist

| Capability | Current baseline / remaining work |
| --- | --- |
| Strobe bands with arbitrary offsets | The three original resonance bands remain, with an additional editor for up to eight custom target-frequency bands. Custom bands support enable/disable, rename, Hz/ratio/cents target expression, cent offset, live FFT peak search, cents readout and local persistence. A valid measured peak can calibrate the custom band's target to zero deviation by changing only its cent offset; measurement values and historical logs are not modified. Physical-device accuracy acceptance remains open. |
| Continuous / strike-triggered / off reference tone | The currently selected core resonance supports continuous playback while the mic is stopped, a 120 ms strike cue, or off. Each custom strobe lane now has its own persisted off/continuous/strike mode. Continuous custom tones play the exact resolved lane target and are disabled during microphone measurement; all enabled custom strike tones can join the selected core cue in one gain-limited 120 ms stack. Legacy lanes default to off. Independent mode selection for the three core resonances exists in the separate PR #74 branch and still needs integration into this stacked train. Real speaker/headphone loopback acceptance remains open. |
| Base frequency, cents offset, concert reference | A4 calibration and per-note 2×/3× offsets remain; a persisted global scale transpose of −12 to +12 semitones is now available. The direct chromatic dial target is absolute and deliberately is not shifted by this scale-only control. |
| Pitch dial with note and octave selection | Added a 12-semitone chromatic dial with octave 1–6; out-of-scale notes can become the tuning target and use the active A4 reference plus that note's stored partial calibration. Scale-wide transposition is implemented separately. |
| Modal note enable/disable and transposition | Per-scale enable/disable is implemented for the handpan tone field and automatic detection, with local persistence and protection against disabling the last active note. Global scale transposition is implemented. |
| Automatic pitch detection and single-shot/continuous modes | Added continuous, single-shot and off modes. Single-shot latches after three consistent frames and can be re-armed with the mode button; state is backward-compatible with the previous AUTO boolean preference. Real-device timing acceptance remains open. |
| Exact peak spectrum, peak hover values, noise-floor suppression, doubled-peak inspection | Full spectrum/waterfall and live diagnostic panel are present. The panel estimates the median noise floor and flags possible near-target double peaks without changing the tuning result; heuristic and physical-device validation remain open. |
| Hz / cents / note / just-ratio readout modes | Measurement cards now offer persisted Hz, cent, measured note-name and measured ratio-to-fundamental modes. Ratio mode also reports the corresponding target ratio; tests cover missing-data behavior. |
| Keyboard control and front/rear settings panel | Global tuning shortcuts are implemented for note navigation, resonance selection, microphone start/stop, detection mode cycling/re-arming, and reference tone (only where safe), with an on-screen help panel. Keyboard support in settings/front-rear panel remains out of scope. |
| Input clipping/level and performance feedback | Live analysis-cycle FPS is shown next to sample rate and input level. The analyzer reports a separate near-full-scale peak warning (peak ≥0.999) in addition to the existing high RMS-level warning. Settings show the actual 16,384-point FFT and the reported browser AGC state. Hardware/browser acceptance remains required; this is a near-clipping indicator, not proof of audible distortion. |
| Audio input/output routing | The app enumerates microphone and output devices. A selected input is passed as an exact `deviceId` to `getUserMedia`; stale/unavailable device IDs fall back to the default input only for device-constraint errors. The shared Web Audio output can use `AudioContext.setSinkId` in supporting browsers. Device IDs persist locally and in full backups. iOS Safari uses the OS audio route because programmatic sink selection is not supported there. Manual permission, unplug/replug, Bluetooth and iPhone acceptance remains open. |
| Save and restore tuning configuration | Full schema-versioned configuration export/import is implemented for profiles, active profile, A4 and partial calibration (via profiles), detection/readout/reference modes, tolerance (Auto, fixed cent, always accepted, never green), transposition, disabled tone fields, custom strobe bands and measurement logs. Entire bundle validation happens before applying app state; older profile-only backups remain importable. Browser-storage failure and large-backup behavior remain acceptance checks. |

## Quality gates

1. Every bundled SCL file is selectable without a user upload.
2. Interval ratios and cents values map to expected frequencies; source order is never silently rewritten.
3. Microphone tests cover quiet input, clipping, background noise, strike transients, and doubled peaks.
4. Frequency accuracy is tested against an external reference; software-generated sine tests alone are insufficient.
5. The production build and automated tests pass before merging.
6. Physical-device acceptance covers iPhone Safari/PWA and desktop browsers.

Bundling scale data is only one part of the baseline. Do not describe the application as production-validated until the feature checklist and acoustic/device acceptance tests pass.
