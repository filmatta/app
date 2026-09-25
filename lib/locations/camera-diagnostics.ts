export type CameraPermissionState = PermissionState | "unsupported";
export type CameraPolicyState = boolean | "unsupported";

export type LocationCameraDiagnostic = {
  errorName: string;
  errorMessage: string;
  errorConstructor: string;
  secureContext: boolean;
  topLevel: boolean;
  origin: string;
  mediaDevicesAvailable: boolean;
  permission: CameraPermissionState;
  policyCamera: CameraPolicyState;
  policyMicrophone: CameraPolicyState;
};

export type LocationCameraErrorCode =
  | "CAMERA_POLICY_BLOCKED"
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_CONSTRAINTS_FAILED"
  | "CAMERA_NOT_FOUND"
  | "CAMERA_UNAVAILABLE"
  | "CAMERA_ACCESS_FAILED";

export function locationCameraErrorCode(
  diagnostic: LocationCameraDiagnostic,
): LocationCameraErrorCode {
  if (diagnostic.policyCamera === false) return "CAMERA_POLICY_BLOCKED";
  if (
    diagnostic.permission === "denied"
    && ["NotAllowedError", "PermissionDeniedError"].includes(diagnostic.errorName)
  ) {
    return "CAMERA_PERMISSION_DENIED";
  }
  if (diagnostic.errorName === "OverconstrainedError") return "CAMERA_CONSTRAINTS_FAILED";
  if (["NotFoundError", "DevicesNotFoundError"].includes(diagnostic.errorName)) return "CAMERA_NOT_FOUND";
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(diagnostic.errorName)) return "CAMERA_UNAVAILABLE";
  return "CAMERA_ACCESS_FAILED";
}

export function shouldRetrySimpleCamera(
  diagnostic: LocationCameraDiagnostic,
  requestedAudio: boolean,
) {
  if (diagnostic.policyCamera === false || diagnostic.permission === "denied") return false;
  if (diagnostic.errorName === "OverconstrainedError") return true;
  if (
    diagnostic.permission === "granted"
    && ["NotAllowedError", "PermissionDeniedError"].includes(diagnostic.errorName)
  ) {
    return true;
  }
  return requestedAudio && [
    "NotAllowedError",
    "PermissionDeniedError",
    "NotFoundError",
    "DevicesNotFoundError",
    "NotReadableError",
    "TrackStartError",
    "AbortError",
  ].includes(diagnostic.errorName);
}
