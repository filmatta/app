import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { StoryboardError } from "./server";

export const STORYBOARD_ASSET_BUCKET = "writer-production-assets";
export const STORYBOARD_ASSET_MAX_BYTES = 5_000_000;
export const STORYBOARD_ASSET_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function storeStoryboardReference(userId: string, file: File) {
  if (!STORYBOARD_ASSET_TYPES.has(file.type) || file.size < 1 || file.size > STORYBOARD_ASSET_MAX_BYTES) {
    throw new StoryboardError("invalid", "Usa una imagen JPG, PNG o WebP de hasta 5 MB.", 400);
  }
  const original = Buffer.from(await file.arrayBuffer());
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  let display: Buffer;
  try {
    const decoder = sharp(original, { failOn: "warning", limitInputPixels: 40_000_000 });
    metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("invalid");
    display = await decoder.rotate().resize({ width: 2_560, height: 2_560, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 }).toBuffer();
  } catch {
    throw new StoryboardError("invalid", "La imagen está dañada o su formato real no coincide.", 400);
  }
  const displayMetadata = await sharp(display).metadata();
  const id = randomUUID();
  const extension = metadata.format === "jpeg" ? "jpg" : metadata.format;
  const originalPath = `${userId}/storyboard/originals/${id}.${extension}`;
  const displayPath = `${userId}/storyboard/display/${id}.webp`;
  const admin = createAdminClient();
  const originalUpload = await admin.storage.from(STORYBOARD_ASSET_BUCKET).upload(originalPath, original, {
    contentType: file.type,
    upsert: false,
  });
  if (originalUpload.error) throw new StoryboardError("storage", "No pudimos guardar el original privado.", 500);
  const displayUpload = await admin.storage.from(STORYBOARD_ASSET_BUCKET).upload(displayPath, display, {
    contentType: "image/webp",
    upsert: false,
  });
  if (displayUpload.error) {
    await admin.storage.from(STORYBOARD_ASSET_BUCKET).remove([originalPath]);
    throw new StoryboardError("storage", "No pudimos preparar la referencia.", 500);
  }
  const asset = await admin.from("writer_production_assets").insert({
    owner_id: userId,
    storage_path: displayPath,
    mime_type: "image/webp",
    size_bytes: display.byteLength,
    width: displayMetadata.width,
    height: displayMetadata.height,
    original_storage_path: originalPath,
    original_mime_type: file.type,
    original_size_bytes: original.byteLength,
    original_width: metadata.width,
    original_height: metadata.height,
    asset_purpose: "source",
  }).select("id,width,height").single();
  if (asset.error || !asset.data) {
    await admin.storage.from(STORYBOARD_ASSET_BUCKET).remove([originalPath, displayPath]);
    throw new StoryboardError("storage", "No pudimos registrar la referencia.", 500);
  }
  await admin.from("storyboard_asset_cleanup_jobs").upsert({
    owner_id: userId,
    asset_id: asset.data.id,
    status: "pending",
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_id,asset_id" });
  return { assetId: String(asset.data.id), width: Number(asset.data.width), height: Number(asset.data.height) };
}

export async function storeStoryboardThumbnail(input: {
  userId: string;
  panelId: string;
  revisionId: string;
  operationId: string;
  file: File;
}) {
  if (!STORYBOARD_ASSET_TYPES.has(input.file.type) || input.file.size < 1 || input.file.size > STORYBOARD_ASSET_MAX_BYTES) {
    throw new StoryboardError("invalid", "La miniatura no es válida.", 400);
  }
  let output: Buffer;
  try {
    const bytes = Buffer.from(await input.file.arrayBuffer());
    output = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 })
      .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer();
  } catch {
    throw new StoryboardError("invalid", "La miniatura no se pudo validar.", 400);
  }
  const metadata = await sharp(output).metadata();
  const admin = createAdminClient();
  const existingOperation = await admin.from("storyboard_panel_renders").select("asset_id")
    .eq("owner_id", input.userId).eq("operation_id", input.operationId).maybeSingle();
  if (existingOperation.data?.asset_id) return { assetId: String(existingOperation.data.asset_id), noOp: true };

  const path = `${input.userId}/storyboard/previews/${input.revisionId}/${randomUUID()}.webp`;
  const uploaded = await admin.storage.from(STORYBOARD_ASSET_BUCKET).upload(path, output, { contentType: "image/webp", upsert: false });
  if (uploaded.error) throw new StoryboardError("storage", "No pudimos guardar la miniatura.", 500);
  const asset = await admin.from("writer_production_assets").insert({
    owner_id: input.userId,
    storage_path: path,
    mime_type: "image/webp",
    size_bytes: output.byteLength,
    width: metadata.width,
    height: metadata.height,
    asset_purpose: "storyboard_preview",
  }).select("id").single();
  if (asset.error || !asset.data) {
    await admin.storage.from(STORYBOARD_ASSET_BUCKET).remove([path]);
    throw new StoryboardError("storage", "No pudimos registrar la miniatura.", 500);
  }

  const previous = await admin.from("storyboard_panel_renders").select("id,asset_id")
    .eq("owner_id", input.userId).eq("panel_id", input.panelId).eq("revision_id", input.revisionId).eq("kind", "thumbnail").maybeSingle();
  const values = {
    owner_id: input.userId,
    panel_id: input.panelId,
    revision_id: input.revisionId,
    kind: "thumbnail",
    status: "ready",
    asset_id: asset.data.id,
    error_code: null,
    operation_id: input.operationId,
    updated_at: new Date().toISOString(),
  };
  const saved = previous.data
    ? await admin.from("storyboard_panel_renders").update(values).eq("id", previous.data.id).eq("owner_id", input.userId)
    : await admin.from("storyboard_panel_renders").insert(values);
  if (saved.error) {
    await admin.from("writer_production_assets").delete().eq("id", asset.data.id).eq("owner_id", input.userId);
    await admin.storage.from(STORYBOARD_ASSET_BUCKET).remove([path]);
    throw new StoryboardError("storage", "El dibujo se guardó, pero la miniatura falló.", 500);
  }
  if (previous.data?.asset_id) {
    await admin.from("storyboard_asset_cleanup_jobs").upsert({ owner_id: input.userId, asset_id: previous.data.asset_id, status: "pending", updated_at: new Date().toISOString() }, { onConflict: "owner_id,asset_id" });
  }
  const retiredAssetIds = await retireObsoleteRenders(input.userId, input.panelId, input.revisionId);
  await runStoryboardAssetCleanup(input.userId, [
    ...(previous.data?.asset_id ? [String(previous.data.asset_id)] : []),
    ...retiredAssetIds,
  ]);
  return { assetId: String(asset.data.id), noOp: false };
}

async function retireObsoleteRenders(userId: string, panelId: string, currentRevisionId: string) {
  const admin = createAdminClient();
  const renders = await admin.from("storyboard_panel_renders").select("id,revision_id,asset_id")
    .eq("owner_id", userId).eq("panel_id", panelId).neq("revision_id", currentRevisionId);
  if (renders.error || !renders.data?.length) return [];
  const revisionIds = [...new Set(renders.data.map((row) => String(row.revision_id)))];
  const approvals = await admin.from("storyboard_panel_approvals").select("revision_id")
    .eq("owner_id", userId).in("revision_id", revisionIds);
  if (approvals.error) return [];
  const protectedRevisions = new Set((approvals.data ?? []).map((row) => String(row.revision_id)));
  const obsolete = renders.data.filter((row) => !protectedRevisions.has(String(row.revision_id)));
  if (!obsolete.length) return [];
  const removed = await admin.from("storyboard_panel_renders").delete().eq("owner_id", userId)
    .in("id", obsolete.map((row) => String(row.id)));
  if (removed.error) return [];
  const assetIds = obsolete.flatMap((row) => row.asset_id ? [String(row.asset_id)] : []);
  if (assetIds.length) {
    await admin.from("storyboard_asset_cleanup_jobs").upsert(assetIds.map((assetId) => ({
      owner_id: userId,
      asset_id: assetId,
      status: "pending",
      updated_at: new Date().toISOString(),
    })), { onConflict: "owner_id,asset_id" });
  }
  return assetIds;
}

export async function runStoryboardAssetCleanup(userId: string, assetIds: string[]) {
  const ids = [...new Set(assetIds)].slice(0, 500);
  if (!ids.length) return { completed: 0, failed: 0, retained: 0 };
  const admin = createAdminClient();
  let completed = 0;
  let failed = 0;
  let retained = 0;
  for (const assetId of ids) {
    const pending = await admin.from("storyboard_asset_cleanup_jobs").select("id,attempts,status")
      .eq("owner_id", userId).eq("asset_id", assetId).in("status", ["pending", "failed"]).maybeSingle();
    if (pending.error || !pending.data || Number(pending.data.attempts) >= 20) continue;
    const job = await admin.from("storyboard_asset_cleanup_jobs").update({
      status: "processing",
      attempts: Number(pending.data.attempts) + 1,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    }).eq("id", pending.data.id).eq("status", pending.data.status)
      .select("id,attempts").maybeSingle();
    if (job.error || !job.data) continue;
    try {
      const [elements, shots, revisions, renders] = await Promise.all([
        admin.from("writer_breakdown_elements").select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("asset_id", assetId),
        admin.from("writer_shotlist_shots").select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("asset_id", assetId),
        admin.from("storyboard_panel_revisions").select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("base_asset_id", assetId),
        admin.from("storyboard_panel_renders").select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("asset_id", assetId),
      ]);
      if ([elements, shots, revisions, renders].some((result) => result.error)) throw new Error("reference_check");
      const uses = (elements.count ?? 0) + (shots.count ?? 0) + (revisions.count ?? 0) + (renders.count ?? 0);
      if (uses > 0) {
        retained += 1;
      } else {
        const asset = await admin.from("writer_production_assets").select("storage_path,original_storage_path")
          .eq("id", assetId).eq("owner_id", userId).maybeSingle();
        if (asset.error) throw new Error("asset_lookup");
        if (asset.data) {
          const paths = [String(asset.data.storage_path), ...(asset.data.original_storage_path ? [String(asset.data.original_storage_path)] : [])];
          const storage = await admin.storage.from(STORYBOARD_ASSET_BUCKET).remove(paths);
          if (storage.error) throw new Error("storage_remove");
          const deleted = await admin.from("writer_production_assets").delete().eq("id", assetId).eq("owner_id", userId);
          if (deleted.error) throw new Error("asset_delete");
        }
      }
      await admin.from("storyboard_asset_cleanup_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.data.id);
      completed += 1;
    } catch (cause) {
      await admin.from("storyboard_asset_cleanup_jobs").update({
        status: "failed",
        last_error_code: cause instanceof Error ? cause.message.slice(0, 80) : "cleanup_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", job.data.id);
      failed += 1;
    }
  }
  return { completed, failed, retained };
}
