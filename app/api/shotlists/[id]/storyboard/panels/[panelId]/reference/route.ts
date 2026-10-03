import { validUuid, writerApiSession } from "@/lib/writer/api";
import { storyboardError, storyboardJson } from "@/lib/storyboard/api";
import { storeStoryboardReference, STORYBOARD_ASSET_MAX_BYTES } from "@/lib/storyboard/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; panelId: string }> }) {
  const session = await writerApiSession();
  if (!session) return storyboardJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id, panelId } = await params;
  if (!validUuid(id) || !validUuid(panelId)) return storyboardJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  const panel = await session.supabase.from("storyboard_panels").select("id")
    .eq("id", panelId).eq("shotlist_id", id).eq("owner_id", session.user.id).maybeSingle();
  if (panel.error || !panel.data) return storyboardJson({ error: "Panel no encontrado.", code: "not_found" }, 404);
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > STORYBOARD_ASSET_MAX_BYTES + 100_000) return storyboardJson({ error: "La imagen supera 5 MB.", code: "too_large" }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return storyboardJson({ error: "Archivo no válido.", code: "invalid" }, 400); }
  const reuseAssetId = form.get("reuseAssetId");
  if (typeof reuseAssetId === "string" && validUuid(reuseAssetId)) {
    const asset = await session.supabase.from("writer_production_assets").select("id,width,height,status")
      .eq("id", reuseAssetId).eq("owner_id", session.user.id).eq("status", "ready").maybeSingle();
    if (asset.error || !asset.data) return storyboardJson({ error: "Referencia no disponible.", code: "not_found" }, 404);
    return storyboardJson({ assetId: String(asset.data.id), width: Number(asset.data.width), height: Number(asset.data.height), reused: true });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return storyboardJson({ error: "Selecciona una imagen.", code: "invalid" }, 400);
  try {
    return storyboardJson({ ...await storeStoryboardReference(session.user.id, file), reused: false }, 201);
  } catch (cause) {
    return storyboardError(cause);
  }
}
