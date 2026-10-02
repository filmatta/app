import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson, writerRpcError } from "@/lib/writer/api";
import { assertOwnedWriterScript, listWriterShotlists, WriterProductionError } from "@/lib/writer/production-server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try {
    await assertOwnedWriterScript(session.supabase, session.user.id, id);
    return writerJson({ shotlists: await listWriterShotlists(session.supabase, session.user.id, id) });
  } catch (cause) {
    if (cause instanceof WriterProductionError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos cargar las shotlists.", code: "server_error" }, 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !validUuid(body.value.operationId)
    || typeof body.value.title !== "string" || body.value.title.trim().length < 1 || body.value.title.trim().length > 160) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  const result = await session.supabase.rpc("writer_create_shotlist", {
    p_script_id: id, p_title: body.value.title.trim(), p_operation_id: body.value.operationId,
  });
  if (result.error) return writerRpcError(result.error);
  return writerJson({ id: result.data }, 201);
}
