import "server-only";

import { createClient } from "@/lib/supabase/server";

const MAX_JSON_BYTES = 80_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function crearApiSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export function crearJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function crearError(error: string, code: string, status: number, extra?: Record<string, unknown>) {
  return crearJson({ error, code, ...extra }, status);
}

export async function readCrearJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    return { ok: false as const, response: crearError("La solicitud es demasiado grande.", "too_large", 413) };
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) {
      return { ok: false as const, response: crearError("La solicitud es demasiado grande.", "too_large", 413) };
    }
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false as const, response: crearError("JSON inválido.", "invalid", 400) };
  }
}

export function isCrearUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanCrearText(value: unknown, maxLength: number, required = true) {
  if (typeof value !== "string") return required ? null : undefined;
  const text = value.trim().replace(/\r\n?/gu, "\n");
  if ((!text && required) || text.length > maxLength) return null;
  return text || undefined;
}
