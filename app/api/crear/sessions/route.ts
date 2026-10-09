import { cleanCrearText, crearApiSession, crearError, crearJson, isRecord, readCrearJson } from "@/lib/crear/api";
import { createCrearSession, CrearStorageError, listCrearSessions } from "@/lib/crear/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  try {
    return crearJson({ sessions: await listCrearSessions(auth.supabase, auth.user.id) });
  } catch (cause) {
    return storageResponse(cause);
  }
}

export async function POST(request: Request) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const body = await readCrearJson(request);
  if (!body.ok) return body.response;
  if (!isRecord(body.value) || (body.value.demo !== undefined && typeof body.value.demo !== "boolean")) {
    return crearError("Solicitud inválida.", "invalid", 400);
  }
  const title = cleanCrearText(body.value.title, 160, false);
  if (body.value.title !== undefined && !title) return crearError("El título no es válido.", "invalid", 400);
  try {
    const detail = await createCrearSession(auth.supabase, auth.user.id, { title: title ?? undefined, demo: body.value.demo === true });
    return crearJson(detail, 201);
  } catch (cause) {
    return storageResponse(cause);
  }
}

function storageResponse(cause: unknown) {
  if (cause instanceof CrearStorageError) return crearError(cause.message, cause.code, cause.status);
  return crearError("No pudimos completar la operación.", "server_error", 500);
}
