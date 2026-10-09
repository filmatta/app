import { cleanCrearText, crearApiSession, crearError, crearJson, isCrearUuid, isRecord, readCrearJson } from "@/lib/crear/api";
import { CrearStorageError, isCrearItemState, isCrearItemType, loadCrearDetail, mapItem, recordCrearSignal, syncCrearPremise, touchCrearSession } from "@/lib/crear/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const { id } = await params;
  const body = await readCrearJson(request);
  if (!isCrearUuid(id) || !body.ok || !isRecord(body.value)) {
    return body.ok ? crearError("Solicitud inválida.", "invalid", 400) : body.response;
  }
  const content = cleanCrearText(body.value.content, 12_000);
  const title = body.value.title === undefined || body.value.title === null
    ? null : cleanCrearText(body.value.title, 160);
  const sourceMessageId = body.value.sourceMessageId === undefined || body.value.sourceMessageId === null
    ? null : isCrearUuid(body.value.sourceMessageId) ? body.value.sourceMessageId : undefined;
  if (!content || (body.value.title != null && !title) || sourceMessageId === undefined
    || !isCrearItemType(body.value.type) || !isCrearItemState(body.value.state)) {
    return crearError("El elemento no es válido.", "invalid", 400);
  }
  try {
    const detail = await loadCrearDetail(auth.supabase, auth.user.id, id);
    if (sourceMessageId && !detail.messages.some((message) => message.id === sourceMessageId)) {
      return crearError("El mensaje de origen no existe en esta sesión.", "invalid_source", 400);
    }
    const existing = sourceMessageId
      ? detail.items.find((item) => item.sourceMessageId === sourceMessageId && item.content === content)
      : null;
    if (existing) {
      const updated = await auth.supabase.from("create_items").update({
        type: existing.type === "pending" && (body.value.state === "canon" || body.value.state === "maybe")
          ? (existing.suggestedType ?? body.value.type) : body.value.type,
        title,
        state: body.value.state,
      }).eq("id", existing.id).eq("session_id", id).eq("owner_id", auth.user.id)
        .select("id,session_id,type,suggested_type,title,content,state,source_message_id,created_at,updated_at").maybeSingle();
      if (updated.error || !updated.data) throw storageError();
      const item = mapItem(updated.data);
      if (item.state !== existing.state) {
        await recordCrearSignal(auth.supabase, {
          sessionId: id,
          ownerId: auth.user.id,
          messageId: sourceMessageId,
          signalType: "state_transition",
          value: { itemId: item.id, from: existing.state, to: item.state, type: item.type },
        });
      }
      if (item.type === "premise" || existing.type === "premise") {
        await syncCrearPremise(auth.supabase, auth.user.id, id);
      } else {
        await touchCrearSession(auth.supabase, auth.user.id, id);
      }
      return crearJson({ item });
    }
    const inserted = await auth.supabase.from("create_items").insert({
      session_id: id,
      owner_id: auth.user.id,
      type: body.value.type,
      title,
      content,
      state: body.value.state,
      source_message_id: sourceMessageId,
    }).select("id,session_id,type,suggested_type,title,content,state,source_message_id,created_at,updated_at").single();
    if (inserted.error || !inserted.data) throw storageError();
    const item = mapItem(inserted.data);
    await recordCrearSignal(auth.supabase, {
      sessionId: id,
      ownerId: auth.user.id,
      messageId: sourceMessageId,
      signalType: "state_transition",
      value: { itemId: item.id, from: null, to: item.state, type: item.type },
    });
    if (item.type === "premise") {
      await syncCrearPremise(auth.supabase, auth.user.id, id);
    } else {
      await touchCrearSession(auth.supabase, auth.user.id, id);
    }
    return crearJson({ item }, 201);
  } catch (cause) {
    return storageResponse(cause);
  }
}

function storageError() {
  return new CrearStorageError("storage", "No pudimos guardar el elemento.", 500);
}

function storageResponse(cause: unknown) {
  if (cause instanceof CrearStorageError) return crearError(cause.message, cause.code, cause.status);
  return crearError("No pudimos completar la operación.", "server_error", 500);
}
