import "server-only";

import type { Asset, InputInfo } from "@mux/mux-node/resources/video/assets";
import type { Upload } from "@mux/mux-node/resources/video/uploads";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createValidatedMuxContext,
  isMuxNotFoundError,
} from "@/lib/mux/server";
import { LOCATION_TOUR_MAX_DURATION_SECONDS } from "./tour-limits";

const PREFIX = "filmatta:location-tour:";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PASSTHROUGH = new RegExp(`^${PREFIX}(${UUID}):(${UUID}):([1-9]\\d*)$`, "i");

type TourRow = {
  id: string;
  location_id: string;
  owner_id: string;
  generation: number;
  status: string;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_environment_id: string | null;
  mux_environment_type: string | null;
};

export function locationTourPassthrough(locationId: string, attemptId: string, generation: number) {
  const value = `${PREFIX}${locationId}:${attemptId}:${generation}`;
  if (!PASSTHROUGH.test(value)) throw new Error("Invalid location tour association");
  return value;
}

export function parseLocationTourPassthrough(value?: string) {
  const match = value?.match(PASSTHROUGH);
  if (!match) return null;
  const generation = Number(match[3]);
  return Number.isSafeInteger(generation)
    ? { locationId: match[1], attemptId: match[2], generation }
    : null;
}

export async function syncLocationTourUpload(uploadId: string) {
  const { mux, environment } = await createValidatedMuxContext();
  const upload = await mux.video.uploads.retrieve(uploadId);
  const association = parseLocationTourPassthrough(upload.new_asset_settings?.passthrough);
  if (!association) return { outcome: "ignored" as const };
  if (upload.asset_id) return syncLocationTourAsset(upload.asset_id, upload);
  if (upload.status === "cancelled" || upload.status === "errored" || upload.status === "timed_out") {
    const db = createAdminClient();
    const result = await db.from("location_tour_attempts").update({
      status: upload.status === "cancelled" ? "cancelled" : "errored",
      terminal_reason: `mux-upload-${upload.status}`,
      cleanup_after: null,
    }).eq("id", association.attemptId).eq("generation", association.generation)
      .eq("mux_upload_id", upload.id).eq("mux_environment_id", environment.id)
      .eq("mux_environment_type", environment.type).in("status", ["uploading", "processing"]);
    if (result.error) throw result.error;
    return { outcome: "terminal" as const };
  }
  return { outcome: "pending" as const };
}

export async function syncLocationTourAsset(assetId: string, knownUpload?: Upload) {
  const { mux, environment } = await createValidatedMuxContext();
  const asset = await mux.video.assets.retrieve(assetId);
  const association = parseLocationTourPassthrough(asset.passthrough);
  if (!association || !asset.upload_id) return { outcome: "ignored" as const };
  const upload = knownUpload ?? await mux.video.uploads.retrieve(asset.upload_id);
  if (
    upload.id !== asset.upload_id || upload.asset_id !== asset.id ||
    parseLocationTourPassthrough(upload.new_asset_settings?.passthrough)?.attemptId !== association.attemptId
  ) return { outcome: "association-mismatch" as const };

  const db = createAdminClient();
  const { data, error } = await db.from("location_tour_attempts").select("*")
    .eq("id", association.attemptId).maybeSingle();
  if (error) throw error;
  const row = data as TourRow | null;
  if (!row || row.location_id !== association.locationId || row.generation !== association.generation) {
    return { outcome: "unknown-attempt" as const };
  }
  if (
    row.mux_upload_id !== asset.upload_id || row.mux_environment_id !== environment.id ||
    row.mux_environment_type !== environment.type
  ) return { outcome: "provenance-mismatch" as const };
  if (row.status === "ready" && row.mux_asset_id === asset.id) return { outcome: "ready" as const };
  if (!["uploading", "processing"].includes(row.status)) {
    await flagAndDeleteStaleAsset(row, asset.id);
    return { outcome: "stale" as const };
  }
  if (asset.status === "errored") {
    await failAttempt(row, "errored", "mux-asset-errored", asset.id);
    return { outcome: "errored" as const };
  }
  if (asset.status !== "ready") {
    const updated = await db.from("location_tour_attempts").update({ status: "processing", mux_asset_id: asset.id })
      .eq("id", row.id).eq("generation", row.generation).in("status", ["uploading", "processing"]);
    if (updated.error) throw updated.error;
    return { outcome: "processing" as const };
  }

  const inputs = await mux.video.assets.retrieveInputInfo(asset.id);
  const rejection = locationTourRejection(asset, inputs);
  const playbackId = asset.playback_ids?.find((item) => item.policy === "signed")?.id ?? null;
  if (rejection || !playbackId) {
    await failAttempt(row, "rejected", rejection ?? "missing-signed-playback", asset.id);
    await deleteLocationTourAsset({ ...row, mux_asset_id: asset.id });
    return { outcome: "rejected" as const, reason: rejection ?? "missing-signed-playback" };
  }

  const tracks = inputs.flatMap((input) => input.file?.tracks ?? []);
  const promoted = await db.rpc("promote_location_tour", {
    p_attempt_id: row.id,
    p_generation: row.generation,
    p_upload_id: asset.upload_id,
    p_asset_id: asset.id,
    p_playback_id: playbackId,
    p_environment_id: environment.id,
    p_environment_type: environment.type,
    p_duration_seconds: asset.duration,
    p_aspect_ratio: asset.aspect_ratio ?? null,
    p_has_audio: tracks.some((track) => track.type === "audio"),
  });
  if (promoted.error) throw promoted.error;
  if (!promoted.data) {
    await flagAndDeleteStaleAsset(row, asset.id);
    return { outcome: "stale" as const };
  }
  const previous = promoted.data as { previous_attempt_id?: string | null; previous_asset_id?: string | null };
  if (previous.previous_attempt_id && previous.previous_asset_id) {
    await deleteLocationTourAssetById(previous.previous_attempt_id, previous.previous_asset_id);
  }
  return { outcome: "ready" as const };
}

export async function cancelLocationTourUpload(row: TourRow) {
  const { mux, environment } = await createValidatedMuxContext();
  if (!row.mux_upload_id || row.mux_environment_id !== environment.id || row.mux_environment_type !== environment.type) {
    throw new Error("Location tour provenance mismatch");
  }
  let upload = await mux.video.uploads.retrieve(row.mux_upload_id);
  const association = parseLocationTourPassthrough(upload.new_asset_settings?.passthrough);
  if (!association || association.attemptId !== row.id || association.locationId !== row.location_id || association.generation !== row.generation) {
    throw new Error("Location tour association mismatch");
  }
  if (!upload.asset_id && upload.status === "waiting") {
    try { await mux.video.uploads.cancel(upload.id); } catch (error) {
      if (isMuxNotFoundError(error)) throw error;
    }
    upload = await mux.video.uploads.retrieve(upload.id);
  }
  if (upload.asset_id) {
    await deleteLocationTourAsset({ ...row, mux_asset_id: upload.asset_id });
  } else {
    const result = await createAdminClient().from("location_tour_attempts").update({
      status: "cancelled", terminal_reason: "cancelled-by-owner", cleanup_after: null,
    }).eq("id", row.id).eq("generation", row.generation).in("status", ["uploading", "processing"]);
    if (result.error) throw result.error;
  }
}

export async function retryLocationTourCleanup(locationId: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("location_tour_attempts").select("*")
    .eq("location_id", locationId).eq("status", "delete_pending").order("updated_at").limit(3);
  if (error) throw error;
  for (const row of (data ?? []) as TourRow[]) {
    if (row.mux_asset_id) await deleteLocationTourAsset(row).catch(() => undefined);
  }
}

export async function markLocationTourAssetDeleted(assetId: string, environment: { id: string; type: string }) {
  const db = createAdminClient();
  const { data, error } = await db.from("location_tour_attempts").select("id,location_id")
    .eq("mux_asset_id", assetId).eq("mux_environment_id", environment.id)
    .eq("mux_environment_type", environment.type).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const clear = await db.from("locations").update({ active_tour_attempt_id: null })
    .eq("id", data.location_id).eq("active_tour_attempt_id", data.id);
  if (clear.error) throw clear.error;
  const marked = await db.from("location_tour_attempts").update({
    status: "deleted", mux_playback_id: null, cleanup_after: null, terminal_reason: "provider-deleted",
  }).eq("id", data.id).eq("mux_asset_id", assetId);
  if (marked.error) throw marked.error;
}

function locationTourRejection(asset: Asset, inputs: InputInfo[]) {
  if (asset.playback_ids?.some((item) => item.policy !== "signed")) return "unexpected-public-playback";
  if (typeof asset.duration !== "number" || !Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > LOCATION_TOUR_MAX_DURATION_SECONDS) return "invalid-duration";
  const tracks = inputs.flatMap((input) => input.file?.tracks ?? []);
  if (!tracks.some((track) => track.type === "video")) return "missing-video-track";
  return null;
}

async function failAttempt(row: TourRow, status: "errored" | "rejected", reason: string, assetId: string) {
  const result = await createAdminClient().from("location_tour_attempts").update({
    status, mux_asset_id: assetId, mux_playback_id: null, terminal_reason: reason,
    cleanup_after: status === "rejected" ? new Date().toISOString() : null,
  }).eq("id", row.id).eq("generation", row.generation).in("status", ["uploading", "processing"]);
  if (result.error) throw result.error;
}

async function flagAndDeleteStaleAsset(row: TourRow, assetId: string) {
  const result = await createAdminClient().from("location_tour_attempts").update({
    status: "rejected", mux_asset_id: assetId, terminal_reason: "stale-generation", cleanup_after: new Date().toISOString(),
  }).eq("id", row.id).neq("status", "ready");
  if (result.error) throw result.error;
  await deleteLocationTourAsset({ ...row, mux_asset_id: assetId });
}

async function deleteLocationTourAssetById(attemptId: string, assetId: string) {
  const { data, error } = await createAdminClient().from("location_tour_attempts").select("*")
    .eq("id", attemptId).eq("mux_asset_id", assetId).maybeSingle();
  if (error) throw error;
  if (data) await deleteLocationTourAsset(data as TourRow);
}

async function deleteLocationTourAsset(row: TourRow) {
  if (!row.mux_asset_id) return;
  const db = createAdminClient();
  const active = await db.from("locations").select("id").eq("active_tour_attempt_id", row.id).maybeSingle();
  if (active.error) throw active.error;
  if (active.data) throw new Error("Refusing to delete the active location tour");
  const { mux, environment } = await createValidatedMuxContext();
  if (row.mux_environment_id !== environment.id || row.mux_environment_type !== environment.type) throw new Error("Wrong environment");
  try {
    const asset = await mux.video.assets.retrieve(row.mux_asset_id);
    const association = parseLocationTourPassthrough(asset.passthrough);
    if (!association || association.attemptId !== row.id || association.locationId !== row.location_id || association.generation !== row.generation) throw new Error("Wrong asset association");
    await mux.video.assets.delete(row.mux_asset_id);
  } catch (error) {
    if (!isMuxNotFoundError(error)) {
      await db.from("location_tour_attempts").update({ status: "delete_pending", cleanup_after: new Date(Date.now() + 15 * 60_000).toISOString() }).eq("id", row.id);
      throw error;
    }
  }
  const marked = await db.from("location_tour_attempts").update({ status: "deleted", mux_playback_id: null, cleanup_after: null }).eq("id", row.id);
  if (marked.error) throw marked.error;
}
