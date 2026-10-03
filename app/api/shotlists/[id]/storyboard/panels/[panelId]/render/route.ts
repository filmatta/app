import { validUuid, writerApiSession } from "@/lib/writer/api";
import { storyboardError, storyboardJson } from "@/lib/storyboard/api";
import { storeStoryboardThumbnail, STORYBOARD_ASSET_MAX_BYTES } from "@/lib/storyboard/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; panelId: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id, panelId } = await params;
  if (!validUuid(id) || !validUuid(panelId)) return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > STORYBOARD_ASSET_MAX_BYTES + 100_000) return storyboardJson({ error: "La miniatura supera el límite.", code: "too_large" }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return storyboardJson({ error: "Miniatura no válida.", code: "invalid" }, 400); }
  const revisionId = form.get("revisionId");
  const operationId = form.get("operationId");
  const file = form.get("file");
  if (!validUuid(revisionId) || !validUuid(operationId) || !(file instanceof File)) {
    return storyboardJson({ error: "Miniatura no válida.", code: "invalid" }, 400);
  }
  const panel = await session.supabase.from("storyboard_panels").select("id,current_revision_id")
    .eq("id", panelId).eq("owner_id", session.user.id).eq("shotlist_id", id).eq("current_revision_id", revisionId).maybeSingle();
  if (panel.error || !panel.data) return storyboardJson({ error: "La revisión ya no es la actual.", code: "conflict" }, 409);
  const revision = await session.supabase.from("storyboard_panel_revisions").select("id")
    .eq("id", revisionId).eq("panel_id", panelId).eq("owner_id", session.user.id).maybeSingle();
  if (revision.error || !revision.data) return storyboardJson({ error: "Revisión no encontrada.", code: "not_found" }, 404);
  try {
    return storyboardJson({ rendered: true, ...await storeStoryboardThumbnail({ userId: session.user.id, panelId, revisionId, operationId, file }) }, 201);
  } catch (cause) {
    return storyboardError(cause);
  }
}
