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
| Continuous / strike-triggered / off reference tone | Global mode selector added for the currently selected resonance: continuous manual playback only while the mic is stopped, a 120 ms pulse on the rising edge of the transient guard, or off. Target changes and mic-state changes stop output. Per-band mode assignment and real-device acoustic validation remain open. |
| Base frequency, cents offset, concert reference | A4 calibration and per-note 2×/3× offsets remain; a persisted global scale transpose of −12 to +12 semitones is now available. The direct chromatic dial target is absolute and deliberately is not shifted by this scale-only control. |
| Pitch dial with note and octave selection | Added a 12-semitone chromatic dial with octave 1–6; out-of-scale notes can become the tuning target and use the active A4 reference plus that note's stored partial calibration. Scale-wide transposition is implemented separately. |
| Modal note enable/disable and transposition | Per-scale enable/disable is implemented for the handpan tone field and automatic detection, with local persistence and protection against disabling the last active note. Global scale transposition is implemented. |
| Automatic pitch detection and single-shot/continuous modes | Added continuous, single-shot and off modes. Single-shot latches after three consistent frames and can be re-armed with the mode button; state is backward-compatible with the previous AUTO boolean preference. Real-device timing acceptance remains open. |
| Exact peak spectrum, peak hover values, noise-floor suppression, doubled-peak inspection | Full spectrum/waterfall and live diagnostic panel are present. The panel estimates the median noise floor and flags possible near-target double peaks without changing the tuning result; heuristic and physical-device validation remain open. |
| Hz / cents / note / just-ratio readout modes | Measurement cards now offer persisted Hz, cent, measured note-name and measured ratio-to-fundamental modes. Ratio mode also reports the corresponding target ratio; tests cover missing-data behavior. |
| Keyboard control and front/rear settings panel | Global tuning shortcuts are implemented for note navigation, resonance selection, microphone start/stop, detection mode cycling/re-arming, and reference tone (only where safe), with an on-screen help panel. Keyboard support in settings/front-rear panel remains out of scope. |
| Input clipping/level and performance feedback | Live analysis-cycle FPS is shown next to sample rate and input level. The analyzer reports a separate near-full-scale peak warning (peak ≥0.999) in addition to the existing high RMS-level warning. Hardware/browser acceptance remains required; this is a near-clipping indicator, not proof of audible distortion. |
| Save and restore tuning configuration | Full schema-versioned configuration export/import is implemented for profiles, active profile, A4 and partial calibration (via profiles), detection/readout/reference modes, tolerance, transposition, disabled tone fields, custom strobe bands and measurement logs. Entire bundle validation happens before applying app state; older profile-only backups remain importable. Browser-storage failure and large-backup behavior remain acceptance checks. |

## Quality gates

1. Every bundled SCL file is selectable without a user upload.
2. Interval ratios and cents values map to expected frequencies; source order is never silently rewritten.
3. Microphone tests cover quiet input, clipping, background noise, strike transients, and doubled peaks.
4. Frequency accuracy is tested against an external reference; software-generated sine tests alone are insufficient.
5. The production build and automated tests pass before merging.
6. Physical-device acceptance covers iPhone Safari/PWA and desktop browsers.

Bundling scale data is only one part of the baseline. Do not describe the application as production-validated until the feature checklist and acoustic/device acceptance tests pass.
