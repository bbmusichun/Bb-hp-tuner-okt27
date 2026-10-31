/** Ask the browser for microphone audio without automatic dynamics or telecom processing. */
export const RAW_MICROPHONE_CONSTRAINTS = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});

/** Build constraints for the selected microphone or the browser's default input. */
export function createMicrophoneAudioConstraints(preferredDeviceId?: string): MediaTrackConstraints {
  return preferredDeviceId
    ? { ...RAW_MICROPHONE_CONSTRAINTS, deviceId: { exact: preferredDeviceId } }
    : { ...RAW_MICROPHONE_CONSTRAINTS };
}
