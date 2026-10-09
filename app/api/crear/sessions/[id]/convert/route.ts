import { crearApiSession, crearError, crearJson, isCrearUuid } from "@/lib/crear/api";
import { convertCrearSession, CrearStorageError, loadCrearDetail } from "@/lib/crear/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const { id } = await params;
  if (!isCrearUuid(id)) return crearError("Solicitud inválida.", "invalid", 400);
  try {
    const detail = await loadCrearDetail(auth.supabase, auth.user.id, id);
    return crearJson(await convertCrearSession(auth.supabase, auth.user.id, detail));
  } catch (cause) {
    if (cause instanceof CrearStorageError) return crearError(cause.message, cause.code, cause.status);
    return crearError("No pudimos convertir la idea en proyecto.", "server_error", 500);
  }
}
