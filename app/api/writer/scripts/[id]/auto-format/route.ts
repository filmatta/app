import { WRITER_MAX_BLOCKS, validateWriterDocument } from "@/lib/writer/document";
import { classifyWriterAutoFormatCandidates, writerAutoFormatAiAvailable } from "@/lib/writer/auto-format-server";
import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { createWriterAutoFormatPlan, writerAutoFormatCandidates, type WriterAutoFormatPlan } from "@/lib/writer/smart-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  if (!writerAutoFormatAiAvailable()) return writerJson({ error: "La clasificación contextual está limitada a Preview con Supabase Test.", code: "unavailable" }, 503);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !validUuid(body.value.operationId)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  const scope = parseScope(body.value.scope);
  const blockIds = parseBlockIds(body.value.blockIds);
  if (!scope || !blockIds) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);

  const script = await session.supabase.from("writer_scripts").select("id,document").eq("id", id).maybeSingle();
  if (script.error) return writerJson({ error: "No se pudo validar el guion." }, 500);
  if (!script.data) return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404);
  const document = validateWriterDocument(script.data.document);
  if (!document.ok) return writerJson({ error: "El documento guardado no es válido.", code: "invalid" }, 409);
  const plan = createWriterAutoFormatPlan(document.document, { scope, blockIds });
  const candidates = writerAutoFormatCandidates(document.document, plan);

  try {
    const result = await classifyWriterAutoFormatCandidates(candidates, { operationId: body.value.operationId, signal: request.signal });
    console.info("writer_auto_format_classified", {
      operationId: body.value.operationId,
      scriptId: id,
      ownerId: session.user.id,
      model: result.model,
      candidateCount: candidates.length,
      usage: result.usage,
      costMicrousd: result.costMicrousd,
      latencyMs: result.latencyMs,
    });
    return writerJson({
      classifications: result.classifications,
      model: result.model,
      usage: result.usage,
      costMicrousd: result.costMicrousd,
      maximumCostMicrousd: result.maximumCostMicrousd,
      latencyMs: result.latencyMs,
      userCreditsConsumed: 0,
    });
  } catch {
    return writerJson({ error: "La clasificación contextual no está disponible. Puedes aplicar la detección local y revisar los elementos pendientes.", code: "classifier_unavailable" }, 503);
  }
}

function parseScope(value: unknown): WriterAutoFormatPlan["scope"] | null {
  return value === "paste" || value === "document" || value === "partial" ? value : null;
}

function parseBlockIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > WRITER_MAX_BLOCKS) return null;
  const ids = value.filter((item): item is string => typeof item === "string" && item.length >= 1 && item.length <= 100);
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}
