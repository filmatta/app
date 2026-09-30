import { createAdminClient } from "@/lib/supabase/admin";
import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { WRITER_SCRIPT_ASSISTANT_VERSION } from "@/lib/writer/script-assistant";
import { executeWriterSceneAnalysis, mapAnalysisRow, WriterSceneAssistantError } from "@/lib/writer/script-assistant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  // Reads deliberately use the authenticated RLS client. The service role is
  // reserved for the narrowly scoped mutation RPCs below.
  const db = session.supabase;
  const script = await db.from("writer_scripts").select("id").eq("id", id).eq("owner_id", session.user.id).maybeSingle();
  if (script.error || !script.data) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  const [analyses, overrides, dismissals, settings] = await Promise.all([
    db.from("writer_scene_analyses").select("id,script_id,scene_id,source_hash,analysis_version,model,status,analysis_payload,error_code,updated_at")
      .eq("owner_id", session.user.id).eq("script_id", id).eq("analysis_version", WRITER_SCRIPT_ASSISTANT_VERSION)
      .order("updated_at", { ascending: false }).limit(300),
    db.from("writer_scene_analysis_overrides").select("scene_id,objective,obstacle,change")
      .eq("owner_id", session.user.id).eq("script_id", id),
    db.from("writer_scene_observation_dismissals").select("scene_id,source_hash,analysis_version,observation_id")
      .eq("owner_id", session.user.id).eq("script_id", id),
    db.from("writer_script_assistant_settings").select("enabled").eq("owner_id", session.user.id).eq("script_id", id).maybeSingle(),
  ]);
  if (analyses.error || overrides.error || dismissals.error || settings.error) {
    return writerJson({ error: "No pudimos cargar Script Assistant.", code: "server_error" }, 500);
  }
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of analyses.data ?? []) if (!latest.has(String(row.scene_id))) latest.set(String(row.scene_id), row);
  return writerJson({
    enabled: settings.data?.enabled === true,
    analyses: [...latest.values()].map(mapAnalysisRow),
    overrides: (overrides.data ?? []).map((row) => ({ sceneId: row.scene_id, objective: row.objective, obstacle: row.obstacle, change: row.change })),
    dismissals: (dismissals.data ?? []).map((row) => ({ sceneId: row.scene_id, sourceHash: row.source_hash, analysisVersion: row.analysis_version, observationId: row.observation_id })),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !validUuid(body.value.sceneId)
    || typeof body.value.sourceHash !== "string" || !/^[0-9a-f]{64}$/u.test(body.value.sourceHash)
    || (body.value.operationId !== undefined && !validUuid(body.value.operationId))) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    const result = await executeWriterSceneAnalysis(session.user.id, {
      scriptId: id,
      sceneId: body.value.sceneId,
      sourceHash: body.value.sourceHash,
      operationId: body.value.operationId,
      signal: request.signal,
    }, { readDb: session.supabase });
    return writerJson(result, result.pending ? 202 : 200);
  } catch (cause) {
    if (cause instanceof WriterSceneAssistantError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos analizar esta escena ahora.", code: "server_error" }, 500);
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
  if (body.value.action === "enabled" && typeof body.value.enabled === "boolean") {
    result = await db.rpc("writer_set_script_assistant_enabled", { p_user_id: session.user.id, p_script_id: id, p_enabled: body.value.enabled });
  } else if (body.value.action === "override" && validUuid(body.value.sceneId)
    && ["objective", "obstacle", "change"].includes(String(body.value.field))
    && (body.value.value === null || typeof body.value.value === "string") && String(body.value.value ?? "").length <= 500) {
    result = await db.rpc("writer_save_scene_analysis_override", {
      p_user_id: session.user.id, p_script_id: id, p_scene_id: body.value.sceneId,
      p_field: body.value.field, p_value: body.value.value,
    });
  } else if (body.value.action === "dismiss" && validUuid(body.value.sceneId)
    && typeof body.value.sourceHash === "string" && /^[0-9a-f]{64}$/u.test(body.value.sourceHash)
    && typeof body.value.observationId === "string" && body.value.observationId.length <= 120
    && typeof body.value.dismissed === "boolean") {
    result = await db.rpc("writer_set_scene_observation_dismissed", {
      p_user_id: session.user.id, p_script_id: id, p_scene_id: body.value.sceneId,
      p_source_hash: body.value.sourceHash, p_analysis_version: WRITER_SCRIPT_ASSISTANT_VERSION,
      p_observation_id: body.value.observationId, p_dismissed: body.value.dismissed,
    });
  } else {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  if (result.error) return writerJson({ error: "No pudimos guardar este ajuste.", code: "server_error" }, 500);
  return writerJson({ saved: true });
}
