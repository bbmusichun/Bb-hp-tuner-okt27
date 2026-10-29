# Reference-audio validation protocol

## Three separate validation layers

1. **Digital sine references** are the algorithm ground truth. The generated frequency is known, and automated tests require the shared spectral peak finder to remain within 1 cent over supported sample rates, FFT sizes, and intentional detuning.
2. **Real handpan WAV recordings** are regression and diagnostic material. They test whether the analysis behaves sensibly on attacks, decays, weak partials, and complex spectra. They are not calibrated frequency standards.
3. **Live microphone tests** validate the full device path, including microphone response, operating-system processing, room noise, placement, and live timing. Passing the digital tests does not prove acoustic calibration.

## Known reference targets

For an equal-tempered D3 reference with A4 = 440 Hz:

- D3 fundamental: 146.832384 Hz
- D4 octave: 293.664768 Hz
- D3 third partial (3 × D3): 440.497152 Hz
- Equal-tempered A4: 440.000000 Hz

The D3 third partial and equal-tempered A4 are different targets by about 1.96 cents. Do not silently substitute one for the other.

## User-supplied diagnostic recordings

The following files were supplied for development and are intentionally not committed to this repository:

- `Handpan d3.wav` — Mudra D3
- `Handpan d3 yishama.wav` — Yishama D3

A preliminary offline pass used mono downmix, 44.1 kHz source rate, 16,384-sample Blackman windows, and an 8,192-sample hop. The rough median offsets from the nominal D3, 2×D3, and 3×D3 targets were:

| Recording | D3 fundamental | 2×D3 | 3×D3 |
|---|---:|---:|---:|
| Mudra D3 | -1.76 cents | -0.98 cents | +3.50 cents |
| Yishama D3 | +2.18 cents | -7.42 cents | +3.16 cents |

These are **preliminary diagnostics only**, not certified tuning measurements. The Yishama D4 region includes weak/ambiguous frames, and both recordings contain attack/decay variation. Always inspect the time series and peak strength; do not use a single median as a claim that the instrument is in or out of tune.

## Repeatable workflow

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Run `/?benchmark=sine` to verify digital measurement accuracy.
3. Run `/?benchmark=wav` and analyze both supplied recordings locally.
4. Compare the per-window frequencies, cents, signal levels, and local peak prominence. Peak prominence is the detected peak level minus the median spectrum level in its target band; treat it as a diagnostic contrast metric, not a calibrated confidence score. Exclude no frames silently; invalid peaks must remain blank and weak/ambiguous readings must be identified.
5. Run the live microphone lab on the target device. Keep the acoustic loopback test separate from digital accuracy.
6. Before describing the app as professionally calibrated, validate against a traceable external frequency reference and document device, microphone, distance, level, sample rate, and measurement uncertainty.


## Offline measurement quality (WAV lab)

A cents value from one analysis window is not a tuning result. `src/audio/measurementQuality.ts`
aggregates the per-window metrics into one explicit verdict per partial — fundamental (1×),
octave (2×), third partial (3×) — and lists the criteria that limited it:

| Criterion | Reliable | Marginal | Insufficient |
|---|---|---|---|
| Valid windows / analysed windows | ≥ 0.60 | ≥ 0.25 | < 0.25 |
| Robust spread (MAD of cents) | ≤ 3 cent | ≤ 10 cent | > 10 cent |
| Median peak level | ≥ −70 dBFS | ≥ −80 dBFS | < −80 dBFS |
| Median local prominence | ≥ 12 dB | ≥ 6 dB | < 6 dB |
| Analysed windows with a reading | ≥ 3 | — | — |

Rationale:

- **Coverage** shows whether the partial is repeatable. A reading present in most windows can
  be compared across windows; one present in a single window describes that window only.
- **Spread** (median absolute deviation of the cents readings) is robust against a single
  outlier frame. 3 cents is far below any handpan tuning tolerance and survives FFT-bin and
  framing noise; 10 cents means the windows disagree about the pitch.
- **Peak level** reuses the live tuner's criterion in `peakConfidence.ts`: −80 dBFS is
  measurable but too weak to be called a reliable tuning reading.
- **Prominence** is the detected peak minus the median level of its own ±150-cent band. Below
  ~6 dB the "peak" is not separable from noise or window leakage, so it must not be reported
  as a partial.
- **Window count** prevents a stable-looking claim from one or two frames.

The verdict is an engineering criterion, not a calibrated uncertainty: the module deliberately
returns no confidence percentage and no error bound. `insufficient` means the app must not be
used to judge that partial from this recording; `marginal` means inspect the time series and
the peak/prominence columns before trusting the median.

## Fundamental identifiability (harmonic structure)

A handpan tone field is not a single sine: the tone radiates a fundamental, a strong
octave (2×) and a twelfth (3×), and the octave is often louder than the fundamental. That
is exactly what makes the classic pitch error possible — the analyser locks onto a partial
and every cents reading is then off by an octave. `src/audio/fundamentalIdentifiability.ts`
checks, per window, whether the spectrum supports the analysed target **as the root of a
harmonic series**:

| Evidence | Criterion |
|---|---|
| Octave (2×) | peak within ±150 cents of 2× the target, at most 30 dB below the fundamental, and within 60 cents of 2× the *measured* fundamental |
| Twelfth (3×) | peak within ±150 cents of 3× the target, at most 30 dB below the fundamental |
| Lower root (target / 2, target / 3) | no peak closer than 6 dB to the fundamental, otherwise the target may itself be that lower note's partial |

Verdicts:

- `identified` — the fundamental plus at least one upper partial form a consistent series and
  no comparable lower root exists.
- `ambiguous` — the series exists but one partial is missing or misplaced, or a lower root is
  about as loud as the target (octave/twelfth error).
- `unidentified` — no fundamental peak, or no upper partial at all: a lone spectral peak is not
  a handpan fundamental and must not be reported as an identified note.

Over a recording, the per-window verdicts are aggregated by share of identified windows
(≥ 0.60 identified, ≥ 0.25 ambiguous, below that unidentified), and the limiting reasons are
listed. The 30 dB, 6 dB and 60 cent thresholds are engineering criteria chosen to tolerate
handpan inharmonicity; they are **not validated against a corpus of real recordings** yet, so
treat a `marginal`/`ambiguous` verdict as a prompt to inspect the spectrum, not as a
calibration result.

## Repeatable workflow

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Run `/?benchmark=sine` to verify digital measurement accuracy.
3. Run `/?benchmark=wav` and analyze both supplied recordings locally.
4. Compare the per-window frequencies, cents, signal levels, local peak prominence, and the per-partial quality verdict (see above). Peak prominence is the detected peak level minus the median spectrum level in its target band; treat it as a diagnostic contrast metric, not a calibrated confidence score. Exclude no frames silently; invalid peaks must remain blank and weak/ambiguous readings must be identified.
5. Run the live microphone lab on the target device. Keep the acoustic loopback test separate from digital accuracy.
6. Before describing the app as professionally calibrated, validate against a traceable external frequency reference and document device, microphone, distance, level, sample rate, and measurement uncertainty.


## Custom per-note partial targets

The live tuner supports independent offsets for the octave (2×) and third partial (3×) for each
note in the selected scale. These offsets are expressed in cents relative to the ideal harmonic
frequency and are stored in the active physical instrument profile, keyed by scale and note.
Changing the global A4 reference recalculates an equal-tempered preset fundamental; the saved
partial offsets remain relative to the selected fundamental. A custom scale may instead supply an
exact fundamental target frequency for each note. Resetting a note's offsets restores the ideal
2×/3× targets for that note.

These controls let a maker compare a tone field with an instrument-specific target instead of
assuming every real tone field is exactly harmonic. They do not automatically discover the
correct target frequencies, and they do not certify a handpan as in tune. Record the intended
targets from the instrument's specification or a traceable tuning reference before using the
offsets for acceptance measurements.

## Exact custom fundamental targets

The settings dialog can define a custom tone field with 2–24 rows in `note name, frequency Hz`
format, for example `D3, 146.900`. Every row's finite target frequency (20–2000 Hz) is retained
as entered and used as the live fundamental target; it is not rounded to the nearest equal-tempered
MIDI pitch. Note names must be unique within the custom scale. The custom scale is saved in the
active physical instrument profile and is included in the versioned JSON profile backup. Validate
the target values against the instrument maker's specification or an external reference before using
them for acceptance decisions.


## Auditable live measurement records

The live measurement log stores the measured frequency and the target frequency separately for
the fundamental, octave and third partial. CSV exports therefore preserve the actual target used
for each recorded cent deviation, including custom per-note partial offsets. Older saved log
entries may not contain target-frequency fields; they remain readable, but their target values
are shown as unavailable. For professional records, export the log after capturing measurements
and retain the instrument profile and external reference information used during the session.


## Repeatability summary

The live logbook can summarize the ten most recent captures for the same scale profile and tone
field. It reports the median cent deviation, median absolute deviation (MAD), and full observed
range separately for the fundamental, third partial and octave. At least three captures are
required. Only records that contain a scale identity are included, so legacy records are not
silently mixed across unknown profiles.

These statistics describe repeatability of the captured readings only. They are not a calibrated
measurement uncertainty, and repeatability cannot detect a consistently wrong harmonic or an
incorrectly selected spectral peak. Keep the microphone placement, distance, input path and
instrument condition consistent when comparing sessions.


## Physical instrument profiles and backups

Each physical instrument profile owns its scale, A4 reference and per-note partial offsets. The
measurement record stores the profile ID and display name so readings from instruments with
similar scales can remain distinguishable. The repeatability summary filters to the active physical
instrument.

Use Settings → Profilok exportja to create a versioned JSON backup of profiles and exact custom
targets. Import merges by profile ID after validating the backup; invalid files are rejected before
application state changes. Profiles and measurement logs remain local to the browser and are not
cloud-synchronised.

## Capture metadata in exported records

New live log entries record the active audio sample rate and the current input level in dBFS
alongside the scale profile and measured/target frequencies. These fields are included in CSV
exports to help compare runs made under different browser/device conditions. Older records remain
valid with these fields absent. Input level is a snapshot of the app's input meter, not a calibrated
sound-pressure level (dB SPL); it must not be interpreted as acoustic loudness or used to compare
microphone sensitivity without a calibrated acoustic reference.
