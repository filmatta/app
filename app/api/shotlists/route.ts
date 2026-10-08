import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { listWriterShotlists } from "@/lib/writer/production-server";
import { recordCreateEvent, reportCreateFailure } from "@/lib/create/telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  return writerJson({ shotlists: await listWriterShotlists(session.supabase, session.user.id) });
}

export async function POST(request: Request) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const body = await readWriterJson(request);
  if (!body.ok || !isRecord(body.value) || !validUuid(body.value.operationId) || !validUuid(body.value.projectId)
    || typeof body.value.title !== "string" || body.value.title.trim().length < 1 || body.value.title.trim().length > 160) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  const result = await session.supabase.rpc("writer_create_project_shotlist_v1", {
    p_project_id: body.value.projectId, p_script_id: null, p_title: body.value.title.trim(), p_operation_id: body.value.operationId,
  });
  if (result.error) {
    reportCreateFailure("shotlist", "create", result.error, body.value.projectId);
    return writerJson({ error: "No pudimos crear la shotlist.", code: "server_error" }, 500);
  }
  recordCreateEvent("shotlist_created", { userId: session.user.id, projectId: body.value.projectId, artifactId: typeof result.data === "string" ? result.data : null });
  return writerJson({ id: result.data }, 201);
}
