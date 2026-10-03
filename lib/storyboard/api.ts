import "server-only";
import { StoryboardError } from "./server";

export const STORYBOARD_REQUEST_MAX_BYTES = 2_100_000;

export async function readStoryboardJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > STORYBOARD_REQUEST_MAX_BYTES) {
    return { ok: false as const, response: storyboardJson({ error: "El panel supera el límite de 2 MB.", code: "too_large" }, 413) };
  }
  try {
    return { ok: true as const, value: await request.json() as unknown };
  } catch {
    return { ok: false as const, response: storyboardJson({ error: "JSON inválido.", code: "invalid" }, 400) };
  }
}

export function storyboardJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}

export function storyboardError(cause: unknown) {
  if (cause instanceof StoryboardError) {
    return storyboardJson({ error: cause.message, code: cause.code }, cause.status);
  }
  return storyboardJson({ error: "No pudimos completar la operación.", code: "server_error" }, 500);
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
