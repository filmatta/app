import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanCrearText, crearApiSession, crearError, crearJson, isCrearUuid, isRecord, readCrearJson } from "@/lib/crear/api";
import { CrearAiError, generateCrearReply, type CrearAiResult } from "@/lib/crear/ai-server";
import {
  CrearStorageError,
  isCrearItemType,
  loadCrearDetail,
  mapItem,
  mapMessage,
  recordCrearSignal,
  touchCrearSession,
} from "@/lib/crear/server";
import type { CrearMessage, CrearSuggestion } from "@/lib/crear/types";

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
  const content = cleanCrearText(body.value.content, 50_000);
  const parentMessageId = body.value.parentMessageId === undefined || body.value.parentMessageId === null
    ? null
    : isCrearUuid(body.value.parentMessageId) ? body.value.parentMessageId : undefined;
  if (!content || parentMessageId === undefined) return crearError("El mensaje no es válido.", "invalid", 400);

  try {
    let detail = await loadCrearDetail(auth.supabase, auth.user.id, id);
    if (parentMessageId && !detail.messages.some((message) => message.id === parentMessageId)) {
      return crearError("El mensaje citado no existe en esta sesión.", "invalid_reply", 400);
    }

    let userMessage = detail.messages.findLast((message) => message.role === "user"
      && message.content === content
      && message.parentMessageId === parentMessageId
      && message.metadata.awaitingAssistant === true) ?? null;
    if (!userMessage) {
      const turnId = randomUUID();
      const inserted = await auth.supabase.from("create_messages").insert({
        session_id: id,
        owner_id: auth.user.id,
        role: "user",
        content,
        parent_message_id: parentMessageId,
        metadata: { turnId, awaitingAssistant: true },
      }).select("id,session_id,role,content,parent_message_id,metadata,created_at").single();
      if (inserted.error || !inserted.data) throw storageError("No pudimos guardar tu mensaje.");
      userMessage = mapMessage(inserted.data);
      await touchCrearSession(auth.supabase, auth.user.id, id);
      detail = await loadCrearDetail(auth.supabase, auth.user.id, id);
    }

    if (parentMessageId) {
      await recordSignalOnce(auth.supabase, {
        sessionId: id,
        ownerId: auth.user.id,
        messageId: userMessage.id,
        signalType: "reply",
        value: { parentMessageId },
      });
    }

    const turnId = typeof userMessage.metadata.turnId === "string"
      ? userMessage.metadata.turnId
      : userMessage.id;
    const storedAssistant = detail.messages
      .filter((message) => message.role === "assistant" && message.metadata.turnId === turnId)
      .sort((left, right) => blockIndex(left) - blockIndex(right));

    let ai: CrearAiResult;
    let assistantIds: string[];
    if (storedAssistant.length) {
      ai = {
        blocks: storedAssistant.map((message) => message.content),
        suggestions: readStoredSuggestions(storedAssistant[0]),
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      };
      assistantIds = storedAssistant.map((message) => message.id);
    } else {
      const recent = await auth.supabase.from("create_messages")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", auth.user.id)
        .eq("role", "user")
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());
      if (recent.error) throw storageError("No pudimos comprobar el ritmo de mensajes.");
      if ((recent.count ?? 0) > 8) {
        return crearError("Espera un momento antes de pedir otra respuesta.", "rate_limited", 429, { userMessage });
      }

      try {
        ai = await generateCrearReply({
          userId: auth.user.id,
          operationId: userMessage.id,
          session: detail.session,
          messages: detail.messages,
          items: detail.items,
          signal: request.signal,
        });
      } catch (cause) {
        if (cause instanceof CrearAiError) {
          return crearError(cause.message, cause.code, 503, { userMessage });
        }
        throw cause;
      }

      assistantIds = ai.blocks.map(() => randomUUID());
      const insertedAssistant = await auth.supabase.from("create_messages").insert(ai.blocks.map((block, index) => ({
        id: assistantIds[index],
        session_id: id,
        owner_id: auth.user.id,
        role: "assistant",
        content: block,
        metadata: {
          turnId,
          blockIndex: index,
          blockCount: ai.blocks.length,
          ...(index === 0 && ai.suggestions.length ? { suggestions: ai.suggestions } : {}),
        },
      })));
      if (insertedAssistant.error) throw storageError("No pudimos guardar la respuesta de FILMATTA.");
    }

    await recordSignalOnce(auth.supabase, {
      sessionId: id,
      ownerId: auth.user.id,
      messageId: assistantIds[0],
      signalType: "ai_response",
      value: {
        blockCount: ai.blocks.length,
        suggestionCount: ai.suggestions.length,
        ...ai.usage,
      },
    });

    if (ai.suggestions.length) {
      const knownItems = [...detail.items];
      for (const suggestion of ai.suggestions) {
        if (knownItems.some((item) => item.sourceMessageId === assistantIds[0] && item.content === suggestion.content)) {
          continue;
        }
        const insertedItem = await auth.supabase.from("create_items").insert({
          session_id: id,
          owner_id: auth.user.id,
          type: "pending",
          suggested_type: suggestion.type,
          title: suggestion.title,
          content: suggestion.content,
          state: "active",
          source_message_id: assistantIds[0],
        }).select("id,session_id,type,suggested_type,title,content,state,source_message_id,created_at,updated_at").single();
        if (insertedItem.error || !insertedItem.data) {
          throw storageError("La respuesta llegó, pero no pudimos guardar sus ideas detectadas.");
        }
        knownItems.push(mapItem(insertedItem.data));
      }
      await recordSignalOnce(auth.supabase, {
        sessionId: id,
        ownerId: auth.user.id,
        messageId: assistantIds[0],
        signalType: "suggestion_detected",
        value: { count: ai.suggestions.length, types: ai.suggestions.map((suggestion) => suggestion.type) },
      });
    }

    const completed = await auth.supabase.from("create_messages").update({
      metadata: { ...userMessage.metadata, awaitingAssistant: false },
    }).eq("id", userMessage.id).eq("session_id", id).eq("owner_id", auth.user.id);
    if (completed.error) throw storageError("No pudimos cerrar el turno de conversación.");
    await touchCrearSession(auth.supabase, auth.user.id, id);
    const refreshed = await loadCrearDetail(auth.supabase, auth.user.id, id);
    return crearJson({ messages: refreshed.messages, items: refreshed.items });
  } catch (cause) {
    if (cause instanceof CrearStorageError) return crearError(cause.message, cause.code, cause.status);
    return crearError("No pudimos completar la conversación.", "server_error", 500);
  }
}

function storageError(message: string) {
  return new CrearStorageError("storage", message, 500);
}

function blockIndex(message: CrearMessage) {
  return typeof message.metadata.blockIndex === "number" ? message.metadata.blockIndex : 0;
}

function readStoredSuggestions(message: CrearMessage): CrearSuggestion[] {
  const suggestions = message.metadata.suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions.flatMap((suggestion) => {
    if (!isRecord(suggestion) || !isCrearItemType(suggestion.type)) return [];
    if (suggestion.title !== null && typeof suggestion.title !== "string") return [];
    const content = cleanCrearText(suggestion.content, 12_000);
    const title = suggestion.title === null ? null : cleanCrearText(suggestion.title, 160);
    if (!content || title === undefined) return [];
    return [{ type: suggestion.type, title, content }];
  });
}

async function recordSignalOnce(db: SupabaseClient, input: {
  sessionId: string;
  ownerId: string;
  messageId: string;
  signalType: string;
  value: Record<string, unknown>;
}) {
  const existing = await db.from("create_signals").select("id")
    .eq("session_id", input.sessionId)
    .eq("owner_id", input.ownerId)
    .eq("message_id", input.messageId)
    .eq("signal_type", input.signalType)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw storageError("No pudimos comprobar el registro de interacción.");
  if (!existing.data) await recordCrearSignal(db, input);
}
