import "server-only";
import type { Asset, InputInfo } from "@mux/mux-node/resources/video/assets";
import {
  createValidatedMuxContext,
  isMuxNotFoundError,
} from "@/lib/mux/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  if (row.status === "deleted" || row.status === "rejected") {
    await mux.video.assets.delete(asset.id).catch((e) => {
      if (!isMuxNotFoundError(e)) throw e;
    });
    return;
  }
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
  const updated = await db
    .from("profile_media")
    .update({
      status,
      mux_asset_id: asset.id,
      mux_playback_id: status === "ready" ? playbackId : null,
      cleanup_after:
        status === "errored" || status === "rejected"
          ? new Date().toISOString()
          : row.cleanup_after,
    })
    .eq("id", id)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (updated.error || !updated.data?.length)
    throw new Error("Concurrent media update; retry");
  if (status === "rejected") await mux.video.assets.delete(asset.id);
}

export async function cleanPortfolioMedia() {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const expired = await db
    .from("profile_media")
    .update({ status: "errored", cleanup_after: now })
    .in("status", ["uploading", "processing"])
    .lt("expires_at", now);
  if (expired.error) throw expired.error;
  const { data, error } = await db
    .from("profile_media")
    .select("*")
    .lte("cleanup_after", now)
    // A terminal row retains cleanup_after until external deletion succeeds.
    // Include it after a crash; never lose a claimed cleanup job.
    .order("cleanup_after")
    .limit(50);
  if (error) throw error;
  let count = 0;
  for (const row of data ?? []) {
    // Lock the row into a terminal state before external deletion. Restore is rejected below.
    const claimed = await db
      .from("profile_media")
      .update({ status: "deleted", visibility: "archived", featured: false })
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (claimed.error) throw claimed.error;
    if (!claimed.data?.length) continue;
    try {
      if (row.source === "mux" && row.mux_upload_id) {
        const { mux, environment } = await createValidatedMuxContext();
        if (
          row.mux_environment_id !== environment.id ||
          row.mux_environment_type !== environment.type
        )
          throw new Error("Wrong environment");
        const upload = await mux.video.uploads.retrieve(row.mux_upload_id);
        if (portfolioId(upload.new_asset_settings?.passthrough) !== row.id)
          throw new Error("Wrong portfolio association");
        if (upload.asset_id) {
          const asset = await mux.video.assets.retrieve(upload.asset_id);
          if (
            portfolioId(asset.passthrough) !== row.id ||
            asset.upload_id !== upload.id
          )
            throw new Error("Wrong asset association");
          await mux.video.assets.delete(asset.id);
        } else if (upload.status === "waiting")
          await mux.video.uploads.cancel(upload.id);
      } else if (row.source === "storage" && row.storage_path) {
        if (!row.storage_path.startsWith(`${row.owner_id}/${row.id}/`))
          throw new Error("Wrong storage association");
        const removed = await db.storage
          .from("profile-media")
          .remove([row.storage_path]);
        if (removed.error) throw removed.error;
      }
    } catch (error) {
      if (!isMuxNotFoundError(error)) {
        // Keep the tombstone and due date: safe retries cannot restore playback.
        throw error;
      }
    }
    const finished = await db.from("profile_media")
      .update({ cleanup_after: null, mux_playback_id: null })
      .eq("id", row.id).eq("status", "deleted");
    if (finished.error) throw finished.error;
    count++;
  }
  return count;
}

export async function syncPortfolioUpload(uploadId: string) {
  const { mux, environment } = await createValidatedMuxContext();
  const upload = await mux.video.uploads.retrieve(uploadId);
  const id = portfolioId(upload.new_asset_settings?.passthrough);
  if (!id) return;
  if (upload.asset_id) return syncPortfolioAsset(upload.asset_id);
  if (!["cancelled", "timed_out", "errored"].includes(upload.status)) return;
  const updated = await createAdminClient().from("profile_media")
    .update({ status: "errored", cleanup_after: new Date().toISOString() })
    .eq("id", id).eq("mux_upload_id", upload.id)
    .eq("mux_environment_id", environment.id).eq("mux_environment_type", environment.type)
    .in("status", ["uploading", "processing"]);
  if (updated.error) throw updated.error;
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
  let cleaned = 0;
  // SDK pagination traverses the inventory; Learn assets are never queried or changed.
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
    // Both independent Mux records agree and no current portfolio reference exists.
    await mux.video.assets.delete(asset.id).catch(error => {
      if (!isMuxNotFoundError(error)) throw error;
    });
    cleaned++;
  }
  return cleaned;
}
