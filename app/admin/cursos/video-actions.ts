"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createMuxClient,
  getLessonVideoPassthrough,
} from "@/lib/mux/server";

export async function createLessonVideoUpload(lessonId: string) {
  const { supabase } = await requireAdmin();
  let passthrough: string;

  try {
    passthrough = getLessonVideoPassthrough(lessonId);
  } catch {
    return { ok: false as const, message: "La lección no es válida." };
  }

  const { data: lesson, error: lessonError } = await supabase
    .from("course_lessons")
    .select("id, title, is_preview")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    console.error("Error validando la lección para Mux:", lessonError);
    return { ok: false as const, message: "No encontramos esta lección." };
  }

  const { data: currentVideo, error: videoError } = await supabase
    .from("lesson_videos")
    .select("id, status")
    .eq("lesson_id", lesson.id)
    .maybeSingle();

  if (videoError) {
    console.error("Error cargando el video de la lección:", videoError);
    return { ok: false as const, message: "No pudimos preparar la subida." };
  }

  if (currentVideo && currentVideo.status !== "errored") {
    return {
      ok: false as const,
      message:
        currentVideo.status === "ready"
          ? "Esta lección ya tiene un video listo."
          : "Ya hay un video procesándose para esta lección.",
    };
  }

  const playbackPolicy = lesson.is_preview ? "public" : "signed";
  const reserved = currentVideo
    ? await supabase
        .from("lesson_videos")
        .update({
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
    const origin = await getTrustedOrigin();
    const mux = createMuxClient();
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

    return { ok: true as const, uploadUrl: upload.url };
  } catch (error) {
    console.error("Error creando el Direct Upload de Mux:", error);
    await supabase
      .from("lesson_videos")
      .update({ status: "errored" })
      .eq("id", reserved.data.id)
      .is("mux_asset_id", null);

    return {
      ok: false as const,
      message: "No pudimos iniciar la subida a Mux. Inténtalo de nuevo.",
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

  const { error } = await supabase
    .from("lesson_videos")
    .update({ status: "errored" })
    .eq("lesson_id", lessonId)
    .eq("status", "preparing")
    .is("mux_asset_id", null);

  if (error) {
    console.error("Error registrando la subida fallida:", error);
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
