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

## Repeatable workflow

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Run `/?benchmark=sine` to verify digital measurement accuracy.
3. Run `/?benchmark=wav` and analyze both supplied recordings locally.
4. Compare the per-window frequencies, cents, signal levels, local peak prominence, and the per-partial quality verdict (see above). Peak prominence is the detected peak level minus the median spectrum level in its target band; treat it as a diagnostic contrast metric, not a calibrated confidence score. Exclude no frames silently; invalid peaks must remain blank and weak/ambiguous readings must be identified.
5. Run the live microphone lab on the target device. Keep the acoustic loopback test separate from digital accuracy.
6. Before describing the app as professionally calibrated, validate against a traceable external frequency reference and document device, microphone, distance, level, sample rate, and measurement uncertainty.
