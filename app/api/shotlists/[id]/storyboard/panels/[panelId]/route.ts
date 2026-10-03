import { validUuid, writerApiSession } from "@/lib/writer/api";
import { readStoryboardJson, record, storyboardError, storyboardJson } from "@/lib/storyboard/api";
import { runStoryboardAssetCleanup } from "@/lib/storyboard/assets";
import { deleteStoryboardPanel, loadStoryboardShot, saveStoryboardPanel } from "@/lib/storyboard/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; panelId: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id, panelId } = await params;
  if (!validUuid(id) || !validUuid(panelId)) return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try {
    const panel = await session.supabase.from("storyboard_panels").select("shot_id")
      .eq("id", panelId).eq("owner_id", session.user.id).eq("shotlist_id", id).maybeSingle();
    if (panel.error || !panel.data) return storyboardJson({ error: "Panel no encontrado.", code: "not_found" }, 404);
    const state = await loadStoryboardShot(session.supabase, session.user.id, id, String(panel.data.shot_id));
    const value = state.shot.panels.find((candidate) => candidate.id === panelId);
    return value ? storyboardJson({ panel: value, shot: state.shot }) : storyboardJson({ error: "Panel no encontrado.", code: "not_found" }, 404);
  } catch (cause) {
    return storyboardError(cause);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; panelId: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id, panelId } = await params;
  const body = await readStoryboardJson(request);
  if (!body.ok) return body.response;
  if (!validUuid(id) || !validUuid(panelId) || !record(body.value)
    || !validUuid(body.value.expectedRevisionId) || !validUuid(body.value.operationId)
    || !record(body.value.document)) {
    return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  try {
    const saved = await saveStoryboardPanel({
      db: session.supabase,
      userId: session.user.id,
      shotlistId: id,
      panelId,
      expectedRevisionId: body.value.expectedRevisionId,
      operationId: body.value.operationId,
      document: body.value.document,
      visualNote: body.value.visualNote,
    });
    return storyboardJson({ saved: true, ...saved });
  } catch (cause) {
    return storyboardError(cause);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; panelId: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id, panelId } = await params;
  if (!validUuid(id) || !validUuid(panelId)) return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try {
    const deleted = await deleteStoryboardPanel({ db: session.supabase, userId: session.user.id, shotlistId: id, panelId });
    await runStoryboardAssetCleanup(session.user.id, deleted.assetIds);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return storyboardError(cause);
  }
}
