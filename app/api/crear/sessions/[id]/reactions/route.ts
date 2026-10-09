import { crearApiSession, crearError, crearJson, isCrearUuid, isRecord, readCrearJson } from "@/lib/crear/api";
import { CrearStorageError, isCrearReactionEmoji, loadCrearDetail, recordCrearSignal, touchCrearSession } from "@/lib/crear/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const { id } = await params;
  const body = await readCrearJson(request);
  if (!isCrearUuid(id) || !body.ok || !isRecord(body.value)
    || !isCrearUuid(body.value.messageId) || !isCrearReactionEmoji(body.value.emoji)
    || typeof body.value.active !== "boolean") {
    return body.ok ? crearError("Reacción inválida.", "invalid", 400) : body.response;
  }
  const messageId = body.value.messageId;
  const emoji = body.value.emoji;
  const active = body.value.active;
  try {
    const detail = await loadCrearDetail(auth.supabase, auth.user.id, id);
    if (!detail.messages.some((message) => message.id === messageId)) {
      return crearError("Mensaje no encontrado.", "not_found", 404);
    }
    await recordCrearSignal(auth.supabase, {
      sessionId: id,
      ownerId: auth.user.id,
      messageId,
      signalType: "reaction",
      value: { emoji, active },
    });
    await touchCrearSession(auth.supabase, auth.user.id, id);
    const refreshed = await loadCrearDetail(auth.supabase, auth.user.id, id);
    return crearJson({ reactions: refreshed.reactions });
  } catch (cause) {
    if (cause instanceof CrearStorageError) return crearError(cause.message, cause.code, cause.status);
    return crearError("No pudimos guardar la reacción.", "server_error", 500);
  }
}
