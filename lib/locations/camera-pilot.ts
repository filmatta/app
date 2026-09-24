import "server-only";

const DISABLED_VALUES = new Set(["0", "false", "off", "disabled"]);

export function locationCameraRecordingEnabled() {
  const value = process.env.LOCATION_CAMERA_RECORDING_ENABLED
    ?.trim()
    .toLowerCase();
  return !DISABLED_VALUES.has(value ?? "");
}
