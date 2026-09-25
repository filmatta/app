import {
  isRecord,
  readWriterJson,
  validUuid,
  writerApiSession,
  writerJson,
  writerRpcError,
} from "@/lib/writer/api";
import { normalizeWriterTitle } from "@/lib/writer/document";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readWriterJson(request);
  if (!body.ok) return body.response;
  if (!validUuid(id) || !isRecord(body.value) || !validUuid(body.value.operationId)) {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  const title = normalizeWriterTitle(body.value.title);
  if (!title) return writerJson({ error: "Título inválido.", code: "invalid" }, 400);
  const result = await session.supabase.rpc("writer_duplicate_script", {
    p_source_id: id,
    p_operation_id: body.value.operationId,
    p_title: title,
  });
  if (result.error) return writerRpcError(result.error);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return writerJson({ script: row }, 201);
}
