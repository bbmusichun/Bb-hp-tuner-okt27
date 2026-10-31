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

## Acceptance implications

1. Keep attack rejection separate from stable-decay measurement.
2. Do not turn a changing or split peak into a confident single frequency through smoothing.
3. Track 1×, 2×, and 3× independently; their decay envelopes and stability differ.
4. Keep the raw measured frequency, target frequency, cents deviation, and confidence/status tied to the same analysis frame.
5. Keep the live RMS presence gate at −72 dBFS so the 3.75 s frame (about −70.7 dBFS RMS) can still contribute its D4 and 3× readings; the 4.00 s frame (about −81.4 dBFS RMS) remains below the gate. Per-channel peak confidence and four-frame stability checks still determine whether a reading is valid.
6. Validate the same recording through Hangoal's browser audio-file input, then compare against microphone input and an external reference tuner. The offline numbers above are a benchmark baseline, not a claim of full reference-tuner parity.


---

## Second real-instrument reference — Yishama D3

- File: `Handpan d3 yishama(1).wav`
- Duration: 6.653243 s
- Sample rate: 44,100 Hz
- Channels: stereo; left and right channels are identical in the supplied recording.
- This is a second physical instrument recording, distinct from the first D3 sample.

### Analysis method

This recording was analysed independently with 32,768-sample Blackman windows (about 743 ms), advanced in 8,192-sample hops (about 186 ms). Local FFT maxima were interpolated parabolically in log magnitude. For the stable section, windows starting from 0.55 s through 2.80 s with RMS above −60 dBFS were included. These are offline estimates and must be verified through the browser's live analysis path.

### Stable-section baseline

| Resonance | Median measured | Median deviation from nominal D3 target |
|---|---:|---:|
| D3 fundamental (1×) | 147.102 Hz | +3.18 cents |
| D4 octave (2×) | 292.362 Hz | −7.70 cents |
| D3 third partial (3×) | 441.492 Hz | +3.91 cents |

Across the selected stable windows, the central 80% ranges were approximately:
- D3: +2.04 to +3.85 cents
- D4: −9.35 to −7.17 cents
- 3× partial: +2.58 to +4.79 cents

### Important implication: the octave resonance is independent

The Yishama sample has a D4 resonance approximately 7.7 cents below the equal-tempered 2× D3 target while the fundamental is about 3.2 cents above D3. The 2× resonance therefore must be measured independently; it must not be calculated by simply doubling the detected D3 fundamental. The same applies to the 3× partial. This is exactly why the tuner needs three simultaneous, independent resonance trackers.

### Decay and signal-floor observations

The Yishama recording's useful signal decays gradually across several seconds. The late D4 and 3× components remain visible after the D3 fundamental becomes weak, but eventually all three approach the noise floor. A frame that is below the presence gate or lacks sufficient peak confidence must not be presented as a precise pitch just because an FFT maximum can still be found.

## Cross-instrument acceptance requirements

1. The same detection pipeline must work on both physical instruments without changing the target window or manually tuning the algorithm to one recording.
2. Report each instrument's 1×, 2×, and 3× frequencies independently.
3. Do not force the D4 result to equal exactly 2× the fundamental or the third partial to equal exactly 3× the fundamental.
4. Preserve genuine inharmonicity and instrument-specific resonance differences rather than smoothing them away.
5. Compare offline and browser measurements over the same time windows before using either sample as a calibration truth.
