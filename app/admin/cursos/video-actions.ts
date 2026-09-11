"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { syncMuxAsset, syncMuxUpload } from "@/lib/mux/sync-asset";
import { presentVideo } from "@/lib/mux/playback";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLearnContentType } from "@/lib/learn/content-type";
import {
  createMuxClient,
  getLessonVideoPassthrough,
  getVideoAttemptId,
} from "@/lib/mux/server";

type AdminSupabaseClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function readLessonVideoPresentation(
  supabase: AdminSupabaseClient,
  lessonId: string,
) {
  const { data, error } = await supabase
    .from("lesson_videos")
    .select("id, status, playback_policy, mux_playback_id, mux_asset_id, created_at")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo consultar el estado del video.");
  }

  const presentation = await presentVideo(data);

  if (data?.status === "ready" && data.mux_asset_id) {
    try {
      const asset = await createMuxClient().video.assets.retrieve(data.mux_asset_id);
      const assetAttemptId = getVideoAttemptId(asset.passthrough);
      const replacementPending = assetAttemptId
        ? assetAttemptId !== data.id
        : Date.now() - Date.parse(data.created_at) < 60 * 60 * 1000;
      const policyCoherent = Boolean(
        asset.playback_ids?.some(
          (playback) =>
            playback.id === data.mux_playback_id &&
            playback.policy === data.playback_policy,
        ),
      );
      if (replacementPending) {
        return {
          ...presentation,
          replacementPending: true,
          policyCoherent,
        };
      }
      return {
        ...presentation,
        replacementPending: false,
        policyCoherent,
      };
    } catch {
      // The current video presentation remains valid even if this optional
      // replacement check cannot reach Mux.
    }
  }

  return presentation;
}

async function finishReconciliation(
  supabase: AdminSupabaseClient,
  lessonId: string,
  message: string,
  details: { replacementPending?: boolean; replacementFailed?: boolean } = {},
) {
  revalidatePath("/admin/cursos/[id]", "page");
  revalidatePath("/cursos/[slug]/lecciones/[lessonSlug]", "page");

  return {
    ok: true as const,
    message,
    video: await readLessonVideoPresentation(supabase, lessonId),
    ...details,
  };
}

export async function createLessonVideoUpload(
  lessonId: string,
  replaceExisting = false,
) {
  const { supabase } = await requireAdmin();
  const attemptId = crypto.randomUUID();
  let passthrough: string;

  try {
    passthrough = getLessonVideoPassthrough(lessonId, attemptId);
  } catch {
    return { ok: false as const, message: "La lección no es válida." };
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("course_lessons")
    .select("id, title, is_preview, course_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    console.error("Error validando la lección para Mux:", lessonError);
    return { ok: false as const, message: "No encontramos esta lección." };
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("content_type")
    .eq("id", lesson.course_id)
    .maybeSingle();

  if (courseError || !course) {
    return { ok: false as const, message: "No se pudo verificar el contenido de la lección." };
  }
  const isQuickGuide = getLearnContentType(course) === "quick_guide";

  const { data: currentVideo, error: videoError } = await supabase
    .from("lesson_videos")
    .select("id, status, mux_asset_id, mux_playback_id, playback_policy, updated_at, created_at")
    .eq("lesson_id", lesson.id)
    .maybeSingle();

  if (videoError) {
    console.error("Error cargando el video de la lección:", videoError);
    return { ok: false as const, message: "No pudimos preparar la subida." };
  }

  if (isQuickGuide && currentVideo?.playback_policy !== undefined && currentVideo.playback_policy !== "signed") {
    return {
      ok: false as const,
      message: "Esta guía necesita completar primero su transición a reproducción protegida.",
    };
  }

  if (currentVideo?.status === "ready" && !replaceExisting) {
    return {
      ok: false as const,
      message: "Esta lección ya tiene un video listo.",
    };
  }

  if (currentVideo?.status === "preparing") {
    return {
      ok: false as const,
      message: "Ya hay un video procesándose para esta lección.",
    };
  }

  if (replaceExisting && currentVideo?.status !== "ready") {
    return {
      ok: false as const,
      message: "Sólo puedes reemplazar un video que ya está listo.",
    };
  }

  const playbackPolicy =
    currentVideo?.playback_policy ??
    (isQuickGuide
      ? "signed"
      : lesson.is_preview
        ? "public"
        : "signed");
  let mux: ReturnType<typeof createMuxClient>;
  let origin: string;
  try {
    origin = await getTrustedOrigin();
    mux = createMuxClient();
  } catch {
    return { ok: false as const, message: "Revisa la configuración del servicio de video y el origen de la aplicación antes de subir." };
  }

  if (
    replaceExisting &&
    currentVideo?.mux_asset_id &&
    currentVideo.mux_playback_id
  ) {
    try {
      const currentAsset = await mux.video.assets.retrieve(currentVideo.mux_asset_id);
      if (getVideoAttemptId(currentAsset.passthrough) !== currentVideo.id) {
        const pendingUpload = await findExactMuxUpload(
          mux,
          getLessonVideoPassthrough(lessonId, currentVideo.id),
        );
        const terminalFailure = pendingUpload &&
          ["errored", "timed_out", "cancelled"].includes(pendingUpload.status);
        const missingAndExpired =
          !pendingUpload &&
          Date.now() - Date.parse(currentVideo.created_at) > 60 * 60 * 1000;

        if (!terminalFailure && !missingAndExpired) {
          return {
            ok: false as const,
            message:
              "Ya existe un reemplazo pendiente. Comprueba su estado antes de iniciar otro.",
          };
        }
      }
    } catch {
      return {
        ok: false as const,
        message: "No se pudo validar el video actual antes de reemplazarlo.",
      };
    }
  }

  const reserved = currentVideo
    ? currentVideo.status === "ready"
      ? await supabase
          .from("lesson_videos")
          .update({
            id: attemptId,
            created_at: new Date().toISOString(),
          })
          .eq("id", currentVideo.id)
          .eq("updated_at", currentVideo.updated_at)
          .eq("status", "ready")
          .select("id")
          .maybeSingle()
      : await supabase
        .from("lesson_videos")
        .update({
          id: attemptId,
          created_at: new Date().toISOString(),
          provider: "mux",
          mux_asset_id: null,
          mux_playback_id: null,
          playback_policy: playbackPolicy,
          status: "preparing",
        })
        .eq("id", currentVideo.id)
        .eq("status", "errored")
        .select("id")
        .maybeSingle()
    : await supabase
        .from("lesson_videos")
        .insert({
          id: attemptId,
          lesson_id: lesson.id,
          provider: "mux",
          playback_policy: playbackPolicy,
          status: "preparing",
        })
        .select("id")
        .maybeSingle();

  if (reserved.error || !reserved.data) {
    console.error("Error reservando la subida de video:", reserved.error);
    return {
      ok: false as const,
      message: "Ya existe otra subida activa para esta lección.",
    };
  }

  try {
    const upload = await mux.video.uploads.create({
      cors_origin: origin,
      timeout: 3600,
      new_asset_settings: {
        playback_policies: [playbackPolicy],
        passthrough,
        meta: {
          external_id: lesson.id,
          title: lesson.title,
        },
      },
    });

    if (!upload.url) {
      throw new Error("Mux no devolvió una URL de subida.");
    }

    return {
      ok: true as const,
      uploadUrl: upload.url,
      uploadId: upload.id,
      replacement: replaceExisting,
    };
  } catch (error) {
    console.error("Error creando el Direct Upload de Mux", { lessonId, type: error instanceof Error ? error.name : "unknown" });

    return {
      ok: false as const,
      reserved: true,
      message: "No se pudo confirmar la subida. Comprueba el estado antes de iniciar otro intento.",
    };
  }
}

export async function markLessonVideoUploadFailed(lessonId: string) {
  const { supabase } = await requireAdmin();

  try {
    getLessonVideoPassthrough(lessonId);
  } catch {
    return;
  }

  // A network failure is ambiguous: Mux may have accepted the file. Keep the
  // reservation until reconciliation confirms a terminal state.
  const { error } = await supabase.from("lesson_videos").select("id").eq("lesson_id", lessonId);

  if (error) {
    console.error("Error registrando la subida fallida:", error);
  }
}

export async function getLessonVideoState(
  lessonId: string,
  uploadId?: string,
  discoverReplacement = false,
) {
  const { supabase } = await requireAdmin();
  getLessonVideoPassthrough(lessonId);
  let trackedUploadId = uploadId;
  let replacementFailed = false;

  try {
    const shouldInspectMux = Boolean(trackedUploadId || discoverReplacement);
    const mux = shouldInspectMux ? createMuxClient() : null;

    if (mux && !trackedUploadId && discoverReplacement) {
      const { data: video, error } = await supabase
        .from("lesson_videos")
        .select("id, mux_asset_id")
        .eq("lesson_id", lessonId)
        .maybeSingle();

      if (error) throw error;

      if (video?.mux_asset_id) {
        const currentAsset = await mux.video.assets.retrieve(video.mux_asset_id);
        if (getVideoAttemptId(currentAsset.passthrough) !== video.id) {
          const exactUpload = await findExactMuxUpload(
            mux,
            getLessonVideoPassthrough(lessonId, video.id),
          );
          trackedUploadId = exactUpload?.id;
          console.info("Mux replacement fallback lookup", {
            lessonId,
            attemptId: video.id,
            uploadId: trackedUploadId ?? null,
            reason: trackedUploadId ? "exact-match" : "not-found",
          });
        }
      }
    }

    if (mux && trackedUploadId) {
      const upload = await mux.video.uploads.retrieve(trackedUploadId);
      const result = await syncMuxUpload(supabase, mux, upload);
      replacementFailed = result.outcome === "failed";
    }
  } catch (error) {
    console.error("Mux replacement polling failed", {
      lessonId,
      uploadId: trackedUploadId ?? null,
      code:
        typeof error === "object" && error && "code" in error
          ? error.code
          : "sync-failed",
    });
    throw new Error("No se pudo consultar el reemplazo en Mux.");
  }

  const presentation = await readLessonVideoPresentation(supabase, lessonId);
  return {
    ...presentation,
    replacementPending: replacementFailed
      ? false
      : presentation.replacementPending,
    replacementFailed,
    trackedUploadId,
  };
}

export async function reconcileLessonVideo(lessonId: string) {
  const { supabase } = await requireAdmin();
  getLessonVideoPassthrough(lessonId);
  const { data: video, error } = await supabase.from("lesson_videos")
    .select("id, mux_asset_id, status, updated_at, created_at").eq("lesson_id", lessonId).maybeSingle();
  if (error || !video) return { ok: false as const, message: "No se pudo consultar el registro de video." };
  try {
    const mux = createMuxClient();
    let needsUploadLookup = !video.mux_asset_id;
    if (video.mux_asset_id) {
      const currentAsset = await mux.video.assets.retrieve(video.mux_asset_id);
      if (getVideoAttemptId(currentAsset.passthrough) === video.id) {
        await syncMuxAsset(supabase, currentAsset);
      } else {
        needsUploadLookup = true;
      }
    }

    if (needsUploadLookup) {
      // Explicit recovery only, not called by polling. Bound API traversal.
      const exactCandidates = [];
      const legacyCandidates = [];
      for (let page = 1; page <= 10; page++) {
        const uploads = await mux.video.uploads.list({ page, limit: 100 });
        for (const upload of uploads.data) {
          const p = upload.new_asset_settings?.passthrough;
          if (p === getLessonVideoPassthrough(lessonId, video.id)) exactCandidates.push(upload);
          else if (p === getLessonVideoPassthrough(lessonId)) legacyCandidates.push(upload);
        }
        if (uploads.data.length < 100) break;
      }
      const candidates = exactCandidates.length ? exactCandidates : legacyCandidates;
      if (candidates.length > 1) return { ok: false as const, message: "Hay varios uploads históricos. Requiere revisar la asociación antes de actualizar." };
      if (!candidates.length) {
        const expired = Date.now() - Date.parse(video.created_at) > 60 * 60 * 1000;
        if (expired) {
          if (video.mux_asset_id) {
            return {
              ok: false as const,
              message: "El reemplazo expiró. El video anterior continúa disponible.",
              video: await readLessonVideoPresentation(supabase, lessonId),
              replacementFailed: true as const,
            };
          }
          const result = await supabase.from("lesson_videos").update({ status: "errored" })
            .eq("id", video.id).eq("updated_at", video.updated_at).is("mux_asset_id", null).select("id");
          if (result.error) throw result.error;
          if (!result.data?.length) return { ok: false as const, message: "El estado cambió mientras se comprobaba. Vuelve a consultar." };
          return finishReconciliation(
            supabase,
            lessonId,
            "El intento de subida expiró. Ya puedes intentarlo de nuevo.",
          );
        }
        return { ok: false as const, message: "El servicio de video todavía puede estar registrando la subida. Espera unos minutos antes de comprobar otra vez." };
      }
      for (const upload of candidates) {
          const legacy = upload.new_asset_settings?.passthrough === getLessonVideoPassthrough(lessonId);
          if (upload.asset_id) {
            const sync = await syncMuxUpload(supabase, mux, upload);
            if (sync.outcome === "skipped") {
              if (sync.reason === "replacement-processing") {
                return finishReconciliation(
                  supabase,
                  lessonId,
                  "El nuevo video todavía se está procesando.",
                  { replacementPending: true },
                );
              }
              if (sync.reason === "replacement-errored") {
                return {
                  ok: false as const,
                  message: "El reemplazo falló. El video anterior continúa disponible.",
                  video: await readLessonVideoPresentation(supabase, lessonId),
                  replacementFailed: true as const,
                };
              }
              return { ok: false as const, message: "El asset encontrado pertenece a un intento anterior y no se aplicó." };
            }
          }
          else if (legacy) return { ok: false as const, message: "Se encontró un upload antiguo sin asset. No se modificó el intento actual." };
          else if (["errored", "timed_out", "cancelled"].includes(upload.status)) {
            const result = await supabase.from("lesson_videos").update({ status: "errored" })
              .eq("id", video.id).eq("updated_at", video.updated_at);
            if (result.error) throw result.error;
          } else {
            return finishReconciliation(
              supabase,
              lessonId,
              "El nuevo video todavía está esperando el archivo o su procesamiento.",
              { replacementPending: Boolean(video.mux_asset_id) },
            );
          }
      }
    }
    return finishReconciliation(
      supabase,
      lessonId,
      "Estado del procesamiento actualizado.",
    );
  } catch (error) {
    console.error("Mux reconciliation failed", { lessonId, code: typeof error === "object" && error && "code" in error ? error.code : "sync-failed" });
    return { ok: false as const, message: "No se pudo sincronizar. Revisa permisos de lesson_videos y course_lessons en el servidor." };
  }
}

async function getTrustedOrigin() {
  const requestHeaders = await headers();
  const originValue = requestHeaders.get("origin");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const requestHost = (forwardedHost ?? requestHeaders.get("host"))
    ?.split(",", 1)[0]
    .trim();

  if (!originValue || !requestHost) {
    throw new Error("No se pudo validar el origen de la subida.");
  }

  const origin = new URL(originValue);

  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.host !== requestHost
  ) {
    throw new Error("El origen de la subida no es válido.");
  }

  return origin.origin;
}

async function findExactMuxUpload(
  mux: ReturnType<typeof createMuxClient>,
  passthrough: string,
) {
  for (let page = 1; page <= 10; page++) {
    const uploads = await mux.video.uploads.list({ page, limit: 100 });
    const match = uploads.data.find(
      (upload) => upload.new_asset_settings?.passthrough === passthrough,
    );
    if (match) return match;
    if (uploads.data.length < 100) break;
  }

  return null;
}
