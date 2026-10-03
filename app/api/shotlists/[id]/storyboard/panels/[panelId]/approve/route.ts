import { validUuid, writerApiSession } from "@/lib/writer/api";
import { approveStoryboardPanel } from "@/lib/storyboard/server";
import { readStoryboardJson, record, storyboardError, storyboardJson } from "@/lib/storyboard/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; panelId: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id, panelId } = await params;
  const body = await readStoryboardJson(request);
  if (!body.ok) return body.response;
  if (!validUuid(id) || !validUuid(panelId) || !record(body.value) || !validUuid(body.value.revisionId)) {
    return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  try {
    const approvalId = await approveStoryboardPanel({ db: session.supabase, userId: session.user.id, shotlistId: id, panelId, revisionId: body.value.revisionId });
    return storyboardJson({ approved: true, approvalId, revisionId: body.value.revisionId });
  } catch (cause) {
    return storyboardError(cause);
  }
}
