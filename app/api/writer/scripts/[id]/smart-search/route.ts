import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { validateWriterDocument } from "@/lib/writer/document";
import { buildWriterSmartSearchContext, findWriterSmartCandidates, type WriterSearchScope } from "@/lib/writer/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión." }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)
    || typeof body.value.query !== "string" || !body.value.query.trim() || body.value.query.length > 500
    || (body.value.scope !== "scene" && body.value.scope !== "document")
    || (body.value.sceneId !== null && body.value.sceneId !== undefined && !validUuid(body.value.sceneId))) {
    return body.ok ? writerJson({ error: "Solicitud inválida." }, 400) : body.response;
  }
  const script = await session.supabase.from("writer_scripts").select("document")
    .eq("id", id).eq("owner_id", session.user.id).maybeSingle();
  if (script.error || !script.data) return writerJson({ error: "Guion no encontrado." }, 404);
  const valid = validateWriterDocument(script.data.document);
  if (!valid.ok) return writerJson({ error: "El documento guardado no es compatible." }, 409);
  const results = findWriterSmartCandidates(
    valid.document,
    body.value.query,
    body.value.scope as WriterSearchScope,
    typeof body.value.sceneId === "string" ? body.value.sceneId : null,
  );
  const boundedContext = buildWriterSmartSearchContext(body.value.query, results);
  return writerJson({
    results,
    mode: "local_lexical",
    mocked: true,
    metrics: {
      inputTokens: 0,
      outputTokens: 0,
      costMicrousd: 0,
      chunks: 0,
      scope: body.value.scope,
      candidateCount: boundedContext.candidates.length,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
  });
}
