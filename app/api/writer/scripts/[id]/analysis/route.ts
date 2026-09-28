import { createAdminClient } from "@/lib/supabase/admin";
import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  const [analysis, decisions, script] = await Promise.all([
    session.supabase.from("writer_import_analyses")
      .select("document_revision,analysis_version,provider_model,identities,evidence,observations")
      .eq("script_id", id).maybeSingle(),
    session.supabase.from("writer_import_analysis_decisions")
      .select("fingerprint,block_id,decision,identity_key,identity_name,decided_at")
      .eq("script_id", id),
    session.supabase.from("writer_scripts").select("revision").eq("id", id).maybeSingle(),
  ]);
  if (script.error || !script.data) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  if (analysis.error || decisions.error) return writerJson({ error: "No se pudo cargar el análisis.", code: "server_error" }, 500);
  if (!analysis.data) return writerJson({ analysis: null, decisions: [] });
  return writerJson({
    analysis: analysis.data,
    decisions: decisions.data ?? [],
    compatibleRevision: Number(analysis.data.document_revision) === Number(script.data.revision),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isDecision(body.value)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  const result = await createAdminClient().rpc("writer_save_import_decision", {
    p_user_id: session.user.id,
    p_script_id: id,
    p_fingerprint: body.value.fingerprint,
    p_block_id: body.value.blockId,
    p_decision: body.value.state,
    p_identity_key: body.value.identityKey ?? null,
    p_identity_name: body.value.identityName ?? null,
  });
  if (result.error) return writerJson({ error: "No se pudo guardar la decisión.", code: "server_error" }, 500);
  return writerJson({ saved: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)
    || typeof body.value.fingerprint !== "string" || !validFingerprint(body.value.fingerprint)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  const result = await createAdminClient().rpc("writer_delete_import_decision", {
    p_user_id: session.user.id,
    p_script_id: id,
    p_fingerprint: body.value.fingerprint,
  });
  if (result.error) return writerJson({ error: "No se pudo restaurar la decisión.", code: "server_error" }, 500);
  return writerJson({ removed: true });
}

function isDecision(value: unknown): value is {
  fingerprint: string;
  blockId: string;
  state: "confirmed" | "linked" | "ignored";
  identityKey?: string;
  identityName?: string;
} {
  if (!isRecord(value) || !validFingerprint(value.fingerprint) || !validUuid(value.blockId)
    || !["confirmed", "linked", "ignored"].includes(String(value.state))) return false;
  if (value.identityKey !== undefined && (typeof value.identityKey !== "string" || value.identityKey.length > 128)) return false;
  if (value.identityName !== undefined && (typeof value.identityName !== "string" || value.identityName.length > 64)) return false;
  return true;
}

function validFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9:_-]{1,160}$/iu.test(value);
}
