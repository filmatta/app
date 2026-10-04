import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { isWriterIdeaCategory } from "@/lib/writer/ideas";
import { executeWriterIdeas, WriterIdeasError } from "@/lib/writer/ideas-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión." }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value)
    || (body.value.scope !== "scene" && body.value.scope !== "document")
    || (body.value.scope === "scene" && !validUuid(body.value.sceneId))
    || (body.value.scope === "document" && body.value.sceneId !== null)
    || typeof body.value.question !== "string" || body.value.question.length > 500
    || (body.value.category !== null && !isWriterIdeaCategory(body.value.category))
    || !validUuid(body.value.operationId)) {
    return body.ok ? writerJson({ error: "Solicitud inválida." }, 400) : body.response;
  }
  try {
    return writerJson(await executeWriterIdeas(session.user.id, {
      scriptId: id,
      scope: body.value.scope,
      sceneId: body.value.scope === "scene" ? String(body.value.sceneId) : null,
      question: body.value.question,
      category: isWriterIdeaCategory(body.value.category) ? body.value.category : null,
      operationId: body.value.operationId,
      signal: request.signal,
    }, { readDb: session.supabase }));
  } catch (cause) {
    if (cause instanceof WriterIdeasError) return writerJson({ error: cause.message, code: cause.code }, cause.status);
    return writerJson({ error: "No pudimos preparar Ideas ahora.", code: "server_error" }, 500);
  }
}
