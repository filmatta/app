import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  WRITER_SCHEMA_VERSION,
  normalizeWriterTitle,
  validateWriterDocument,
} from "./document";

export const WRITER_REQUEST_MAX_BYTES = 2_100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function writerApiSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseWriterSnapshot(value: unknown) {
  if (!isRecord(value)) return { ok: false as const, message: "Solicitud inválida." };
  const title = normalizeWriterTitle(value.title);
  if (!title) return { ok: false as const, message: "El título no es válido." };
  if (value.schemaVersion !== WRITER_SCHEMA_VERSION) {
    return { ok: false as const, message: "La versión del documento no es compatible." };
  }
  const validated = validateWriterDocument(value.document);
  if (!validated.ok) return { ok: false as const, message: validated.reason };
  return {
    ok: true as const,
    snapshot: { title, document: validated.document, schemaVersion: WRITER_SCHEMA_VERSION },
  };
}

export async function readWriterJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > WRITER_REQUEST_MAX_BYTES) {
    return { ok: false as const, response: writerJson({ error: "Documento demasiado grande." }, 413) };
  }
  try {
    const value = await request.json();
    return { ok: true as const, value };
  } catch {
    return { ok: false as const, response: writerJson({ error: "JSON inválido." }, 400) };
  }
}

export function writerJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function writerRpcError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (error.code === "42501" || message.includes("WRITER_UNAUTHENTICATED")) {
    return writerJson({ error: "Sesión no válida.", code: "unauthorized" }, 401);
  }
  if (message.includes("WRITER_REVISION_CONFLICT")) {
    return writerJson({ error: "Conflicto de versiones.", code: "conflict" }, 409);
  }
  if (message.includes("WRITER_QUOTA_REACHED")) {
    return writerJson({ error: "Alcanzaste el límite de 3 guiones.", code: "quota" }, 409);
  }
  if (message.includes("WRITER_NOT_FOUND") || message.includes("TARGET_MISSING")) {
    return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  }
  if (error.code === "22023" || message.includes("WRITER_INVALID") || message.includes("WRITER_UNSUPPORTED")) {
    return writerJson({ error: "La solicitud no es válida.", code: "invalid" }, 400);
  }
  return writerJson({ error: "No se pudo completar la operación.", code: "server_error" }, 500);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
