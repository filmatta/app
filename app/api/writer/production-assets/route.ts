import { randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { validUuid, writerApiSession, writerJson } from "@/lib/writer/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5_000_000;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET = "writer-production-assets";

export async function POST(request: Request) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > MAX_FILE_BYTES + 100_000) return writerJson({ error: "La imagen supera 5 MB.", code: "too_large" }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return writerJson({ error: "Archivo no válido.", code: "invalid" }, 400); }
  const file = form.get("file");
  const targetType = form.get("targetType");
  const targetId = form.get("targetId");
  if (!(file instanceof File) || !ACCEPTED.has(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES
    || (targetType !== "breakdown" && targetType !== "shot") || !validUuid(targetId)) {
    return writerJson({ error: "Usa una imagen JPG, PNG o WebP de hasta 5 MB.", code: "invalid" }, 400);
  }
  const table = targetType === "breakdown" ? "writer_breakdown_elements" : "writer_shotlist_shots";
  const target = await session.supabase.from(table).select("id,asset_id").eq("id", targetId).eq("owner_id", session.user.id).maybeSingle();
  if (target.error || !target.data) return writerJson({ error: "Destino no encontrado.", code: "not_found" }, 404);
  let output: Buffer;
  let metadata: Metadata;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 });
    metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("invalid");
    output = await decoder.rotate().resize({ width: 1_920, height: 1_920, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  } catch { return writerJson({ error: "La imagen está dañada o su formato real no coincide.", code: "invalid_image" }, 400); }
  const finalMetadata = await sharp(output).metadata();
  const storagePath = `${session.user.id}/${randomUUID()}.webp`;
  const admin = createAdminClient();
  const stored = await admin.storage.from(BUCKET).upload(storagePath, output, { contentType: "image/webp", upsert: false });
  if (stored.error) return writerJson({ error: "No pudimos guardar la imagen.", code: "storage" }, 500);
  const asset = await admin.from("writer_production_assets").insert({
    owner_id: session.user.id, storage_path: storagePath, mime_type: "image/webp", size_bytes: output.byteLength,
    width: finalMetadata.width, height: finalMetadata.height,
  }).select("id").single();
  if (asset.error || !asset.data) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return writerJson({ error: "No pudimos registrar la imagen.", code: "storage" }, 500);
  }
  const linked = await admin.from(table).update({ asset_id: asset.data.id, updated_at: new Date().toISOString() })
    .eq("id", targetId).eq("owner_id", session.user.id).select("id").maybeSingle();
  if (linked.error || !linked.data) {
    await admin.from("writer_production_assets").delete().eq("id", asset.data.id).eq("owner_id", session.user.id);
    await admin.storage.from(BUCKET).remove([storagePath]);
    return writerJson({ error: "El destino cambió antes de vincular la imagen.", code: "conflict" }, 409);
  }
  if (target.data.asset_id) await removeIfUnused(admin, session.user.id, String(target.data.asset_id));
  return writerJson({ assetId: asset.data.id, imageUrl: `/api/writer/production-assets/${asset.data.id}` }, 201);
}

async function removeIfUnused(admin: ReturnType<typeof createAdminClient>, ownerId: string, assetId: string) {
  const [elements, shots] = await Promise.all([
    admin.from("writer_breakdown_elements").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("asset_id", assetId),
    admin.from("writer_shotlist_shots").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("asset_id", assetId),
  ]);
  if ((elements.count ?? 0) + (shots.count ?? 0) > 0) return;
  const asset = await admin.from("writer_production_assets").select("storage_path").eq("id", assetId).eq("owner_id", ownerId).maybeSingle();
  if (!asset.data) return;
  await admin.storage.from(BUCKET).remove([String(asset.data.storage_path)]);
  await admin.from("writer_production_assets").delete().eq("id", assetId).eq("owner_id", ownerId);
}
