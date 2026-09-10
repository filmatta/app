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

export function getLessonVideoPassthrough(lessonId: string) {
  if (!UUID_PATTERN.test(lessonId)) {
    throw new Error("Identificador de lección inválido.");
  }

  return `${LESSON_VIDEO_PREFIX}${lessonId}`;
}

export function getLessonIdFromPassthrough(value?: string) {
  if (!value?.startsWith(LESSON_VIDEO_PREFIX)) {
    return null;
  }

  const lessonId = value.slice(LESSON_VIDEO_PREFIX.length);
  return UUID_PATTERN.test(lessonId) ? lessonId : null;
}
