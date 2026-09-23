import "server-only";
import type { Asset, InputInfo } from "@mux/mux-node/resources/video/assets";
import {
  createValidatedMuxContext,
  isMuxNotFoundError,
} from "@/lib/mux/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadDecision, terminalUploadReason } from "./upload-lifecycle";
import { MAX_VIDEO_DURATION_SECONDS } from "./media-limits";

export function portfolioId(passthrough?: string) {
  return (
    passthrough?.match(
      /^filmatta:portfolio:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    )?.[1] ?? null
  );
}
export function mediaRejection(
  asset: Pick<Asset, "playback_ids">,
  inputs: InputInfo[],
) {
  if (asset.playback_ids?.some((p) => p.policy !== "signed"))
    return "unexpected-public-playback";
  const tracks = inputs.flatMap((i) => i.file?.tracks ?? []);
  if (!tracks.some((t) => t.type === "video")) return "missing-video-track";
  if (
    tracks.some(
      (t) =>
        t.type === "video" &&
        /prores|uncompressed|rawvideo/i.test(t.encoding ?? ""),
    )
  )
    return "unsupported-master-codec";
  return null;
}
// Only infrastructure verification writes privileged status; never ordinary user CRUD.
export async function syncPortfolioAsset(assetId: string) {
  const { mux, environment } = await createValidatedMuxContext();
  const asset = await mux.video.assets.retrieve(assetId);
  const id = portfolioId(asset.passthrough);
  if (!id || !asset.upload_id) return;
  const db = createAdminClient();
  const { data: row, error } = await db
    .from("profile_media")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  // An absent reference is handled conservatively by the daily orphan sweep.
  if (!row || row.source !== "mux") return;
  if (row.terminal_reason || row.status === "deleted" || row.status === "rejected") return;
  // A very early webhook may race binding. Return retryable failure, never acknowledge loss.
  if (!row.mux_upload_id) throw new Error("Upload binding pending");
  if (
    row.mux_upload_id !== asset.upload_id ||
    row.mux_environment_id !== environment.id ||
    row.mux_environment_type !== environment.type
  )
    return;
  const upload = await mux.video.uploads.retrieve(asset.upload_id);
  if (
    upload.asset_id !== asset.id ||
    portfolioId(upload.new_asset_settings?.passthrough) !== id
  )
    return;
  if (row.mux_asset_id && row.mux_asset_id !== asset.id) return;
  let status =
    asset.status === "ready"
      ? "ready"
      : asset.status === "errored"
        ? "errored"
        : "processing";
  if (
    status === "ready" &&
    mediaRejection(asset, await mux.video.assets.retrieveInputInfo(asset.id))
  )
    status = "rejected";
  const playbackId =
    asset.playback_ids?.find((p) => p.policy === "signed")?.id ?? null;
  if (status === "ready" && !playbackId) status = "rejected";
  const invalidFreeDuration =
    status === "ready" &&
    row.review_reason === "free-video-limits" &&
    (typeof asset.duration !== "number" ||
      !Number.isFinite(asset.duration) ||
      asset.duration <= 0 ||
      asset.duration > MAX_VIDEO_DURATION_SECONDS);
  if (invalidFreeDuration) status = "rejected";
  const updated = await db
    .from("profile_media")
    .update({
      status,
      mux_asset_id: asset.id,
      mux_playback_id: status === "ready" ? playbackId : null,
      duration_seconds: asset.duration && Number.isFinite(asset.duration) ? asset.duration : null,
      aspect_ratio: asset.aspect_ratio ?? null,
      review_reason:
        status === "rejected"
          ? invalidFreeDuration
            ? "FREE_VIDEO_DURATION_LIMIT"
            : "provider-validation-rejected"
          : status === "ready"
            ? null
            : row.review_reason,
      cleanup_after: null,
    })
    .eq("id", id)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (updated.error || !updated.data?.length)
    throw new Error("Concurrent media update; retry");
}

// Only incomplete, expired attempts are reconciled. Archive never authorizes deletion.
export async function cleanPortfolioMedia() {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db.from("profile_media").select("*")
    .in("status", ["uploading", "processing"]).lt("expires_at", now)
    .order("expires_at").limit(50);
  if (error) throw error;
  let reconciled = 0;
  for (const row of data ?? []) {
    if (row.source === "mux" && row.mux_upload_id) {
      await syncPortfolioUpload(row.mux_upload_id);
      reconciled++;
    } else if (row.source === "storage" && row.storage_path) {
      // An uploaded object whose finalization response was lost is not abandoned.
      const file = await db.storage.from("profile-media").info(row.storage_path);
      if (file.data) {
        const r = await db.from("profile_media").update({ status: "errored", review_reason: "image-finalization-required", cleanup_after: null })
          .eq("id", row.id).eq("updated_at", row.updated_at);
        if (r.error) throw r.error;
      } else if (String(file.error?.status) === "404" || String(file.error?.statusCode) === "404") {
        const r = await db.from("profile_media").update({ status: "errored", terminal_reason: "expired", cleanup_after: null })
          .eq("id", row.id).eq("updated_at", row.updated_at).eq("status", "uploading");
        if (r.error) throw r.error;
        reconciled++;
      } else throw new Error("Could not verify image existence");
    } else if (!row.mux_upload_id && row.source === "mux") {
      // Remote creation may have succeeded before binding failed. Review, never delete.
      const r = await db.from("profile_media").update({ status: "errored", terminal_reason: "expired", review_reason: "upload-binding-required", cleanup_after: null })
        .eq("id", row.id).eq("updated_at", row.updated_at);
      if (r.error) throw r.error;
    }
  }
  return reconciled;
}

export async function syncPortfolioUpload(uploadId: string) {
  const { mux, environment } = await createValidatedMuxContext();
  const upload = await mux.video.uploads.retrieve(uploadId);
  const id = portfolioId(upload.new_asset_settings?.passthrough);
  if (!id) return;
  const decision = uploadDecision(upload);
  if (decision === "reconcile-asset") return syncPortfolioAsset(upload.asset_id!);
  if (decision !== "terminal") return;
  const updated = await createAdminClient().from("profile_media")
    .update({ status: "errored", terminal_reason: terminalUploadReason(upload.status), cleanup_after: null })
    .eq("id", id).eq("mux_upload_id", upload.id)
    .eq("mux_environment_id", environment.id).eq("mux_environment_type", environment.type)
    .in("status", ["uploading", "processing"]);
  if (updated.error) throw updated.error;
}

// Caller must supply an owner-authorized row; provider identity is independently checked.
export async function cancelPortfolioUpload(row: { id: string; mux_upload_id: string; mux_environment_id: string; mux_environment_type: string }) {
  const { mux, environment } = await createValidatedMuxContext();
  if (row.mux_environment_id !== environment.id || row.mux_environment_type !== environment.type)
    throw new Error("Wrong environment");
  let upload = await mux.video.uploads.retrieve(row.mux_upload_id);
  if (portfolioId(upload.new_asset_settings?.passthrough) !== row.id) throw new Error("Wrong association");
  if (!upload.asset_id && upload.status === "waiting") {
    try { await mux.video.uploads.cancel(upload.id); }
    catch (error) {
      // asset_created can win the cancellation race. Re-read instead of deleting.
      if (isMuxNotFoundError(error)) throw error;
    }
    upload = await mux.video.uploads.retrieve(upload.id);
  }
  await syncPortfolioUpload(upload.id);
  return upload.asset_id ? "received" : uploadDecision(upload) === "terminal" ? "cancelled" : "pending";
}

export async function markPortfolioAssetDeleted(assetId: string, environment: { id: string; type: string }) {
  // The signed event's environment is checked by the shared webhook first.
  const result = await createAdminClient().from("profile_media")
    .update({ status: "deleted", visibility: "archived", featured: false, mux_playback_id: null, cleanup_after: null })
    .eq("source", "mux").eq("mux_asset_id", assetId)
    .eq("mux_environment_id", environment.id).eq("mux_environment_type", environment.type);
  if (result.error) throw result.error;
}

export async function cleanPortfolioOrphans() {
  const { mux } = await createValidatedMuxContext();
  const db = createAdminClient();
  let flagged = 0;
  // Read-only inventory. Neither ready nor shared assets are deleted by this sweep.
  for await (const asset of mux.video.assets.list({ limit: 100 })) {
    const id = portfolioId(asset.passthrough);
    if (
      !id || !asset.upload_id ||
      !/^[A-Za-z0-9]+$/.test(asset.id) ||
      !/^[A-Za-z0-9]+$/.test(asset.upload_id) ||
      asset.meta?.external_id !== id ||
      !/^[0-9a-f-]{36}$/i.test(asset.meta?.creator_id ?? "")
    ) continue;
    const created = Number(asset.created_at) * 1000;
    if (!Number.isFinite(created) || created > Date.now() - 2 * 60 * 60 * 1000) continue;
    const refs = await db.from("profile_media").select("id")
      .or(`id.eq.${id},mux_asset_id.eq.${asset.id},mux_upload_id.eq.${asset.upload_id}`);
    if (refs.error) throw refs.error;
    if (refs.data?.length) continue;
    const upload = await mux.video.uploads.retrieve(asset.upload_id);
    if (
      upload.asset_id !== asset.id ||
      portfolioId(upload.new_asset_settings?.passthrough) !== id ||
      upload.new_asset_settings?.meta?.external_id !== id ||
      upload.new_asset_settings?.meta?.creator_id !== asset.meta.creator_id
    ) continue;
    // Retain provider asset; a separate reviewed dry-run is required before any cleanup.
    flagged++;
  }
  return flagged;
}
