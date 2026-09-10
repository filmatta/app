import { createMuxClient, getLessonIdFromPassthrough } from "@/lib/mux/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("MUX_WEBHOOK_SECRET no está configurado.");
    return Response.json({ error: "Webhook no configurado." }, { status: 503 });
  }

  const body = await request.text();
  let event;

  try {
    event = await createMuxClient().webhooks.unwrap(
      body,
      request.headers,
      webhookSecret
    );
  } catch (error) {
    console.error("Webhook de Mux rechazado:", error);
    return Response.json({ error: "Firma inválida." }, { status: 400 });
  }

  if (
    event.type !== "video.asset.created" &&
    event.type !== "video.asset.ready" &&
    event.type !== "video.asset.errored"
  ) {
    return Response.json({ received: true });
  }

  const lessonId = getLessonIdFromPassthrough(event.data.passthrough);

  if (
    !lessonId ||
    (event.data.meta?.external_id && event.data.meta.external_id !== lessonId)
  ) {
    console.error("Asset de Mux sin asociación FILMATTA válida:", event.id);
    return Response.json({ received: true });
  }

  let supabase;

  try {
    supabase = createAdminClient();
  } catch (error) {
    console.error("No se pudo inicializar Supabase para el webhook:", error);
    return Response.json({ error: "Webhook no configurado." }, { status: 503 });
  }

  const { data: video, error: videoError } = await supabase
    .from("lesson_videos")
    .select("lesson_id, mux_asset_id, playback_policy")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (videoError) {
    console.error("Error buscando el video asociado al webhook:", videoError);
    return Response.json({ error: "No se pudo procesar." }, { status: 500 });
  }

  if (!video || (video.mux_asset_id && video.mux_asset_id !== event.data.id)) {
    return Response.json({ received: true });
  }

  const playbackId = event.data.playback_ids?.find(
    (item) => item.policy === video.playback_policy
  )?.id;
  const update =
    event.type === "video.asset.ready"
      ? playbackId
        ? {
            mux_asset_id: event.data.id,
            mux_playback_id: playbackId,
            status: "ready",
          }
        : {
            mux_asset_id: event.data.id,
            mux_playback_id: null,
            status: "errored",
          }
      : event.type === "video.asset.errored"
        ? {
            mux_asset_id: event.data.id,
            mux_playback_id: null,
            status: "errored",
          }
        : {
            mux_asset_id: event.data.id,
            mux_playback_id: playbackId ?? null,
            status: "preparing",
          };

  let updateQuery = supabase
    .from("lesson_videos")
    .update(update)
    .eq("lesson_id", lessonId);

  updateQuery = video.mux_asset_id
    ? updateQuery.eq("mux_asset_id", video.mux_asset_id)
    : updateQuery.is("mux_asset_id", null);

  const { error: updateError } = await updateQuery;

  if (updateError) {
    console.error("Error actualizando el estado del video Mux:", updateError);
    return Response.json({ error: "No se pudo procesar." }, { status: 500 });
  }

  return Response.json({ received: true });
}
