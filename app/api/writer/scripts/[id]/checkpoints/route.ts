import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { normalizeWriterTitle, validateWriterDocument } from "@/lib/writer/document";
import { WRITER_AUTO_CHECKPOINT_RETENTION, type WriterCheckpointKind } from "@/lib/writer/checkpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<WriterCheckpointKind>(["manual", "before_auto_format", "before_replace_all", "before_restore"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión." }, 401);
  const { id } = await context.params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida." }, 400);
  const result = await session.supabase.from("writer_checkpoints")
    .select("id,kind,label,source_revision,created_at")
    .eq("script_id", id).eq("owner_id", session.user.id)
    .order("created_at", { ascending: false }).limit(80);
  if (result.error) return writerJson({ error: "No pudimos cargar las versiones." }, 500);
  return writerJson({ checkpoints: (result.data ?? []).map((row) => ({
    id: String(row.id), kind: row.kind, label: String(row.label),
    sourceRevision: Number(row.source_revision), createdAt: String(row.created_at),
  })) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión." }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !isRecord(body.value.snapshot)
    || typeof body.value.kind !== "string" || !KINDS.has(body.value.kind as WriterCheckpointKind)
    || typeof body.value.label !== "string" || !body.value.label.trim() || body.value.label.trim().length > 120
    || !Number.isSafeInteger(body.value.sourceRevision) || Number(body.value.sourceRevision) < 1) {
    return body.ok ? writerJson({ error: "Solicitud inválida." }, 400) : body.response;
  }
  const title = normalizeWriterTitle(body.value.snapshot.title);
  const document = validateWriterDocument(body.value.snapshot.document);
  const schemaVersion = Number(body.value.snapshot.schemaVersion);
  if (!title || !document.ok || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    return writerJson({ error: "La versión no contiene un documento válido." }, 400);
  }
  const script = await session.supabase.from("writer_scripts").select("id")
    .eq("id", id).eq("owner_id", session.user.id).maybeSingle();
  if (script.error || !script.data) return writerJson({ error: "Guion no encontrado." }, 404);
  const inserted = await session.supabase.from("writer_checkpoints").insert({
    owner_id: session.user.id, script_id: id, kind: body.value.kind,
    label: body.value.label.trim(), title, document: document.document,
    schema_version: schemaVersion, source_revision: Number(body.value.sourceRevision),
  }).select("id,kind,label,source_revision,created_at").single();
  if (inserted.error || !inserted.data) return writerJson({ error: "No pudimos crear la versión." }, 500);
  if (body.value.kind !== "manual") {
    const older = await session.supabase.from("writer_checkpoints").select("id")
      .eq("script_id", id).eq("owner_id", session.user.id).neq("kind", "manual")
      .order("created_at", { ascending: false }).range(WRITER_AUTO_CHECKPOINT_RETENTION, 79);
    const staleIds = (older.data ?? []).map((row) => row.id);
    if (staleIds.length) await session.supabase.from("writer_checkpoints").delete().in("id", staleIds);
  }
  return writerJson({ checkpoint: {
    id: String(inserted.data.id), kind: inserted.data.kind, label: String(inserted.data.label),
    sourceRevision: Number(inserted.data.source_revision), createdAt: String(inserted.data.created_at),
  } }, 201);
}
