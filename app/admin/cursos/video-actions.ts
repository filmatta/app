"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Asset } from "@mux/mux-node/resources/video/assets";
import type { Upload } from "@mux/mux-node/resources/video/uploads";
import { syncMuxAsset, syncMuxUpload } from "@/lib/mux/sync-asset";
import { presentVideo } from "@/lib/mux/playback";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLearnContentType } from "@/lib/learn/content-type";
import {
  createMuxClient,
  getLessonIdFromPassthrough,
  getLessonVideoPassthrough,
  getMuxErrorStatus,
  getVideoAttemptId,
  isMuxNotFoundError,
} from "@/lib/mux/server";

type AdminSupabaseClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
const FAILED_UPLOAD_GRACE_MS = 5 * 60 * 1000;

function readMuxErrorStatus(error: unknown) {
  return getMuxErrorStatus(error);
}

type MuxErrorDetails = {
  status: number | null;
  type: string | null;
  messages: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeMuxMessage(value: unknown) {
  if (typeof value !== "string") return null;

  const message = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/\s+/g, " ")
    .trim();

  return message ? message.slice(0, 500) : null;
}

function readMuxErrorDetails(error: unknown): MuxErrorDetails {
  const status = readMuxErrorStatus(error);
  if (!isRecord(error) || !isRecord(error.error)) {
    return { status, type: null, messages: [] };
  }

  const payload = isRecord(error.error.error)
    ? error.error.error
    : error.error;
  const type = typeof payload.type === "string" ? payload.type : null;
  const rawMessages = Array.isArray(payload.messages)
    ? payload.messages
    : [payload.message];
  const messages = rawMessages
    .map(sanitizeMuxMessage)
    .filter((message): message is string => Boolean(message));

  return { status, type, messages };
}

function muxUploadCreationMessage(details: MuxErrorDetails) {
  if (details.status === 401) {
    return "Mux rechazó las credenciales configuradas para crear la subida.";
  }

  if (details.status === 403) {
    return "Mux no permitió crear la subida. Revisa el permiso Video Write del entorno.";
  }

  const assetLimit = details.messages
    .map((message) => message.match(/free plan is limited to (\d+) assets/i))
    .find((match) => match !== null)?.[1];
  if (details.status === 400 && assetLimit) {
    return `Mux alcanzó el límite de ${assetLimit} assets del plan Free. Libera espacio en ese environment o amplía el plan antes de volver a subir.`;
  }

  if (details.status === 400 && details.messages[0]) {
    return `Mux rechazó la configuración de la subida: ${details.messages[0]}`;
  }

  if (details.status) {
    return `Mux rechazó la creación de la subida (HTTP ${details.status}).`;
  }

  return "No se pudo conectar con Mux para crear la subida.";
}

function muxAssetVerificationMessage(status: number | null) {
  if (status === 401) {
    return "No se pudo validar el video: las credenciales del servicio no son válidas.";
  }
  if (status === 403) {
    return "No se pudo validar el video: faltan permisos en el servicio.";
  }
  if (status === 429) {
    return "El servicio está recibiendo demasiadas solicitudes. Inténtalo de nuevo en unos minutos.";
  }
  if (status && status >= 500) {
    return "El servicio de video no está disponible temporalmente. Inténtalo de nuevo más tarde.";
  }
  return "No se pudo validar el video actual. Conservamos su referencia para evitar pérdida de datos.";
}

function getSecureDirectUploadUrl(upload: Upload) {
  if (!upload.id || !upload.url) return null;

  try {
    const uploadUrl = new URL(upload.url);
    return uploadUrl.protocol === "https:" ? upload.url : null;
  } catch {
    return null;
  }
}

async function cancelUnusedMuxUpload(
  mux: ReturnType<typeof createMuxClient>,
  upload: Upload,
  reason: string,
) {
  if (upload.status !== "waiting") return;

  try {
    await mux.video.uploads.cancel(upload.id);
  } catch (error) {
    console.error("Mux Direct Upload cleanup failed", {
      uploadId: upload.id,
      reason,
      type: error instanceof Error ? error.name : "unknown",
      status: readMuxErrorStatus(error),
    });
  }
}

type RestorableLessonVideo = {
  id: string;
  status: string;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  playback_policy: string;
};

type StoredLessonVideo = RestorableLessonVideo & {
  lesson_id: string;
  updated_at: string;
  created_at: string;
};

async function repairOrphanedVideoReference(
  supabase: AdminSupabaseClient,
  video: StoredLessonVideo,
) {
  if (
    video.status !== "ready" ||
    !video.mux_asset_id ||
    !video.mux_playback_id
  ) {
    return { repaired: false as const, video };
  }

  console.warn("Orphaned lesson video reference detected", {
    lessonId: video.lesson_id,
    attemptId: video.id,
    assetId: video.mux_asset_id,
  });

  const repaired = await supabase
    .from("lesson_videos")
    .update({
      mux_asset_id: null,
      mux_playback_id: null,
      status: "errored",
    })
    .eq("id", video.id)
    .eq("lesson_id", video.lesson_id)
    .eq("mux_asset_id", video.mux_asset_id)
    .eq("mux_playback_id", video.mux_playback_id)
    .eq("status", "ready")
    .eq("updated_at", video.updated_at)
    .select(
      "id, lesson_id, status, mux_asset_id, mux_playback_id, playback_policy, updated_at, created_at",
    )
    .maybeSingle();

  if (repaired.error) throw repaired.error;
  if (!repaired.data) return { repaired: false as const, video };

  const { data: current, error: currentError } = await supabase
    .from("lesson_videos")
    .select(
      "id, lesson_id, status, mux_asset_id, mux_playback_id, playback_policy, updated_at, created_at",
    )
    .eq("id", repaired.data.id)
    .eq("lesson_id", video.lesson_id)
    .maybeSingle();

  if (currentError) throw currentError;
  if (
    !current ||
    current.status !== "errored" ||
    current.mux_asset_id !== null ||
    current.mux_playback_id !== null
  ) {
    return { repaired: false as const, video: current ?? video };
  }

  console.warn("Orphaned lesson video reference repaired", {
    lessonId: video.lesson_id,
    attemptId: video.id,
    assetId: video.mux_asset_id,
  });
  revalidatePath("/admin/cursos/[id]", "page");
  revalidatePath("/cursos/[slug]/lecciones/[lessonSlug]", "page");
  return { repaired: true as const, video: current };
}

async function restoreActiveVideoAttempt(
  supabase: AdminSupabaseClient,
  mux: ReturnType<typeof createMuxClient>,
  lessonId: string,
  attemptId: string,
  video: RestorableLessonVideo,
) {
  if (
    video.status !== "ready" ||
    !video.mux_asset_id ||
    !video.mux_playback_id
  ) {
    return {
      ok: false as const,
      message: "No se pudo restaurar con seguridad el video anterior.",
    };
  }

  try {
    const currentAsset = await mux.video.assets.retrieve(video.mux_asset_id);
    const assetLessonId = getLessonIdFromPassthrough(currentAsset.passthrough);
    const previousVideoId = getVideoAttemptId(currentAsset.passthrough);
    const assetCreatedAt = Number(currentAsset.created_at);
    const activePlaybackMatches = currentAsset.playback_ids?.some(
      (playback) =>
        playback.id === video.mux_playback_id &&
        playback.policy === video.playback_policy,
    );

    if (
      currentAsset.id !== video.mux_asset_id ||
      assetLessonId !== lessonId ||
      !previousVideoId ||
      previousVideoId === attemptId ||
      !Number.isFinite(assetCreatedAt) ||
      !activePlaybackMatches
    ) {
      return {
        ok: false as const,
        message: "No se pudo restaurar con seguridad el video anterior.",
      };
    }

    getLessonVideoPassthrough(lessonId, previousVideoId);
    const previousCreatedAt = new Date(assetCreatedAt * 1000).toISOString();
    const restored = await supabase
      .from("lesson_videos")
      .update({
        id: previousVideoId,
        created_at: previousCreatedAt,
      })
      .eq("id", attemptId)
      .eq("lesson_id", lessonId)
      .eq("status", "ready")
      .eq("mux_asset_id", video.mux_asset_id)
      .eq("mux_playback_id", video.mux_playback_id)
      .select("id");

    if (restored.error || restored.data?.length !== 1) {
      console.error("Error restaurando el video anterior", {
        lessonId,
        attemptId,
        code: restored.error?.code ?? "stale-attempt",
      });
      return {
        ok: false as const,
        message:
          "El intento se canceló, pero no se pudo restaurar el estado anterior.",
      };
    }
  } catch (error) {
    console.error("Error validando el asset anterior de Mux", {
      lessonId,
      attemptId,
      type: error instanceof Error ? error.name : "unknown",
      status: readMuxErrorStatus(error),
    });
    return {
      ok: false as const,
      message: "No se pudo validar el video anterior antes de restaurarlo.",
    };
  }

  return { ok: true as const };
}

async function closeFailedUploadAttempt(
  supabase: AdminSupabaseClient,
  mux: ReturnType<typeof createMuxClient>,
  lessonId: string,
  upload: Upload,
) {
  const passthrough = upload.new_asset_settings?.passthrough;
  const attemptId = getVideoAttemptId(passthrough);
  const uploadLessonId = getLessonIdFromPassthrough(passthrough);
  const externalId = upload.new_asset_settings?.meta?.external_id;

  if (
    !attemptId ||
    uploadLessonId !== lessonId ||
    (externalId && externalId !== lessonId)
  ) {
    return {
      ok: false as const,
      message: "La subida no pertenece al intento activo de esta lección.",
    };
  }

  const { data: video, error: videoError } = await supabase
    .from("lesson_videos")
    .select(
      "id, status, mux_asset_id, mux_playback_id, playback_policy",
    )
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (videoError || !video || video.id !== attemptId) {
    console.error("Error validando la reserva fallida de video", {
      lessonId,
      attemptId,
      uploadId: upload.id,
      code: videoError?.code ?? "stale-attempt",
    });
    return {
      ok: false as const,
      message: "El estado del video cambió antes de poder cerrar la subida fallida.",
    };
  }

  if (
    upload.asset_id ||
    upload.status === "asset_created" ||
    !["waiting", "errored", "timed_out", "cancelled"].includes(upload.status)
  ) {
    return {
      ok: false as const,
      message:
        "Mux alcanzó a recibir el archivo. Comprueba el estado antes de iniciar otro intento.",
    };
  }

  if (upload.status === "waiting") {
    try {
      await mux.video.uploads.cancel(upload.id);
    } catch (error) {
      console.error("Error cancelando el Direct Upload fallido", {
        lessonId,
        attemptId,
        uploadId: upload.id,
        type: error instanceof Error ? error.name : "unknown",
        status: readMuxErrorStatus(error),
      });
      return {
        ok: false as const,
        message: "No se pudo cerrar de forma segura la subida fallida.",
      };
    }
  }

  const replacing = Boolean(
    video.status === "ready" &&
      video.mux_asset_id &&
      video.mux_playback_id,
  );

  if (replacing) {
    return restoreActiveVideoAttempt(
      supabase,
      mux,
      lessonId,
      attemptId,
      video,
    );
  } else {
    const failed = await supabase
      .from("lesson_videos")
      .update({ status: "errored" })
      .eq("id", attemptId)
      .eq("lesson_id", lessonId)
      .is("mux_asset_id", null)
      .is("mux_playback_id", null)
      .select("id");

    if (failed.error || failed.data?.length !== 1) {
      console.error("Error marcando la subida como fallida", {
        lessonId,
        attemptId,
        uploadId: upload.id,
        code: failed.error?.code ?? "stale-attempt",
      });
      return {
        ok: false as const,
        message: "El intento se canceló, pero no se pudo actualizar su estado.",
      };
    }
  }

  return { ok: true as const };
}

async function readLessonVideoPresentation(
  supabase: AdminSupabaseClient,
  lessonId: string,
) {
  const { data, error } = await supabase
    .from("lesson_videos")
    .select("id, lesson_id, status, playback_policy, mux_playback_id, mux_asset_id, created_at, updated_at")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo consultar el estado del video.");
  }

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
          ...(await presentVideo(data)),
          replacementPending: true,
          policyCoherent,
        };
      }
      return {
        ...(await presentVideo(data)),
        replacementPending: false,
        policyCoherent,
      };
    } catch (error) {
      if (isMuxNotFoundError(error)) {
        const repaired = await repairOrphanedVideoReference(supabase, data);
        if (repaired.repaired) {
          return {
            status: "none" as const,
            orphanRepaired: true,
          };
        }

        return {
          status: "unavailable" as const,
          message: "El estado del video cambió. Vuelve a comprobarlo.",
        };
      }

      console.warn("Lesson video verification deferred", {
        lessonId,
        assetId: data.mux_asset_id,
        status: readMuxErrorStatus(error),
        type: error instanceof Error ? error.name : "unknown",
      });
      return {
        ...(await presentVideo(data)),
        verificationDeferred: true,
      };
    }
  }

  return presentVideo(data);
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

  const { data: loadedVideo, error: videoError } = await supabase
    .from("lesson_videos")
    .select("id, lesson_id, status, mux_asset_id, mux_playback_id, playback_policy, updated_at, created_at")
    .eq("lesson_id", lesson.id)
    .maybeSingle();

  if (videoError) {
    console.error("Error cargando el video de la lección:", videoError);
    return { ok: false as const, message: "No pudimos preparar la subida." };
  }

  let currentVideo = loadedVideo;
  let effectiveReplacement = replaceExisting;
  let orphanRepaired = false;
  let currentAsset: Asset | null = null;

  let mux: ReturnType<typeof createMuxClient>;
  let origin: string;
  try {
    origin = await getTrustedOrigin();
    mux = createMuxClient();
  } catch {
    return { ok: false as const, message: "Revisa la configuración del servicio de video y el origen de la aplicación antes de subir." };
  }

  if (
    currentVideo?.status === "ready" &&
    currentVideo.mux_asset_id &&
    currentVideo.mux_playback_id
  ) {
    try {
      currentAsset = await mux.video.assets.retrieve(currentVideo.mux_asset_id);
      const currentPlaybackMatches = currentAsset.playback_ids?.some(
        (playback) =>
          playback.id === currentVideo?.mux_playback_id &&
          playback.policy === currentVideo?.playback_policy,
      );
      if (
        getLessonIdFromPassthrough(currentAsset.passthrough) !== lessonId ||
        (currentAsset.meta?.external_id &&
          currentAsset.meta.external_id !== lessonId) ||
        !currentPlaybackMatches
      ) {
        return {
          ok: false as const,
          message: "La referencia del video actual no coincide con esta lección. Comprueba su estado antes de reemplazarlo.",
        };
      }
    } catch (error) {
      if (!isMuxNotFoundError(error)) {
        return {
          ok: false as const,
          message: muxAssetVerificationMessage(readMuxErrorStatus(error)),
        };
      }

      const pendingUpload = await findExactMuxUpload(
        mux,
        getLessonVideoPassthrough(lessonId, currentVideo.id),
      );
      const pendingDifferentAsset = Boolean(
        pendingUpload &&
        !["errored", "timed_out", "cancelled"].includes(pendingUpload.status) &&
        (!pendingUpload.asset_id ||
          pendingUpload.asset_id !== currentVideo.mux_asset_id),
      );
      if (pendingUpload && pendingDifferentAsset) {
        if (pendingUpload.asset_id) {
          await syncMuxUpload(supabase, mux, pendingUpload);
        }
        return {
          ok: false as const,
          message: "Ya existe una subida activa para esta lección. Espera a que termine de procesarse.",
        };
      }

      const repaired = await repairOrphanedVideoReference(
        supabase,
        currentVideo,
      );
      if (!repaired.repaired) {
        return {
          ok: false as const,
          message: "El estado del video cambió mientras se reparaba. Vuelve a intentarlo.",
        };
      }
      currentVideo = repaired.video;
      effectiveReplacement = false;
      orphanRepaired = true;
    }
  }

  if (isQuickGuide && currentVideo?.playback_policy !== undefined && currentVideo.playback_policy !== "signed") {
    return {
      ok: false as const,
      message: "Esta guía necesita completar primero su transición a reproducción protegida.",
    };
  }

  if (currentVideo?.status === "ready" && !effectiveReplacement) {
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

  if (effectiveReplacement && currentVideo?.status !== "ready") {
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
  if (
    effectiveReplacement &&
    currentAsset &&
    currentVideo?.mux_asset_id &&
    currentVideo.mux_playback_id
  ) {
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
  }

  let upload: Upload;
  let uploadUrl: string;
  try {
    upload = await mux.video.uploads.create({
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

    const secureUploadUrl = getSecureDirectUploadUrl(upload);
    if (!secureUploadUrl) {
      await cancelUnusedMuxUpload(mux, upload, "invalid-upload-url");
      return {
        ok: false as const,
        message: "Mux creó una sesión de subida incompleta o no segura.",
        orphanRepaired,
      };
    }
    uploadUrl = secureUploadUrl;
  } catch (error) {
    const details = readMuxErrorDetails(error);
    console.error("Error creando el Direct Upload de Mux", {
      lessonId,
      type: error instanceof Error ? error.name : "unknown",
      status: details.status,
      muxErrorType: details.type,
      muxMessages: details.messages,
      corsOrigin: origin,
      playbackPolicies: [playbackPolicy],
      passthroughLength: passthrough.length,
      hasExternalId: true,
    });

    return {
      ok: false as const,
      message: muxUploadCreationMessage(details),
      orphanRepaired,
    };
  }

  const reservedAt = new Date().toISOString();
  const reserved = currentVideo
    ? currentVideo.status === "ready"
      ? await supabase
          .from("lesson_videos")
          .update({
            id: attemptId,
            created_at: reservedAt,
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
          created_at: reservedAt,
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
    await cancelUnusedMuxUpload(mux, upload, "reservation-conflict");
    return {
      ok: false as const,
      message: "Ya existe otra subida activa para esta lección.",
      orphanRepaired,
    };
  }

  return {
    ok: true as const,
    uploadUrl,
    uploadId: upload.id,
    attemptId,
    replacement: effectiveReplacement,
    previousAssetAvailable: effectiveReplacement && Boolean(currentAsset),
  };
}

export async function markLessonVideoUploadFailed({
  lessonId,
  uploadId,
  attemptId,
}: {
  lessonId: string;
  uploadId: string;
  attemptId: string;
}) {
  const { supabase } = await requireAdmin();
  let expectedPassthrough: string;

  try {
    expectedPassthrough = getLessonVideoPassthrough(lessonId, attemptId);
  } catch {
    return { ok: false as const, message: "La subida no tiene una asociación válida." };
  }

  if (!uploadId || uploadId.length > 200) {
    return { ok: false as const, message: "La subida no tiene un identificador válido." };
  }

  let mux: ReturnType<typeof createMuxClient>;
  let upload: Upload;
  try {
    mux = createMuxClient();
    upload = await mux.video.uploads.retrieve(uploadId);
    const passthrough = upload.new_asset_settings?.passthrough;
    const externalId = upload.new_asset_settings?.meta?.external_id;

    if (
      upload.id !== uploadId ||
      passthrough !== expectedPassthrough ||
      (externalId && externalId !== lessonId)
    ) {
      return {
        ok: false as const,
        message: "La subida no pertenece al intento activo de esta lección.",
      };
    }

  } catch (error) {
    console.error("Error cerrando el Direct Upload fallido", {
      lessonId,
      attemptId,
      uploadId,
      type: error instanceof Error ? error.name : "unknown",
      status: readMuxErrorStatus(error),
    });
    return {
      ok: false as const,
      message: "No se pudo cerrar de forma segura la subida fallida.",
    };
  }

  const closed = await closeFailedUploadAttempt(
    supabase,
    mux,
    lessonId,
    upload,
  );
  if (!closed.ok) return closed;

  revalidatePath("/admin/cursos/[id]", "page");
  return {
    ok: true as const,
    video: await readLessonVideoPresentation(supabase, lessonId),
  };
}

export async function getLessonVideoState(
  lessonId: string,
  uploadId?: string,
  attemptId?: string,
  discoverReplacement = false,
) {
  const { supabase } = await requireAdmin();
  getLessonVideoPassthrough(lessonId);
  let trackedUploadId = uploadId;
  let trackedAttemptId = attemptId;
  let trackedUploadStatus: Upload["status"] | null = null;
  let replacementFailed = false;
  let initialUploadFailed = false;
  let trackedUploadResolved = false;

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
          trackedAttemptId = exactUpload ? video.id : undefined;
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
      trackedUploadStatus = upload.status;
      const uploadLessonId = getLessonIdFromPassthrough(
        upload.new_asset_settings?.passthrough,
      );
      const uploadAttemptId = getVideoAttemptId(
        upload.new_asset_settings?.passthrough,
      );
      if (
        uploadLessonId !== lessonId ||
        !uploadAttemptId ||
        (trackedAttemptId && uploadAttemptId !== trackedAttemptId)
      ) {
        throw new Error("Mux upload association mismatch.");
      }
      trackedAttemptId = uploadAttemptId;
      const { data: attemptVideo, error: attemptError } = await supabase
        .from("lesson_videos")
        .select("id, status, mux_asset_id, mux_playback_id, playback_policy")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (attemptError) throw attemptError;
      const wasReplacement = Boolean(
        attemptVideo?.id === uploadAttemptId &&
        attemptVideo.status === "ready" &&
        attemptVideo.mux_asset_id &&
        attemptVideo.mux_playback_id,
      );
      const result = await syncMuxUpload(supabase, mux, upload);
      const terminalUploadFailure = result.outcome === "failed";
      const replacementAssetFailure =
        result.outcome === "skipped" &&
        result.reason === "replacement-errored";

      if (terminalUploadFailure) {
        const closed = await closeFailedUploadAttempt(
          supabase,
          mux,
          lessonId,
          upload,
        );
        if (!closed.ok) throw new Error(closed.message);
      } else if (
        replacementAssetFailure &&
        wasReplacement &&
        attemptVideo &&
        trackedAttemptId
      ) {
        const restored = await restoreActiveVideoAttempt(
          supabase,
          mux,
          lessonId,
          trackedAttemptId,
          attemptVideo,
        );
        if (!restored.ok) throw new Error(restored.message);
      }

      replacementFailed =
        wasReplacement && (terminalUploadFailure || replacementAssetFailure);
      initialUploadFailed =
        !wasReplacement &&
        (terminalUploadFailure ||
          ("status" in result && result.status === "errored"));
      trackedUploadResolved =
        (result.outcome === "updated" || result.outcome === "unchanged") &&
        result.status === "ready";
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
    initialUploadFailed,
    trackedUploadId,
    trackedAttemptId,
    trackedUploadStatus,
    trackedUploadResolved,
  };
}

export async function reconcileLessonVideo(lessonId: string) {
  const { supabase } = await requireAdmin();
  getLessonVideoPassthrough(lessonId);
  const { data: video, error } = await supabase.from("lesson_videos")
    .select("id, lesson_id, mux_asset_id, mux_playback_id, playback_policy, status, updated_at, created_at").eq("lesson_id", lessonId).maybeSingle();
  if (error || !video) return { ok: false as const, message: "No se pudo consultar el registro de video." };
  try {
    const mux = createMuxClient();
    let needsUploadLookup = !video.mux_asset_id;
    if (video.mux_asset_id) {
      try {
        const currentAsset = await mux.video.assets.retrieve(video.mux_asset_id);
        if (getVideoAttemptId(currentAsset.passthrough) === video.id) {
          await syncMuxAsset(supabase, currentAsset);
        } else {
          needsUploadLookup = true;
        }
      } catch (assetError) {
        if (!isMuxNotFoundError(assetError)) throw assetError;

        const exactUpload = await findExactMuxUpload(
          mux,
          getLessonVideoPassthrough(lessonId, video.id),
        );
        const validReplacement = Boolean(
          exactUpload &&
          !["errored", "timed_out", "cancelled"].includes(exactUpload.status) &&
          (!exactUpload.asset_id || exactUpload.asset_id !== video.mux_asset_id),
        );
        if (exactUpload && validReplacement) {
          if (exactUpload.asset_id) {
            await syncMuxUpload(supabase, mux, exactUpload);
          }
          return finishReconciliation(
            supabase,
            lessonId,
            "El nuevo video todavía se está procesando.",
            { replacementPending: true },
          );
        }

        const repaired = await repairOrphanedVideoReference(
          supabase,
          video,
        );
        if (!repaired.repaired) {
          return {
            ok: false as const,
            message: "El estado cambió mientras se reparaba. Comprueba otra vez.",
          };
        }
        return finishReconciliation(
          supabase,
          lessonId,
          "La referencia del video ya no existía y se reparó. Ya puedes subir uno nuevo.",
        );
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
        const attemptAge = Date.now() - Date.parse(video.created_at);
        const expired = video.mux_asset_id
          ? attemptAge > FAILED_UPLOAD_GRACE_MS
          : attemptAge > 60 * 60 * 1000;
        if (expired) {
          if (video.mux_asset_id) {
            const restored = await restoreActiveVideoAttempt(
              supabase,
              mux,
              lessonId,
              video.id,
              video,
            );
            if (!restored.ok) {
              return {
                ...restored,
                video: await readLessonVideoPresentation(supabase, lessonId),
                replacementFailed: true as const,
              };
            }
            return finishReconciliation(
              supabase,
              lessonId,
              "El reemplazo no llegó a Mux. Se restauró el video anterior y ya puedes intentarlo de nuevo.",
            );
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
          else if (
            ["waiting", "errored", "timed_out", "cancelled"].includes(
              upload.status,
            )
          ) {
            const attemptAge = Date.now() - Date.parse(video.created_at);
            if (
              upload.status === "waiting" &&
              attemptAge < FAILED_UPLOAD_GRACE_MS
            ) {
              return {
                ok: false as const,
                message:
                  "Mux todavía está confirmando la recepción del archivo. Espera unos minutos antes de cerrar el intento.",
                video: await readLessonVideoPresentation(supabase, lessonId),
              };
            }
            const closed = await closeFailedUploadAttempt(
              supabase,
              mux,
              lessonId,
              upload,
            );
            if (!closed.ok) return closed;
            return finishReconciliation(
              supabase,
              lessonId,
              upload.status === "waiting"
                ? "Mux no recibió el archivo. La sesión se cerró y ya puedes intentarlo de nuevo."
                : "La subida fallida se cerró y ya puedes intentarlo de nuevo.",
            );
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
