import { cleanCrearText, crearApiSession, crearError, crearJson, isCrearUuid, isRecord, readCrearJson } from "@/lib/crear/api";
import { CrearStorageError, loadCrearDetail, mapSession } from "@/lib/crear/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const { id } = await params;
  if (!isCrearUuid(id)) return crearError("Solicitud inválida.", "invalid", 400);
  try {
    return crearJson(await loadCrearDetail(auth.supabase, auth.user.id, id));
  } catch (cause) {
    return storageResponse(cause);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const { id } = await params;
  const body = await readCrearJson(request);
  if (!isCrearUuid(id) || !body.ok || !isRecord(body.value)) {
    return body.ok ? crearError("Solicitud inválida.", "invalid", 400) : body.response;
  }
  const update: { title?: string; premise?: string | null } = {};
  if (body.value.title !== undefined) {
    const title = cleanCrearText(body.value.title, 160);
    if (!title) return crearError("El título no es válido.", "invalid", 400);
    update.title = title;
  }
  if (body.value.premise !== undefined) {
    if (body.value.premise === null) update.premise = null;
    else {
      const premise = cleanCrearText(body.value.premise, 12_000);
      if (!premise) return crearError("La premisa no es válida.", "invalid", 400);
      update.premise = premise;
    }
  }
  if (!Object.keys(update).length) return crearError("No hay cambios válidos.", "invalid", 400);
  try {
    await loadCrearDetail(auth.supabase, auth.user.id, id);
    const saved = await auth.supabase.from("create_sessions").update(update)
      .eq("id", id).eq("owner_id", auth.user.id)
      .select("id,title,premise,project_id,converted_writer_id,created_at,updated_at").maybeSingle();
    if (saved.error || !saved.data) throw new CrearStorageError("storage", "No pudimos guardar la sesión.", 500);
    return crearJson({ session: mapSession(saved.data) });
  } catch (cause) {
    return storageResponse(cause);
  }
}

function storageResponse(cause: unknown) {
  if (cause instanceof CrearStorageError) return crearError(cause.message, cause.code, cause.status);
  return crearError("No pudimos completar la operación.", "server_error", 500);
}
