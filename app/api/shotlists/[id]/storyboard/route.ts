import { validUuid, writerApiSession } from "@/lib/writer/api";
import { readStoryboardJson, record, storyboardError, storyboardJson } from "@/lib/storyboard/api";
import {
  createStoryboardPanel,
  loadStoryboardBoard,
  reorderStoryboardPanels,
} from "@/lib/storyboard/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try {
    return storyboardJson(await loadStoryboardBoard(session.supabase, session.user.id, id));
  } catch (cause) {
    return storyboardError(cause);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readStoryboardJson(request);
  if (!body.ok) return body.response;
  if (!validUuid(id) || !record(body.value) || !validUuid(body.value.shotId) || !validUuid(body.value.operationId)) {
    return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  try {
    const created = await createStoryboardPanel({
      db: session.supabase,
      userId: session.user.id,
      shotlistId: id,
      shotId: body.value.shotId,
      operationId: body.value.operationId,
      document: body.value.document,
      visualNote: body.value.visualNote,
    });
    return storyboardJson(created, 201);
  } catch (cause) {
    return storyboardError(cause);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  const body = await readStoryboardJson(request);
  if (!body.ok) return body.response;
  if (!validUuid(id) || !record(body.value) || body.value.action !== "reorder"
    || !validUuid(body.value.shotId) || !Array.isArray(body.value.panelIds)
    || body.value.panelIds.length < 1 || body.value.panelIds.length > 100
    || !body.value.panelIds.every(validUuid)) {
    return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  try {
    await reorderStoryboardPanels({
      db: session.supabase,
      userId: session.user.id,
      shotlistId: id,
      shotId: body.value.shotId,
      panelIds: body.value.panelIds,
    });
    return storyboardJson({ saved: true });
  } catch (cause) {
    return storyboardError(cause);
  }
}
