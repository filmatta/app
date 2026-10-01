import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import {
  executeWriterGuidedWriting,
  loadGuidedWritingConversation,
  WriterGuidedWritingError,
} from "@/lib/writer/guided-writing-server";
import type { WriterGuidedWritingScope } from "@/lib/writer/guided-writing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const sceneId = url.searchParams.get("sceneId");
  const sessionId = url.searchParams.get("sessionId");
  if (!validUuid(id) || !validScope(scope)
    || (scope === "scene" && !validUuid(sceneId))
    || (scope === "document" && sceneId !== null)
    || (sessionId !== null && !validUuid(sessionId))) {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  const script = await session.supabase.from("writer_scripts").select("id")
    .eq("id", id).eq("owner_id", session.user.id).maybeSingle();
  if (script.error || !script.data) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  try {
    return writerJson(await loadGuidedWritingConversation(session.supabase, session.user.id, id, {
      scope, sceneId: scope === "scene" ? sceneId : null, sessionId,
    }));
  } catch (cause) {
    if (cause instanceof WriterGuidedWritingError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos cargar Guided Writing.", code: "server_error" }, 500);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !validScope(body.value.scope)
    || (body.value.scope === "scene" && !validUuid(body.value.sceneId))
    || (body.value.scope === "document" && body.value.sceneId !== null)
    || (body.value.sessionId !== null && body.value.sessionId !== undefined && !validUuid(body.value.sessionId))
    || typeof body.value.documentHash !== "string" || !/^[0-9a-f]{64}$/u.test(body.value.documentHash)
    || typeof body.value.question !== "string" || body.value.question.trim().length < 1 || body.value.question.trim().length > 1_200
    || (body.value.operationId !== undefined && !validUuid(body.value.operationId))
    || !validSelection(body.value.selection)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    const scope = body.value.scope as WriterGuidedWritingScope;
    const sceneId = scope === "scene" ? String(body.value.sceneId) : null;
    const sessionId = typeof body.value.sessionId === "string" ? body.value.sessionId : null;
    const selection = isRecord(body.value.selection)
      ? { blockId: String(body.value.selection.blockId), text: String(body.value.selection.text) }
      : null;
    const result = await executeWriterGuidedWriting(session.user.id, {
      scriptId: id,
      scope,
      sceneId,
      sessionId,
      documentHash: String(body.value.documentHash),
      question: String(body.value.question),
      operationId: typeof body.value.operationId === "string" ? body.value.operationId : undefined,
      selection,
      signal: request.signal,
    }, { readDb: session.supabase });
    return writerJson(result);
  } catch (cause) {
    if (cause instanceof WriterGuidedWritingError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos responder ahora.", code: "server_error" }, 500);
  }
}

function validScope(value: unknown): value is WriterGuidedWritingScope {
  return value === "scene" || value === "document";
}

function validSelection(value: unknown) {
  return value === null || value === undefined || (isRecord(value)
    && validUuid(value.blockId) && typeof value.text === "string" && value.text.length <= 1_200);
}
