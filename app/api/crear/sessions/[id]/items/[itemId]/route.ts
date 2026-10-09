import { cleanCrearText, crearApiSession, crearError, crearJson, isCrearUuid, isRecord, readCrearJson } from "@/lib/crear/api";
import { CrearStorageError, isCrearItemState, isCrearItemType, loadCrearSession, mapItem, recordCrearSignal, syncCrearPremise, touchCrearSession } from "@/lib/crear/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const { id, itemId } = await params;
  const body = await readCrearJson(request);
  if (!isCrearUuid(id) || !isCrearUuid(itemId) || !body.ok || !isRecord(body.value)) {
    return body.ok ? crearError("Solicitud inválida.", "invalid", 400) : body.response;
  }
  const update: Record<string, unknown> = {};
  if (body.value.type !== undefined) {
    if (!isCrearItemType(body.value.type)) return crearError("Tipo inválido.", "invalid", 400);
    update.type = body.value.type;
  }
  if (body.value.state !== undefined) {
    if (!isCrearItemState(body.value.state)) return crearError("Estado inválido.", "invalid", 400);
    update.state = body.value.state;
  }
  if (body.value.title !== undefined) {
    if (body.value.title === null) update.title = null;
    else {
      const title = cleanCrearText(body.value.title, 160);
      if (!title) return crearError("Título inválido.", "invalid", 400);
      update.title = title;
    }
  }
  if (body.value.content !== undefined) {
    const content = cleanCrearText(body.value.content, 12_000);
    if (!content) return crearError("Contenido inválido.", "invalid", 400);
    update.content = content;
  }
  if (!Object.keys(update).length) return crearError("No hay cambios válidos.", "invalid", 400);

  try {
    await loadCrearSession(auth.supabase, auth.user.id, id);
    const current = await loadItem(auth.supabase, auth.user.id, id, itemId);
    if (current.type === "pending" && (update.state === "canon" || update.state === "maybe")
      && current.suggestedType && update.type === undefined) {
      update.type = current.suggestedType;
    }
    const saved = await auth.supabase.from("create_items").update(update)
      .eq("id", itemId).eq("session_id", id).eq("owner_id", auth.user.id)
      .select("id,session_id,type,suggested_type,title,content,state,source_message_id,created_at,updated_at").maybeSingle();
    if (saved.error || !saved.data) throw storageError();
    const item = mapItem(saved.data);
    if (item.state !== current.state) {
      await recordCrearSignal(auth.supabase, {
        sessionId: id,
        ownerId: auth.user.id,
        messageId: item.sourceMessageId,
        signalType: "state_transition",
        value: { itemId, from: current.state, to: item.state, type: item.type },
      });
    }
    if (item.type === "premise" || current.type === "premise") {
      await syncCrearPremise(auth.supabase, auth.user.id, id);
    } else {
      await touchCrearSession(auth.supabase, auth.user.id, id);
    }
    return crearJson({ item });
  } catch (cause) {
    return storageResponse(cause);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await crearApiSession();
  if (!auth) return crearError("Inicia sesión.", "unauthorized", 401);
  const { id, itemId } = await params;
  if (!isCrearUuid(id) || !isCrearUuid(itemId)) return crearError("Solicitud inválida.", "invalid", 400);
  try {
    await loadCrearSession(auth.supabase, auth.user.id, id);
    const current = await loadItem(auth.supabase, auth.user.id, id, itemId);
    const removed = await auth.supabase.from("create_items").delete()
      .eq("id", itemId).eq("session_id", id).eq("owner_id", auth.user.id).select("id").maybeSingle();
    if (removed.error || !removed.data) throw storageError();
    await recordCrearSignal(auth.supabase, {
      sessionId: id,
      ownerId: auth.user.id,
      messageId: current.sourceMessageId,
      signalType: "state_transition",
      value: { itemId, from: current.state, to: "deleted", type: current.type },
    });
    if (current.type === "premise") await syncCrearPremise(auth.supabase, auth.user.id, id);
    else await touchCrearSession(auth.supabase, auth.user.id, id);
    return crearJson({ deleted: true });
  } catch (cause) {
    return storageResponse(cause);
  }
}

async function loadItem(db: SupabaseClient, ownerId: string, sessionId: string, itemId: string) {
  const result = await db.from("create_items")
    .select("id,session_id,type,suggested_type,title,content,state,source_message_id,created_at,updated_at")
    .eq("id", itemId).eq("session_id", sessionId).eq("owner_id", ownerId).maybeSingle();
  if (result.error) throw storageError();
  if (!result.data) throw new CrearStorageError("not_found", "Elemento no encontrado.", 404);
  return mapItem(result.data);
}

function storageError() {
  return new CrearStorageError("storage", "No pudimos guardar el elemento.", 500);
}

function storageResponse(cause: unknown) {
  if (cause instanceof CrearStorageError) return crearError(cause.message, cause.code, cause.status);
  return crearError("No pudimos completar la operación.", "server_error", 500);
}
