# Scala scale library

This directory contains the five `.scl` files supplied for the BB Tuner scale library. The original file contents are preserved so they can be used as source data for a future Scala import workflow.

## Included files

- `Circle of Fifths.scl` — 12-tone equal temperament, listed in circle-of-fifths order.
- `Quarter-Tone Equal.scl` — 24-tone equal temperament.
- `Sacred Solfeggio.scl` — Solfeggio frequency ratios referenced to 174; these entries are not a conventional ascending, single-octave Scala interval list.
- `Integral Hang (just).scl` — just-intonation ratios labelled for the Integral Hang.
- `Golden Gate (just).scl` — just-intonation ratios labelled for the Golden Gate / Halo scale.

## Import note

A Scala `.scl` file normally describes successive intervals, with the final entry defining the scale period. The supplied files are kept verbatim, but they do not all use that conventional structure in the same way: the Circle of Fifths file is deliberately reordered, and Sacred Solfeggio lists frequency ratios above the octave before ending with `2/1`. An importer should validate and handle those cases explicitly rather than silently sorting or rewriting the source data.

These files are static assets under `/scales/`; adding them to this directory does not by itself make them selectable in the app UI.
