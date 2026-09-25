import {
  isRecord,
  parseWriterSnapshot,
  readWriterJson,
  validUuid,
  writerApiSession,
  writerJson,
  writerRpcError,
} from "@/lib/writer/api";
import { normalizeWriterTitle } from "@/lib/writer/document";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  const result = await session.supabase
    .from("writer_scripts")
    .select("id,title,document,schema_version,revision,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (result.error) return writerJson({ error: "No se pudo cargar el guion." }, 500);
  if (!result.data) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  return writerJson({ script: result.data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  const body = await readWriterJson(request);
  if (!body.ok) return body.response;
  if (!isRecord(body.value) || !validUuid(body.value.operationId)) {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  const expectedRevision = body.value.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) {
    return writerJson({ error: "Revisión inválida.", code: "invalid" }, 400);
  }

  if (body.value.kind === "rename") {
    const title = normalizeWriterTitle(body.value.title);
    if (!title) return writerJson({ error: "Título inválido.", code: "invalid" }, 400);
    const result = await session.supabase.rpc("writer_rename_script", {
      p_script_id: id,
      p_expected_revision: expectedRevision,
      p_operation_id: body.value.operationId,
      p_title: title,
    });
    if (result.error) return writerRpcError(result.error);
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return writerJson(row);
  }

  const parsed = parseWriterSnapshot(body.value);
  if (!parsed.ok) return writerJson({ error: parsed.message, code: "invalid" }, 400);
  const result = await session.supabase.rpc("writer_save_script", {
    p_script_id: id,
    p_expected_revision: expectedRevision,
    p_operation_id: body.value.operationId,
    p_title: parsed.snapshot.title,
    p_document: parsed.snapshot.document,
    p_schema_version: parsed.snapshot.schemaVersion,
  });
  if (result.error) return writerRpcError(result.error);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return writerJson(row);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  const body = await readWriterJson(request);
  if (!body.ok) return body.response;
  if (!isRecord(body.value) || !Number.isSafeInteger(body.value.expectedRevision)) {
    return writerJson({ error: "Revisión inválida.", code: "invalid" }, 400);
  }
  const result = await session.supabase.rpc("writer_delete_script", {
    p_script_id: id,
    p_expected_revision: body.value.expectedRevision,
  });
  if (result.error) return writerRpcError(result.error);
  if (!result.data) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
