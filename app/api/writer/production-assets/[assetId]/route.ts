import { createAdminClient } from "@/lib/supabase/admin";
import { validUuid, writerApiSession, writerJson } from "@/lib/writer/api";

export const dynamic = "force-dynamic";
const BUCKET = "writer-production-assets";

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { assetId } = await params;
  if (!validUuid(assetId)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  const admin = createAdminClient();
  const asset = await admin.from("writer_production_assets").select("storage_path")
    .eq("id", assetId).eq("owner_id", session.user.id).maybeSingle();
  if (asset.error || !asset.data) return writerJson({ error: "Imagen no encontrada.", code: "not_found" }, 404);
  const signed = await admin.storage.from(BUCKET).createSignedUrl(String(asset.data.storage_path), 60);
  if (signed.error || !signed.data) return writerJson({ error: "No pudimos abrir la imagen.", code: "storage" }, 500);
  return Response.redirect(signed.data.signedUrl, 302);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { assetId } = await params;
  if (!validUuid(assetId)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  const admin = createAdminClient();
  let unlinkPerformed = false;
  const asset = await admin.from("writer_production_assets").select("storage_path").eq("id", assetId).eq("owner_id", session.user.id).maybeSingle();
  if (asset.error || !asset.data) return writerJson({ error: "Imagen no encontrada.", code: "not_found" }, 404);
  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");
  if ((targetType === "breakdown" || targetType === "shot") && validUuid(targetId)) {
    const table = targetType === "breakdown" ? "writer_breakdown_elements" : "writer_shotlist_shots";
    const target = await session.supabase.from(table).select("id,asset_id,revision")
      .eq("id", targetId).eq("owner_id", session.user.id).eq("asset_id", assetId).maybeSingle();
    if (target.error || !target.data) return writerJson({ error: "La imagen ya no está vinculada a este elemento.", code: "conflict" }, 409);
    const unlinked = await admin.from(table).update({ asset_id: null, revision: Number(target.data.revision) + 1, updated_at: new Date().toISOString() })
      .eq("id", targetId).eq("owner_id", session.user.id).eq("asset_id", assetId).eq("revision", target.data.revision).select("id").maybeSingle();
    if (unlinked.error || !unlinked.data) return writerJson({ error: "El elemento cambió antes de quitar la imagen.", code: "conflict" }, 409);
    unlinkPerformed = true;
  }
  const [elements, shots] = await Promise.all([
    admin.from("writer_breakdown_elements").select("id", { count: "exact", head: true }).eq("owner_id", session.user.id).eq("asset_id", assetId),
    admin.from("writer_shotlist_shots").select("id", { count: "exact", head: true }).eq("owner_id", session.user.id).eq("asset_id", assetId),
  ]);
  if ((elements.count ?? 0) + (shots.count ?? 0) > 0) {
    return unlinkPerformed ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
      : writerJson({ error: "Quita primero la imagen del elemento o plano.", code: "in_use" }, 409);
  }
  const removed = await admin.storage.from(BUCKET).remove([String(asset.data.storage_path)]);
  if (removed.error) return writerJson({ error: "No pudimos eliminar la imagen.", code: "storage" }, 500);
  await admin.from("writer_production_assets").delete().eq("id", assetId).eq("owner_id", session.user.id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
