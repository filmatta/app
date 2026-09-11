import "server-only";
import Mux from "@mux/mux-node";

const LESSON_VIDEO_PREFIX = "filmatta:lesson:";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createMuxClient() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error("Mux no está configurado en el servidor.");
  }

  return new Mux({
    tokenId,
    tokenSecret,
    webhookSecret: process.env.MUX_WEBHOOK_SECRET,
  });
}

export function getMuxErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return null;
}

export function isMuxNotFoundError(error: unknown) {
  return getMuxErrorStatus(error) === 404;
}

export function getLessonVideoPassthrough(lessonId: string, videoId?: string) {
  if (!UUID_PATTERN.test(lessonId) || (videoId && !UUID_PATTERN.test(videoId))) {
    throw new Error("Identificador de lección inválido.");
  }

  return `${LESSON_VIDEO_PREFIX}${lessonId}${videoId ? `:${videoId}` : ""}`;
}

export function getLessonIdFromPassthrough(value?: string) {
  if (!value?.startsWith(LESSON_VIDEO_PREFIX)) {
    return null;
  }

  const parts = value.slice(LESSON_VIDEO_PREFIX.length).split(":");
  if (parts.length > 2 || (parts.length === 2 && !UUID_PATTERN.test(parts[1]))) return null;
  return UUID_PATTERN.test(parts[0]) ? parts[0] : null;
}

export function getVideoAttemptId(value?: string) {
  if (!getLessonIdFromPassthrough(value)) return null;
  const id = value?.slice(LESSON_VIDEO_PREFIX.length).split(":")[1];
  return id && UUID_PATTERN.test(id) ? id : null;
}
