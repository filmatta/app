import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBlock, createEmptyWriterDocument, WRITER_SCHEMA_VERSION, type WriterDocument } from "@/lib/writer/document";
import {
  CREAR_ITEM_STATES,
  CREAR_ITEM_TYPES,
  CREAR_REACTION_EMOJIS,
  type CrearItem,
  type CrearItemState,
  type CrearItemType,
  type CrearMessage,
  type CrearMessageMetadata,
  type CrearReaction,
  type CrearReactionEmoji,
  type CrearSession,
  type CrearSessionDetail,
} from "./types";

export class CrearStorageError extends Error {
  constructor(readonly code: "not_found" | "invalid" | "storage", message: string, readonly status: number) {
    super(message);
  }
}

export function isCrearItemType(value: unknown): value is CrearItemType {
  return typeof value === "string" && CREAR_ITEM_TYPES.includes(value as CrearItemType);
}

export function isCrearItemState(value: unknown): value is CrearItemState {
  return typeof value === "string" && CREAR_ITEM_STATES.includes(value as CrearItemState);
}

export function isCrearReactionEmoji(value: unknown): value is CrearReactionEmoji {
  return typeof value === "string" && CREAR_REACTION_EMOJIS.includes(value as CrearReactionEmoji);
}

export async function listCrearSessions(db: SupabaseClient, ownerId: string) {
  const result = await db.from("create_sessions")
    .select("id,title,premise,project_id,converted_writer_id,created_at,updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (result.error) throw storageError();
  return (result.data ?? []).map(mapSession);
}

export async function loadCrearSession(db: SupabaseClient, ownerId: string, sessionId: string): Promise<CrearSession> {
  const result = await db.from("create_sessions")
    .select("id,title,premise,project_id,converted_writer_id,created_at,updated_at")
    .eq("id", sessionId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (result.error) throw storageError();
  if (!result.data) throw new CrearStorageError("not_found", "Sesión no encontrada.", 404);
  return mapSession(result.data);
}

export async function loadCrearDetail(db: SupabaseClient, ownerId: string, sessionId: string): Promise<CrearSessionDetail> {
  const session = await loadCrearSession(db, ownerId, sessionId);
  const [messages, items, signals] = await Promise.all([
    db.from("create_messages")
      .select("id,session_id,role,content,parent_message_id,metadata,created_at")
      .eq("session_id", sessionId)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    db.from("create_items")
      .select("id,session_id,type,suggested_type,title,content,state,source_message_id,created_at,updated_at")
      .eq("session_id", sessionId)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    db.from("create_signals")
      .select("id,message_id,value,created_at")
      .eq("session_id", sessionId)
      .eq("owner_id", ownerId)
      .eq("signal_type", "reaction")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (messages.error || items.error || signals.error) throw storageError();
  return {
    session,
    messages: orderCrearMessages((messages.data ?? []).map(mapMessage)),
    items: (items.data ?? []).map(mapItem),
    reactions: currentReactions(signals.data ?? []),
  };
}

function orderCrearMessages(messages: CrearMessage[]): CrearMessage[] {
  const ordered: CrearMessage[] = [];
  for (let index = 0; index < messages.length;) {
    const first = messages[index];
    const turnId = first.metadata.turnId;
    if (first.role !== "assistant" || typeof turnId !== "string") {
      ordered.push(first);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < messages.length && messages[end].role === "assistant"
      && messages[end].metadata.turnId === turnId) end += 1;
    ordered.push(...messages.slice(index, end).sort((left, right) =>
      Number(left.metadata.blockIndex ?? 0) - Number(right.metadata.blockIndex ?? 0)));
    index = end;
  }
  return ordered;
}

export async function createCrearSession(db: SupabaseClient, ownerId: string, input: { title?: string; demo?: boolean }) {
  const title = input.demo ? (input.title || "ARCA") : (input.title || "Idea sin título");
  const inserted = await db.from("create_sessions").insert({
    owner_id: ownerId,
    title,
    premise: input.demo ? ARCA_PREMISE : null,
  }).select("id,title,premise,project_id,converted_writer_id,created_at,updated_at").single();
  if (inserted.error || !inserted.data) throw storageError();
  const session = mapSession(inserted.data);
  if (!input.demo) return loadCrearDetail(db, ownerId, session.id);
  try {
    await seedArcaDemo(db, session.id, ownerId);
    return await loadCrearDetail(db, ownerId, session.id);
  } catch (cause) {
    await db.from("create_sessions").delete().eq("id", session.id).eq("owner_id", ownerId);
    throw cause;
  }
}

export async function recordCrearSignal(db: SupabaseClient, input: {
  sessionId: string;
  ownerId: string;
  messageId?: string | null;
  signalType: string;
  value?: Record<string, unknown>;
}) {
  const result = await db.from("create_signals").insert({
    session_id: input.sessionId,
    owner_id: input.ownerId,
    message_id: input.messageId ?? null,
    signal_type: input.signalType,
    value: input.value ?? {},
  });
  if (result.error) throw storageError();
}

export async function touchCrearSession(db: SupabaseClient, ownerId: string, sessionId: string) {
  const result = await db.from("create_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("owner_id", ownerId);
  if (result.error) throw storageError();
}

export async function syncCrearPremise(db: SupabaseClient, ownerId: string, sessionId: string) {
  const current = await db.from("create_items").select("content")
    .eq("session_id", sessionId).eq("owner_id", ownerId).eq("type", "premise")
    .in("state", ["active", "canon"])
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (current.error) throw storageError("No pudimos actualizar la premisa.");
  const saved = await db.from("create_sessions").update({ premise: current.data?.content ?? null })
    .eq("id", sessionId).eq("owner_id", ownerId);
  if (saved.error) throw storageError("No pudimos actualizar la premisa.");
}

export async function convertCrearSession(db: SupabaseClient, ownerId: string, detail: CrearSessionDetail) {
  if (detail.session.projectId && detail.session.writerId) {
    await recordConversionOnce(db, ownerId, detail.session.id, detail.session.projectId, detail.session.writerId);
    return { projectId: detail.session.projectId, writerId: detail.session.writerId };
  }
  const recovered = await recoverWriterConversion(db, detail.session.id);
  if (recovered) {
    await recordConversionOnce(db, ownerId, detail.session.id, recovered.projectId, recovered.writerId);
    return recovered;
  }
  if (!hasConvertibleContent(detail)) {
    throw new CrearStorageError("invalid", "Guarda al menos una idea activa antes de convertirla en proyecto.", 400);
  }
  const document = buildCreativeBriefDocument(detail);
  let projectId = detail.session.projectId;
  let writerId: string | null = detail.session.writerId;

  if (projectId && !writerId) {
    const existing = await db.from("writer_scripts").select("id")
      .eq("owner_id", ownerId).eq("project_id", projectId)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw storageError("No pudimos comprobar el Writer del proyecto.");
    writerId = existing.data?.id ? String(existing.data.id) : null;
    if (!writerId) {
      const created = await db.rpc("writer_create_project_script_v1", {
        p_project_id: projectId,
        p_operation_id: detail.session.id,
        p_title: detail.session.title,
        p_document: document,
        p_schema_version: WRITER_SCHEMA_VERSION,
      });
      if (created.error || typeof created.data !== "string") {
        throw writerCreationError(created.error, "No pudimos crear el Writer del proyecto.");
      }
      writerId = created.data;
    }
    const linked = await db.from("create_sessions").update({ converted_writer_id: writerId })
      .eq("id", detail.session.id).eq("owner_id", ownerId).eq("project_id", projectId)
      .select("id").maybeSingle();
    if (linked.error || !linked.data) throw storageError("El Writer se creó, pero no pudimos vincularlo a Crear.");
  } else {
    const created = await db.rpc("writer_create_script", {
      p_operation_id: detail.session.id,
      p_title: detail.session.title,
      p_document: document,
      p_schema_version: WRITER_SCHEMA_VERSION,
    });
    if (created.error) throw writerCreationError(created.error, "No pudimos convertir la idea en proyecto.");
    const row = Array.isArray(created.data) ? created.data[0] : created.data;
    writerId = row?.id ? String(row.id) : null;
    if (!writerId) throw storageError("No pudimos resolver el Writer creado.");
    const writer = await db.from("writer_scripts").select("project_id")
      .eq("id", writerId).eq("owner_id", ownerId).maybeSingle();
    projectId = writer.data?.project_id ? String(writer.data.project_id) : null;
    if (writer.error || !projectId) throw storageError("No pudimos resolver el proyecto creado.");
    const linked = await db.from("create_sessions").update({ project_id: projectId, converted_writer_id: writerId })
      .eq("id", detail.session.id).eq("owner_id", ownerId).select("id").maybeSingle();
    if (linked.error || !linked.data) throw storageError("El proyecto se creó, pero no pudimos vincularlo a Crear.");
  }

  await recordConversionOnce(db, ownerId, detail.session.id, projectId, writerId);
  return { projectId, writerId } as { projectId: string; writerId: string };
}

async function recoverWriterConversion(db: SupabaseClient, sessionId: string) {
  const recovered = await db.rpc("create_recover_writer_conversion_v1", { p_session_id: sessionId });
  if (recovered.error) throw storageError("No pudimos comprobar una conversión anterior.");
  const row = Array.isArray(recovered.data) ? recovered.data[0] : recovered.data;
  if (!row || typeof row !== "object") return null;
  const projectId = "project_id" in row && typeof row.project_id === "string" ? row.project_id : null;
  const writerId = "writer_id" in row && typeof row.writer_id === "string" ? row.writer_id : null;
  return projectId && writerId ? { projectId, writerId } : null;
}

function hasConvertibleContent(detail: CrearSessionDetail) {
  if (detail.session.premise?.trim()) return true;
  return detail.items.some((item) => item.content.trim() && (
    (item.type !== "pending" && ["active", "canon"].includes(item.state))
    || (item.type === "pending" && item.state === "canon")
  ));
}

function writerCreationError(error: unknown, fallback: string) {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "";
  if (message.includes("WRITER_QUOTA_REACHED")) {
    return new CrearStorageError(
      "invalid",
      "Ya tienes el máximo actual de 3 documentos en Writer. Elimina uno antes de convertir esta idea.",
      409,
    );
  }
  return storageError(fallback);
}

async function recordConversionOnce(db: SupabaseClient, ownerId: string, sessionId: string, projectId: string, writerId: string) {
  const existing = await db.from("create_signals").select("id")
    .eq("session_id", sessionId).eq("owner_id", ownerId).eq("signal_type", "conversion")
    .limit(1).maybeSingle();
  if (existing.error) throw storageError("No pudimos comprobar el registro de conversión.");
  if (existing.data) return;
  await recordCrearSignal(db, {
    sessionId,
    ownerId,
    signalType: "conversion",
    value: { projectId, writerId },
  });
}

export function mapSession(row: Record<string, unknown>): CrearSession {
  return {
    id: String(row.id),
    title: String(row.title),
    premise: row.premise == null ? null : String(row.premise),
    projectId: row.project_id == null ? null : String(row.project_id),
    writerId: row.converted_writer_id == null ? null : String(row.converted_writer_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapMessage(row: Record<string, unknown>): CrearMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content),
    parentMessageId: row.parent_message_id == null ? null : String(row.parent_message_id),
    metadata: isObject(row.metadata) ? row.metadata as CrearMessageMetadata : {},
    createdAt: String(row.created_at),
  };
}

export function mapItem(row: Record<string, unknown>): CrearItem {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    type: row.type as CrearItemType,
    suggestedType: isCrearItemType(row.suggested_type) ? row.suggested_type : null,
    title: row.title == null ? null : String(row.title),
    content: String(row.content),
    state: row.state as CrearItemState,
    sourceMessageId: row.source_message_id == null ? null : String(row.source_message_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function currentReactions(rows: Record<string, unknown>[]): CrearReaction[] {
  const current = new Map<string, CrearReaction>();
  for (const row of rows) {
    if (!row.message_id || !isObject(row.value) || !isCrearReactionEmoji(row.value.emoji)) continue;
    const reaction = {
      messageId: String(row.message_id),
      emoji: row.value.emoji,
      active: row.value.active !== false,
    } satisfies CrearReaction;
    current.set(`${reaction.messageId}:${reaction.emoji}`, reaction);
  }
  return [...current.values()].filter((reaction) => reaction.active);
}

export function buildCreativeBriefDocument(detail: CrearSessionDetail): WriterDocument {
  const active = detail.items.filter((item) => item.state === "active" && item.type !== "pending");
  const canon = detail.items.filter((item) => item.state === "canon");
  const maybe = detail.items.filter((item) => item.state === "maybe" && item.type !== "premise");
  const structured = [...active, ...canon].filter((item) => item.type !== "premise" && item.type !== "pending");
  const premiseParts = [
    detail.session.premise,
    ...active.filter((item) => item.type === "premise").map((item) => item.content),
    ...canon.filter((item) => item.type === "premise").map((item) => item.content),
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const sections = [
    premiseParts.length ? `PREMISA\n${premiseParts.join("\n")}` : null,
    briefSection("PERSONAJES", structured.filter((item) => item.type === "character")),
    briefSection("MUNDO", structured.filter((item) => item.type === "world")),
    briefSection("TEMAS", structured.filter((item) => item.type === "theme")),
    briefSection("CANON", canon.filter((item) => item.type === "pending")),
    briefSection("NOTAS MAYBE · NO SON CANON", maybe),
  ].filter((value): value is string => Boolean(value));
  const note = [
    "CREATIVE BRIEF · Generado desde Crear",
    "Tus ideas son tuyas. Este bloque resume las decisiones activas al momento de convertir el proyecto.",
    ...sections,
  ].join("\n\n");
  const empty = createEmptyWriterDocument();
  return {
    type: "doc",
    content: [
      createBlock("authorNote", note, deterministicBlockId(detail.session.id, "creative-brief")),
      ...empty.content.map((block, index) => ({
        ...block,
        attrs: {
          ...block.attrs,
          id: deterministicBlockId(detail.session.id, `writer-empty-${index}`),
        },
      })),
    ],
  };
}

function deterministicBlockId(sessionId: string, name: string) {
  const bytes = createHash("sha256").update(`${sessionId}:${name}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function briefSection(title: string, items: CrearItem[]) {
  if (!items.length) return null;
  return `${title}\n${items.map((item) => `• ${item.state === "canon" ? "[CANON] " : ""}${item.title ? `${item.title}: ` : ""}${item.content}`).join("\n")}`;
}

async function seedArcaDemo(db: SupabaseClient, sessionId: string, ownerId: string) {
  const ids = { user: randomUUID(), assistantOne: randomUUID(), assistantTwo: randomUUID(), reply: randomUUID() };
  const turnId = randomUUID();
  const createdAt = Date.now();
  const messages = await db.from("create_messages").insert([
    { id: ids.user, session_id: sessionId, owner_id: ownerId, role: "user", content: "Una flota de Arcas cruza el espacio sin que ninguna nave sepa que existen las demás.", metadata: { demo: true, turnId }, created_at: new Date(createdAt).toISOString() },
    { id: ids.assistantOne, session_id: sessionId, owner_id: ownerId, role: "assistant", content: "Esa regla vuelve el aislamiento parte del conflicto, no sólo del escenario.", metadata: { demo: true, turnId, blockIndex: 0, blockCount: 2 }, created_at: new Date(createdAt + 1).toISOString() },
    { id: ids.assistantTwo, session_id: sessionId, owner_id: ownerId, role: "assistant", content: "¿Qué ocurriría si una tripulante descubre una señal imposible que prueba que hay otra Arca?", metadata: { demo: true, turnId, blockIndex: 1, blockCount: 2 }, created_at: new Date(createdAt + 2).toISOString() },
    { id: ids.reply, session_id: sessionId, owner_id: ownerId, role: "user", content: "Me gusta, pero todavía no sé quién encuentra la señal.", parent_message_id: ids.assistantTwo, metadata: { demo: true, turnId: randomUUID() }, created_at: new Date(createdAt + 3).toISOString() },
  ]);
  if (messages.error) throw storageError();
  const items = await db.from("create_items").insert([
    { session_id: sessionId, owner_id: ownerId, type: "premise", title: "Premisa", content: ARCA_PREMISE, state: "active", source_message_id: ids.user },
    { session_id: sessionId, owner_id: ownerId, type: "world", title: "Regla de las Arcas", content: "Las Arcas no saben de la existencia de las demás.", state: "canon", source_message_id: ids.assistantOne },
    { session_id: sessionId, owner_id: ownerId, type: "character", title: "La tripulante que escucha", content: "Una tripulante aún sin nombre detecta una señal imposible.", state: "maybe", source_message_id: ids.assistantTwo },
    { session_id: sessionId, owner_id: ownerId, type: "pending", title: "Pregunta abierta", content: "Definir quién encuentra la señal y qué arriesga al investigarla.", state: "active", source_message_id: ids.reply },
  ]);
  if (items.error) throw storageError();
  const signals = await db.from("create_signals").insert([
    { session_id: sessionId, owner_id: ownerId, message_id: ids.assistantOne, signal_type: "reaction", value: { emoji: "💡", active: true } },
    { session_id: sessionId, owner_id: ownerId, message_id: ids.reply, signal_type: "reply", value: { parentMessageId: ids.assistantTwo } },
    { session_id: sessionId, owner_id: ownerId, message_id: ids.assistantOne, signal_type: "state_transition", value: { from: "active", to: "canon", demo: true } },
    { session_id: sessionId, owner_id: ownerId, message_id: ids.assistantTwo, signal_type: "state_transition", value: { from: "active", to: "maybe", demo: true } },
  ]);
  if (signals.error) throw storageError();
}

const ARCA_PREMISE = "Una civilización viaja en Arcas separadas, cada una convencida de ser la única superviviente, hasta que una señal imposible amenaza esa certeza.";

function storageError(message = "No pudimos guardar los cambios en Crear.") {
  return new CrearStorageError("storage", message, 500);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
