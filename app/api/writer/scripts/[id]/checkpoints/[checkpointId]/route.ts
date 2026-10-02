import { validUuid, writerApiSession, writerJson } from "@/lib/writer/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; checkpointId: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión." }, 401);
  const { id, checkpointId } = await context.params;
  if (!validUuid(id) || !validUuid(checkpointId)) return writerJson({ error: "Solicitud inválida." }, 400);
  const result = await session.supabase.from("writer_checkpoints")
    .select("title,document,schema_version")
    .eq("id", checkpointId).eq("script_id", id).eq("owner_id", session.user.id).maybeSingle();
  if (result.error || !result.data) return writerJson({ error: "Versión no encontrada." }, 404);
  return writerJson({ snapshot: {
    title: result.data.title,
    document: result.data.document,
    schemaVersion: Number(result.data.schema_version),
  } });
}
