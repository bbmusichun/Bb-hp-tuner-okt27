# Scala scale library

The five handpan-related `.scl` files included in the Hangoal source library are preserved here as source assets:

- `Circle of Fifths.scl`
- `Quarter-Tone Equal.scl`
- `Sacred Solfeggio.scl`
- `Integral Hang (just).scl`
- `Golden Gate (just).scl`

The app's Settings panel now has a Scala `.scl` import control in the custom exact-frequency scale section. Select the tone field whose frequency should act as the scale root, import an `.scl` file, inspect the generated exact-frequency list, and apply it to the active instrument profile.

## Import behavior and limits

- Standard Scala cent intervals and ratio intervals such as `3/2` are converted to exact target frequencies anchored to the selected tone.
- The final Scala interval is treated as the period and is not duplicated as a note.
- The custom handpan scale editor supports 2–24 tones, so imported scales outside that range must be reduced before application.
- Files whose intervals are deliberately reordered (such as Circle of Fifths) or that do not describe a conventional ascending interval scale (such as Sacred Solfeggio) are not silently sorted or reinterpreted. They require a separate specialized import mode.
- Executable binaries are not bundled into the web application; all runtime features are implemented in the Hangoal source code.
