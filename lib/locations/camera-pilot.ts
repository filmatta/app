import "server-only";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function locationCameraPilotEnabled(userId: string) {
  const allowedOwnerId = process.env.LOCATION_CAMERA_PILOT_OWNER_ID?.trim();
  return Boolean(
    allowedOwnerId &&
      UUID_PATTERN.test(allowedOwnerId) &&
      allowedOwnerId === userId,
  );
}
