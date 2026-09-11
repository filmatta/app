import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asset } from "@mux/mux-node/resources/video/assets";
import type { Upload } from "@mux/mux-node/resources/video/uploads";
import { getLessonIdFromPassthrough, getVideoAttemptId } from "./server";

type MuxAssetReader = {
  video: {
    assets: {
      retrieve(assetId: string): Promise<Asset>;
    };
  };
};

export async function syncMuxUpload(
  supabase: SupabaseClient,
  mux: MuxAssetReader,
  upload: Upload,
  knownAsset?: Asset,
) {
  const passthrough = upload.new_asset_settings?.passthrough;
  const lessonId = getLessonIdFromPassthrough(passthrough);
  const attemptId = getVideoAttemptId(passthrough);
  const externalId = upload.new_asset_settings?.meta?.external_id;

  if (!lessonId || !attemptId || (externalId && externalId !== lessonId)) {
    console.info("Mux upload skipped", {
      uploadId: upload.id,
      assetId: upload.asset_id,
      reason: "invalid-association",
    });
    return { outcome: "skipped" as const, reason: "invalid-association" };
  }

  const { data: video, error } = await supabase
    .from("lesson_videos")
    .select("id, playback_policy")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) throw error;

  console.info("Mux upload association evaluated", {
    uploadId: upload.id,
    assetId: upload.asset_id,
    lessonId,
    attemptId,
    currentAttemptId: video?.id ?? null,
    policy: video?.playback_policy ?? null,
    uploadStatus: upload.status,
  });

  if (!video || video.id !== attemptId) {
    console.info("Mux upload skipped", {
      uploadId: upload.id,
      assetId: upload.asset_id,
      lessonId,
      attemptId,
      currentAttemptId: video?.id ?? null,
      reason: "stale-attempt",
    });
    return { outcome: "skipped" as const, reason: "stale-attempt" };
  }

  if (["errored", "timed_out", "cancelled"].includes(upload.status)) {
    console.info("Mux upload failed", {
      uploadId: upload.id,
      lessonId,
      attemptId,
      reason: upload.status,
    });
    return {
      outcome: "failed" as const,
      reason: upload.status,
      uploadId: upload.id,
      lessonId,
      attemptId,
    };
  }

  if (!upload.asset_id) {
    return {
      outcome: "pending" as const,
      uploadId: upload.id,
      lessonId,
      attemptId,
    };
  }

  const asset = knownAsset ?? await mux.video.assets.retrieve(upload.asset_id);

  if (
    asset.id !== upload.asset_id ||
    (asset.upload_id && asset.upload_id !== upload.id) ||
    asset.passthrough !== passthrough
  ) {
    console.info("Mux upload skipped", {
      uploadId: upload.id,
      assetId: asset.id,
      lessonId,
      attemptId,
      reason: "asset-upload-mismatch",
    });
    return { outcome: "skipped" as const, reason: "asset-upload-mismatch" };
  }

  const result = await syncMuxAsset(supabase, asset);
  console.info("Mux replacement sync completed", {
    uploadId: upload.id,
    assetId: asset.id,
    lessonId,
    attemptId,
    policy: video.playback_policy,
    outcome: result.outcome,
    reason: "reason" in result ? result.reason : null,
    status: "status" in result ? result.status : asset.status,
  });

  return { ...result, uploadId: upload.id, lessonId, attemptId };
}

export async function syncMuxAsset(supabase: SupabaseClient, asset: Asset) {
  const lessonId = getLessonIdFromPassthrough(asset.passthrough);
  const attemptId = getVideoAttemptId(asset.passthrough);
  if (!lessonId || (asset.meta?.external_id && asset.meta.external_id !== lessonId)) {
    console.info("Mux asset skipped", { reason: "invalid-association" });
    return { outcome: "skipped" as const, reason: "invalid-association" };
  }
  const { data: video, error } = await supabase.from("lesson_videos")
    .select("id, lesson_id, mux_asset_id, playback_policy, status, updated_at, created_at")
    .eq("lesson_id", lessonId).maybeSingle();
  if (error) throw error;
  console.info("Mux asset association evaluated", {
    assetId: asset.id,
    uploadId: asset.upload_id ?? null,
    lessonId,
    attemptId,
    currentAttemptId: video?.id ?? null,
    policy: video?.playback_policy ?? null,
    assetStatus: asset.status,
  });
  if (!video || (attemptId && attemptId !== video.id)) {
    console.info("Mux asset skipped", { lessonId, reason: "missing-row-or-stale-attempt" });
    return { outcome: "skipped" as const, reason: "missing-row-or-stale-attempt" };
  }
  const replacingAsset = Boolean(
    video.mux_asset_id && video.mux_asset_id !== asset.id,
  );
  if (replacingAsset && !attemptId) {
    console.info("Mux asset skipped", { lessonId, reason: "unidentified-replacement" });
    return { outcome: "skipped" as const, reason: "unidentified-replacement" };
  }
  if (!attemptId && !video.mux_asset_id &&
      (video.status !== "preparing" || Number(asset.created_at) < Math.floor(Date.parse(video.created_at) / 1000))) {
    console.info("Mux asset skipped", { lessonId, reason: "stale-legacy-upload" });
    return { outcome: "skipped" as const, reason: "stale-legacy-upload" };
  }
  const playback = asset.playback_ids?.find((p) => p.policy === video.playback_policy);
  const status = asset.status === "ready" ? (playback ? "ready" : "errored") : asset.status;
  if (status !== "ready" && status !== "preparing" && status !== "errored") {
    return { outcome: "skipped" as const, reason: "non-terminal-asset-status" };
  }
  if (video.status === "ready" && status === "preparing") {
    return {
      outcome: "skipped" as const,
      reason: replacingAsset ? "replacement-processing" : "no-ready-regression",
    };
  }
  if (replacingAsset && status === "errored") {
    return { outcome: "skipped" as const, reason: "replacement-errored" };
  }
  const previousAssetId = replacingAsset ? video.mux_asset_id : null;
  let alreadySynchronized = false;
  const { data: updated, error: updateError } = await supabase.from("lesson_videos")
    .update({ mux_asset_id: asset.id, mux_playback_id: playback?.id ?? null, status })
    .eq("id", video.id).eq("updated_at", video.updated_at).select("id");
  if (updateError) throw updateError;
  if (!updated?.length) {
    const { data: current, error: currentError } = await supabase
      .from("lesson_videos")
      .select("id, mux_asset_id, mux_playback_id, playback_policy, status")
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (
      current &&
      current.id === video.id &&
      current.mux_asset_id === asset.id &&
      current.mux_playback_id === (playback?.id ?? null) &&
      current.playback_policy === video.playback_policy &&
      current.status === status
    ) {
      console.info("Mux asset already synchronized", {
        assetId: asset.id,
        uploadId: asset.upload_id ?? null,
        lessonId,
        attemptId,
        policy: video.playback_policy,
        status,
      });
      alreadySynchronized = true;
    } else {
      throw new Error("Mux sync conflict; retry event.");
    }
  }
  if (asset.status === "ready" && Number.isFinite(asset.duration) && asset.duration! > 0) {
    const { error: durationError } = await supabase.from("course_lessons")
      .update({ duration_minutes: Math.ceil(asset.duration! / 60) }).eq("id", lessonId);
    if (durationError) throw durationError;
  }
  console.info("Mux lesson_videos updated", {
    assetId: asset.id,
    uploadId: asset.upload_id ?? null,
    lessonId,
    attemptId,
    policy: video.playback_policy,
    status,
    previousAssetId,
    replacementPromoted: Boolean(previousAssetId && status === "ready"),
  });
  return {
    outcome: alreadySynchronized ? "unchanged" as const : "updated" as const,
    status,
    previousAssetId: alreadySynchronized ? null : previousAssetId,
  };
}
