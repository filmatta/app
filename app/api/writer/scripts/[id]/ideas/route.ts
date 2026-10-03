import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { validateWriterDocument } from "@/lib/writer/document";
import { createMockWriterIdeas, isWriterIdeaCategory } from "@/lib/writer/ideas";
import { buildGuidedWritingContext } from "@/lib/writer/guided-writing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión." }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)
    || (body.value.scope !== "scene" && body.value.scope !== "document")
    || (body.value.sceneId !== null && body.value.sceneId !== undefined && !validUuid(body.value.sceneId))
    || typeof body.value.question !== "string" || body.value.question.length > 500
    || (body.value.category !== null && body.value.category !== undefined && !isWriterIdeaCategory(body.value.category))) {
    return body.ok ? writerJson({ error: "Solicitud inválida." }, 400) : body.response;
  }
  const script = await session.supabase.from("writer_scripts").select("document")
    .eq("id", id).eq("owner_id", session.user.id).maybeSingle();
  if (script.error || !script.data) return writerJson({ error: "Guion no encontrado." }, 404);
  const valid = validateWriterDocument(script.data.document);
  if (!valid.ok) return writerJson({ error: "El documento guardado no es compatible." }, 409);
  let guidedContext;
  try {
    guidedContext = await buildGuidedWritingContext({
      document: valid.document,
      scope: body.value.scope,
      sceneId: typeof body.value.sceneId === "string" ? body.value.sceneId : null,
    });
  } catch {
    return writerJson({ error: "Añade una escena válida antes de explorar Ideas." }, 422);
  }
  const ideas = createMockWriterIdeas(valid.document, {
    scope: body.value.scope,
    sceneId: typeof body.value.sceneId === "string" ? body.value.sceneId : null,
    question: body.value.question,
    category: isWriterIdeaCategory(body.value.category) ? body.value.category : null,
  });
  return writerJson({
    ideas,
    mode: "deterministic_qa_mock",
    mocked: true,
    metrics: {
      inputTokens: 0,
      outputTokens: 0,
      costMicrousd: 0,
      chunks: 0,
      scope: body.value.scope,
      contextScenes: guidedContext.scenes.length,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
  });
}
