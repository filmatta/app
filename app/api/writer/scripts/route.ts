import {
  createEmptyWriterDocument,
  WRITER_SCHEMA_VERSION,
} from "@/lib/writer/document";
import {
  isRecord,
  parseWriterSnapshot,
  readWriterJson,
  validUuid,
  writerApiSession,
  writerJson,
  writerRpcError,
} from "@/lib/writer/api";

export async function POST(request: Request) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const body = await readWriterJson(request);
  if (!body.ok) return body.response;
  if (!isRecord(body.value) || !validUuid(body.value.operationId)) {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  const parsed = parseWriterSnapshot({
    title: body.value.title ?? "Guion sin título",
    document: body.value.document ?? createEmptyWriterDocument(),
    schemaVersion: body.value.schemaVersion ?? WRITER_SCHEMA_VERSION,
  });
  if (!parsed.ok) return writerJson({ error: parsed.message, code: "invalid" }, 400);
  const result = await session.supabase.rpc("writer_create_script", {
    p_operation_id: body.value.operationId,
    p_title: parsed.snapshot.title,
    p_document: parsed.snapshot.document,
    p_schema_version: parsed.snapshot.schemaVersion,
  });
  if (result.error) return writerRpcError(result.error);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return writerJson({ script: row }, 201);
}
