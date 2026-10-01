import { createAdminClient } from "@/lib/supabase/admin";
import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { executeWriterNarrativePulse, loadWriterNarrativePulseState, mutateWriterPulseMilestone, WriterNarrativePulseError } from "@/lib/writer/narrative-pulse-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try { return writerJson(await loadWriterNarrativePulseState(session.supabase, session.user.id, id)); }
  catch (cause) { return pulseError(cause, "No pudimos cargar Narrative Pulse."); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || typeof body.value.sourceHash !== "string" || !/^[0-9a-f]{64}$/u.test(body.value.sourceHash) || (body.value.operationId !== undefined && !validUuid(body.value.operationId))) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    const result = await executeWriterNarrativePulse(session.user.id, { scriptId: id, sourceHash: body.value.sourceHash, operationId: body.value.operationId, signal: request.signal }, { readDb: session.supabase });
    return writerJson(result, result.pending ? 202 : 200);
  } catch (cause) { return pulseError(cause, "No pudimos analizar Narrative Pulse ahora."); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)) return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  try { return writerJson(await mutateWriterPulseMilestone(createAdminClient(), session.user.id, id, body.value)); }
  catch (cause) { return pulseError(cause, "No pudimos guardar esta decisión."); }
}

function pulseError(cause: unknown, fallback: string) {
  if (cause instanceof WriterNarrativePulseError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
  return writerJson({ error: fallback, code: "server_error" }, 500);
}
