import { createAdminClient } from "@/lib/supabase/admin";
import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { validateWriterDocument } from "@/lib/writer/document";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";
import { executeWriterSetupPayoffAnalysis, loadSetupPayoffState, WriterSetupPayoffError } from "@/lib/writer/setup-payoff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  const script = await session.supabase.from("writer_scripts").select("id").eq("id", id).eq("owner_id", session.user.id).maybeSingle();
  if (script.error || !script.data) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  try { return writerJson(await loadSetupPayoffState(session.supabase, session.user.id, id)); }
  catch (cause) {
    if (cause instanceof WriterSetupPayoffError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos cargar Setup / Payoff.", code: "server_error" }, 500);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)
    || typeof body.value.sourceHash !== "string" || !/^[0-9a-f]{64}$/u.test(body.value.sourceHash)
    || (body.value.operationId !== undefined && !validUuid(body.value.operationId))) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    const result = await executeWriterSetupPayoffAnalysis(session.user.id, {
      scriptId: id, sourceHash: body.value.sourceHash, operationId: body.value.operationId, signal: request.signal,
    }, { readDb: session.supabase });
    return writerJson(result, result.pending ? 202 : 200);
  } catch (cause) {
    if (cause instanceof WriterSetupPayoffError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos analizar Setup / Payoff ahora.", code: "server_error" }, 500);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  const db = createAdminClient();
  let result;
  if (body.value.action === "elementStatus" && validUuid(body.value.elementId)
    && ["confirmed", "dismissed", "needs_review"].includes(String(body.value.status))) {
    result = await db.rpc("writer_set_narrative_element_status", {
      p_user_id: session.user.id, p_script_id: id, p_element_id: body.value.elementId, p_status: body.value.status,
    });
  } else if (body.value.action === "linkStatus" && validUuid(body.value.linkId)
    && ["confirmed", "dismissed", "needs_review"].includes(String(body.value.status))) {
    result = await db.rpc("writer_set_narrative_link_status", {
      p_user_id: session.user.id, p_script_id: id, p_link_id: body.value.linkId, p_status: body.value.status,
    });
  } else if (body.value.action === "createElement" && validUuid(body.value.sceneId)
    && (body.value.blockId === null || validUuid(body.value.blockId))
    && ["setup", "payoff"].includes(String(body.value.elementType))
    && cleanString(body.value.label, 160) && cleanString(body.value.excerpt, 360)) {
    const script = await session.supabase.from("writer_scripts").select("document")
      .eq("id", id).eq("owner_id", session.user.id).maybeSingle();
    const validated = script.data ? validateWriterDocument(script.data.document) : null;
    const scene = validated?.ok
      ? deriveWriterSceneSources(validated.document).find((item) => item.sceneId === body.value.sceneId)
      : null;
    if (!scene || (body.value.blockId !== null && !scene.blocks.some((block) => block.id === body.value.blockId))) {
      return writerJson({ error: "La referencia narrativa ya no existe.", code: "stale_reference" }, 409);
    }
    result = await db.rpc("writer_create_narrative_element", {
      p_user_id: session.user.id, p_script_id: id, p_scene_id: body.value.sceneId,
      p_block_id: body.value.blockId, p_element_type: body.value.elementType,
      p_label: String(body.value.label).trim(), p_excerpt: String(body.value.excerpt).trim(),
    });
  } else if (body.value.action === "createLink" && validUuid(body.value.setupElementId) && validUuid(body.value.payoffElementId)) {
    result = await db.rpc("writer_create_narrative_link", {
      p_user_id: session.user.id, p_script_id: id,
      p_setup_element_id: body.value.setupElementId, p_payoff_element_id: body.value.payoffElementId,
    });
  } else {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  if (result.error) return writerJson({ error: "No pudimos guardar esta decisión.", code: "server_error" }, 500);
  return writerJson({ saved: true, id: result.data ?? null });
}

function cleanString(value: unknown, limit: number) {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= limit;
}
