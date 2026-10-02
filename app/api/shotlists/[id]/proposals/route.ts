import { createAdminClient } from "@/lib/supabase/admin";
import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { createShotlistProposals, loadProposals, WriterProductionAiError } from "@/lib/writer/production-ai-server";
import { loadWriterShotlist } from "@/lib/writer/production-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try {
    await loadWriterShotlist(session.supabase, session.user.id, id);
    return writerJson({ proposals: await loadProposals(session.supabase, session.user.id, id) });
  } catch { return writerJson({ error: "Shotlist no encontrada.", code: "not_found" }, 404); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !validUuid(body.value.operationId)
    || !Array.isArray(body.value.groupIds) || body.value.groupIds.length < 1 || body.value.groupIds.length > 12 || !body.value.groupIds.every(validUuid)
    || (body.value.mode !== "assisted" && body.value.mode !== "suggested")
    || (body.value.briefing !== undefined && (typeof body.value.briefing !== "string" || body.value.briefing.length > 2_000))) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    return writerJson(await createShotlistProposals({
      userId: session.user.id, shotlistId: id, groupIds: body.value.groupIds,
      mode: body.value.mode, briefing: body.value.briefing, operationId: body.value.operationId,
      readDb: session.supabase, signal: request.signal,
    }));
  } catch (cause) {
    if (cause instanceof WriterProductionAiError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos preparar la propuesta.", code: "server_error" }, 500);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !Array.isArray(body.value.proposalIds)
    || body.value.proposalIds.length < 1 || body.value.proposalIds.length > 120 || !body.value.proposalIds.every(validUuid)
    || (body.value.action !== "accept" && body.value.action !== "dismiss")) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  await loadWriterShotlist(session.supabase, session.user.id, id);
  const admin = createAdminClient();
  const proposals = await admin.from("writer_shotlist_proposals").select("id,group_id,payload,status")
    .eq("owner_id", session.user.id).eq("shotlist_id", id).in("id", body.value.proposalIds).eq("status", "pending");
  if (proposals.error || (proposals.data?.length ?? 0) !== body.value.proposalIds.length) return writerJson({ error: "Una propuesta ya cambió.", code: "conflict" }, 409);
  if (body.value.action === "dismiss") {
    await admin.from("writer_shotlist_proposals").update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("owner_id", session.user.id).eq("shotlist_id", id).in("id", body.value.proposalIds);
    return writerJson({ saved: true, accepted: 0 });
  }
  let accepted = 0;
  for (const proposal of proposals.data ?? []) {
    const created = await session.supabase.rpc("writer_add_shot", {
      p_shotlist_id: id, p_group_id: proposal.group_id, p_operation_id: proposal.id, p_origin: "suggested",
    });
    if (created.error || !created.data || !isRecord(proposal.payload)) return writerJson({ error: "No pudimos incorporar todas las propuestas.", code: "partial" }, 409);
    const payload = proposal.payload;
    const updated = await admin.from("writer_shotlist_shots").update({
      shot_type: payload.shotType, subject: payload.subject, angle: payload.angle, movement: payload.movement,
      lens: payload.lens, setup: payload.setup, duration_seconds: payload.durationSeconds,
      description: payload.description, intention: payload.intention, source_block_id: payload.sourceBlockId,
      updated_at: new Date().toISOString(),
    }).eq("id", created.data).eq("owner_id", session.user.id).eq("shotlist_id", id);
    if (updated.error) return writerJson({ error: "No pudimos incorporar todas las propuestas.", code: "partial" }, 409);
    await admin.from("writer_shotlist_proposals").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", proposal.id).eq("owner_id", session.user.id);
    accepted += 1;
  }
  return writerJson({ saved: true, accepted });
}
