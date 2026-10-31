# Hangoal real-handpan benchmark — D3 sample

## Reference recording

- File: `Handpan d3.wav`
- Duration: 4.825011 s
- Sample rate: 44,100 Hz
- Channels: stereo; the two channels are identical in this recording, so the analysis uses their mono average.
- This is a real struck-instrument recording, not a synthesized sine reference.

## Offline analysis method

The values below are a preliminary reproducible baseline, not a certified tuning result. The recording was divided into overlapping 16,384-sample windows (about 371.5 ms at 44.1 kHz). Each window used a Blackman taper, an FFT, local-maximum selection around each expected resonance, and parabolic interpolation of the logarithmic magnitudes. The analysis used the same nominal 16,384-point resolution as the live analyser, but it is not bit-identical to browser Web Audio processing: browser sample-rate conversion, analyser smoothing, microphone response, and live timing can change the result.

The nominal D3 targets used for comparison are:

| Resonance | Nominal target |
|---|---:|
| D3 fundamental (1×) | 146.832384 Hz |
| D4 octave (2×) | 293.664768 Hz |
| D3 third partial (3×) | 440.497152 Hz |

## Stable-decay baseline

Across windows beginning between 0.50 s and 3.50 s:

| Channel | Median measured | Range across windows | Median deviation |
|---|---:|---:|---:|
| D3 fundamental | 146.675 Hz | 146.157–146.766 Hz | −1.86 cents |
| D4 octave | 293.505 Hz | 293.374–293.571 Hz | −0.94 cents |
| D3 third partial | 441.344 Hz | 441.288–441.520 Hz | +3.33 cents |

The D3 fundamental varies more across the decay than the other two resonances. This should not be hidden by aggressive smoothing: Hangoal should retain the time history and distinguish a stable reading from a changing or ambiguous one.

## Attack and late-decay observations

- The first window (0.00 s) gives a D3 peak near 147.832 Hz (+11.7 cents against the nominal target), illustrating why the attack/transient window must not be treated as the settled pitch.
- At 0.15 s, D3 is near 146.772 Hz (−0.7 cents); at 0.30 s it is near 146.265 Hz (−6.7 cents). The early decay is not stationary.
- Near 4.00 s, the D3 target window contains two similarly strong local peaks near 157.948 Hz and 140.248 Hz. A single strongest-peak readout would be misleading here. The live tuner should flag this frame as ambiguous rather than calling it a valid stable pitch.


## Second real instrument — Yishama D3 sample

A second, independently recorded D3 handpan sample was analysed to check whether the resonance relationships from the first instrument generalize.

- File: `Handpan d3 yishama(1).wav`
- Duration: 6.653243 s
- Sample rate: 44,100 Hz
- Channels: stereo with identical left/right channels.
- This is another real struck-instrument recording, not a synthesized test tone.

Using overlapping 32,768-sample Blackman windows (about 743 ms) and parabolic interpolation of log magnitudes, the stable section from 0.55 s to 2.8 s produced:

| Channel | Median measured | Median deviation | 10th–90th percentile deviation |
|---|---:|---:|---:|
| D3 fundamental (1×) | 147.102 Hz | +3.18 cents | +2.04 to +3.85 cents |
| D4 octave resonance (2×) | 292.362 Hz | −7.70 cents | −9.35 to −7.17 cents |
| D3 third partial (3×) | 441.492 Hz | +3.91 cents | +2.58 to +4.79 cents |

The D4 resonance is notably flatter than the exact 2× of the measured D3 fundamental: 2 × 147.102 Hz = 294.204 Hz, while the independently measured D4 resonance is 292.362 Hz. This is why Hangoal must measure 1×, 2×, and 3× independently instead of deriving partials from a harmonic ratio.

## Local spectral-prominence check

The new tracking gate also considers how far a peak rises above the local spectral floor, rather than relying only on its absolute dBFS level. An offline 16,384-point Blackman FFT check of the Yishama recording used 13 windows beginning from 0.55 s through 2.8 s. For each resonance, the local floor was the median dB magnitude in its ±150-cent target window after excluding the five bins centred on the strongest peak.

| Channel | Median peak prominence | 10th–90th percentile |
|---|---:|---:|
| D3 fundamental (1×) | 43.4 dB | 32.2–49.4 dB |
| D4 octave resonance (2×) | 41.6 dB | 32.5–45.8 dB |
| D3 third partial (3×) | 57.3 dB | 51.5–59.5 dB |

These values are comfortably above the initial 8 dB software gate for this recording. They do not establish a universal threshold: a different phone microphone, room noise, or instrument may produce lower prominence. The gate therefore remains an engineering safeguard that must be checked with browser playback and the target microphone, not a certified SNR standard.

## Acceptance implications

1. Keep attack rejection separate from stable-decay measurement.
2. Do not turn a changing or split peak into a confident single frequency through smoothing.
3. Track 1×, 2×, and 3× independently; their decay envelopes and stability differ.
4. Keep the raw measured frequency, target frequency, cents deviation, and confidence/status tied to the same analysis frame.
5. Keep the live RMS presence gate at −72 dBFS so the 3.75 s frame (about −70.7 dBFS RMS) can still contribute its D4 and 3× readings; the 4.00 s frame (about −81.4 dBFS RMS) remains below the gate. Per-channel peak confidence and four-frame stability checks still determine whether a reading is valid.
6. Validate the same recording through Hangoal's browser audio-file input, then compare against microphone input and an external reference tuner. The offline numbers above are a benchmark baseline, not a claim of full reference-tuner parity.

## Live-engine FFT-size offline check (16,384 samples)

The production audio engine currently uses a 16,384-sample analyser FFT, so the Yishama sample was also evaluated at that exact FFT size. This check used a Blackman window, 2,048-sample hop, parabolic interpolation in log-magnitude space, and the same ±150-cent target windows and ±2-bin exclusion used by the application prominence calculation. The 52 overlapping frame centres between 0.60 s and 3.00 s produced:

| Resonance | Median measured | Median deviation | 10th–90th percentile deviation | Median prominence | 10th percentile prominence |
|---|---:|---:|---:|---:|---:|
| D3 fundamental (1×) | 147.043 Hz | +2.48 cents | +1.23 to +3.84 cents | 41.4 dB | 29.3 dB |
| D4 octave resonance (2×) | 292.371 Hz | −7.64 cents | −11.04 to −0.31 cents | 42.0 dB | 33.2 dB |
| D3 third partial (3×) | 441.253 Hz | +2.97 cents | +1.81 to +6.16 cents | 56.6 dB | 51.9 dB |

No frame in this stable section was flagged as ambiguous by the competing-peak rule. The early attack is deliberately excluded: the 16,384-sample window spans about 371 ms at 44.1 kHz, and frames centred in the first 0.6 s still contain substantial transient motion. This is an offline signal-processing check aligned to the engine's FFT size, not a browser/phone microphone acceptance test. In particular, it does not certify the absolute dBFS gate or the 8 dB prominence threshold across devices; those still require live validation.

The same recording was also resampled from 44.1 kHz to 48 kHz before applying the 16,384-sample analysis, to check the other common Web Audio context rate. Across 56 frame centres from 0.60 s to 3.00 s:

| Resonance | Median measured | Median deviation | 10th–90th percentile deviation | Median prominence | 10th percentile prominence |
|---|---:|---:|---:|---:|---:|
| D3 fundamental (1×) | 147.076 Hz | +2.87 cents | +0.94 to +4.82 cents | 42.2 dB | 31.9 dB |
| D4 octave resonance (2×) | 292.374 Hz | −7.63 cents | −10.15 to −1.87 cents | 42.1 dB | 34.9 dB |
| D3 third partial (3×) | 441.240 Hz | +2.92 cents | +1.84 to +6.06 cents | 56.4 dB | 51.6 dB |

The 44.1 kHz and resampled 48 kHz results are close, especially for the independently measured D4 resonance. Resampling here is an offline approximation of the common 48 kHz audio-context path; it is not a measurement from Safari or an iPhone microphone.
