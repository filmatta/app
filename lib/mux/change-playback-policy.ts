import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createMuxClient, getVideoAttemptId } from "./server";

type PlaybackPolicy = "public" | "signed";

export async function changeLessonPlaybackPolicy(
  supabase: SupabaseClient,
  lessonId: string,
  isPreview: boolean,
) {
  const targetPolicy: PlaybackPolicy = isPreview ? "public" : "signed";
  const { data: video, error } = await supabase
    .from("lesson_videos")
    .select("id, mux_asset_id, mux_playback_id, playback_policy, status, created_at")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, message: "No se pudo consultar el video de la lección." };
  }

  if (!video) {
    return { ok: true as const };
  }

  if (video.playback_policy === targetPolicy) {
    return { ok: true as const };
  }

  if (video.status !== "ready" || !video.mux_asset_id || !video.mux_playback_id) {
    return {
      ok: false as const,
      message: "Espera a que el video termine de procesarse antes de cambiar su acceso.",
    };
  }

  const mux = createMuxClient();
  const asset = await mux.video.assets.retrieve(video.mux_asset_id);
  const assetAttemptId = getVideoAttemptId(asset.passthrough);
  const pendingReplacement = assetAttemptId
    ? assetAttemptId !== video.id
    : Date.now() - Date.parse(video.created_at) < 60 * 60 * 1000;
  if (pendingReplacement) {
    return {
      ok: false as const,
      message: "Espera a que termine el reemplazo de video antes de cambiar el acceso.",
    };
  }
  const currentPlayback = asset.playback_ids?.find(
    (item) => item.id === video.mux_playback_id,
  );

  if (!currentPlayback || currentPlayback.policy !== video.playback_policy) {
    return {
      ok: false as const,
      message: "La reproducción actual no coincide con el servicio de video. Comprueba el procesamiento antes de cambiar el acceso.",
    };
  }

  const existingTarget = asset.playback_ids?.find(
    (item) => item.policy === targetPolicy,
  );
  const targetPlayback =
    existingTarget ??
    (await mux.video.assets.createPlaybackId(video.mux_asset_id, {
      policy: targetPolicy,
    }));
  const createdTarget = !existingTarget;

  const transition = await supabase.rpc("set_lesson_video_access", {
    p_lesson_id: lessonId,
    p_is_preview: isPreview,
    p_playback_policy: targetPolicy,
    p_mux_playback_id: targetPlayback.id,
  });

  if (transition.error) {
    if (createdTarget) {
      await mux.video.assets
        .deletePlaybackId(video.mux_asset_id, targetPlayback.id)
        .catch(() => undefined);
    }

    console.error("Lesson playback policy transaction failed", {
      lessonId,
      code: transition.error.code,
    });
    return {
      ok: false as const,
      message:
        "La transición segura de acceso todavía no está habilitada en la base de datos.",
    };
  }

  try {
    await mux.video.assets.deletePlaybackId(
      video.mux_asset_id,
      video.mux_playback_id,
    );
  } catch (cleanupError) {
    if (targetPolicy === "signed") {
      const rollback = await supabase.rpc("set_lesson_video_access", {
        p_lesson_id: lessonId,
        p_is_preview: true,
        p_playback_policy: "public",
        p_mux_playback_id: video.mux_playback_id,
      });

      if (!rollback.error && createdTarget) {
        await mux.video.assets
          .deletePlaybackId(video.mux_asset_id, targetPlayback.id)
          .catch(() => undefined);
      }

      console.error("Public playback cleanup failed", { lessonId, cleanupError });
      return {
        ok: false as const,
        message: rollback.error
          ? "No se pudo retirar la reproducción pública. Revisa la lección inmediatamente."
          : "No se pudo retirar la reproducción pública; el cambio fue revertido.",
      };
    }

    // A leftover signed ID cannot expose a public lesson. Keep the successful
    // transition and leave this harmless cleanup for operational maintenance.
    console.warn("Old signed playback cleanup pending", { lessonId, cleanupError });
  }

  return { ok: true as const };
}
